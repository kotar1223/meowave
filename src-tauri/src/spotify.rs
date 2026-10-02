//! Spotify sign-in over Authorization Code with PKCE.
//!
//! PKCE and not the plain authorization code flow: a desktop app cannot keep a
//! client secret, so there is none here. The verifier is generated per attempt,
//! never leaves the process, and the code Spotify hands back is worthless
//! without it.
//!
//! The redirect lands on a local server rather than a custom URL scheme. A
//! scheme has to be registered with the OS, breaks in portable builds, and
//! fails silently when another app claims it; a loopback listener works the
//! moment the app is running and is what Spotify documents for desktop clients.

use base64::Engine;
use rand::Rng;
use serde::Serialize;
use sha2::{Digest, Sha256};

/// Application id from the Spotify dashboard.
///
/// Read from the environment (`.env` beside the executable, same file as the
/// Supabase keys) rather than compiled in: a client id is not a secret, but it
/// identifies *our* registration, and the redirect URI registered against it
/// must match REDIRECT_URI exactly — port and path included. Without it the
/// commands below report "not configured" instead of failing deep inside the
/// token exchange.
fn client_id() -> Option<String> {
    if let Ok(Some(tok)) = crate::tokens::read_token("sp_client_id") {
        let trimmed = tok.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    std::env::var("SPOTIFY_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn spotify_get_client_id() -> Result<Option<String>, String> {
    Ok(client_id())
}

#[tauri::command]
pub fn spotify_set_client_id(client_id: String) -> Result<(), String> {
    let cid = client_id.trim();
    if cid.is_empty() {
        let _ = crate::tokens::delete_service_token("sp_client_id".into());
    } else {
        crate::tokens::set_service_token("sp_client_id".into(), cid.to_string())?;
    }
    Ok(())
}

pub fn configured() -> bool {
    client_id().is_some()
}

const REDIRECT_URI: &str = "http://localhost:8080/callback";
const CALLBACK_PORT: u16 = 8080;

/// Only what the player actually needs. Asking for more turns the consent
/// screen into a wall of permissions and gets the app rejected on review.
const SCOPES: &str = "user-read-private user-read-email playlist-read-private \
                      playlist-read-collaborative user-library-read \
                      user-top-read user-read-recently-played";

/// How long to wait for the user to finish in the browser before giving up and
/// freeing the port. Without a bound, an abandoned sign-in would hold 8080 for
/// the lifetime of the process.
const AUTH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

#[derive(Serialize)]
pub struct SpotifyAccount {
    pub id: String,
    pub name: String,
    pub email: String,
    pub avatar: Option<String>,
    pub product: String,
}

/// The token set as it is stored in the keychain.
#[derive(serde::Serialize, serde::Deserialize)]
struct Stored {
    access: String,
    refresh: String,
    /// Unix seconds. Stored as an absolute instant rather than the
    /// `expires_in` Spotify returns, because a duration is meaningless after
    /// the app has been closed for a day.
    expires: u64,
}

fn now() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

/// A verifier and its challenge.
///
/// The verifier is 64 bytes from the OS CSPRNG, base64url-encoded — well inside
/// the 43..128 character range the spec requires, and not derived from anything
/// guessable such as a timestamp. `ThreadRng` is the CSPRNG here, not the fast
/// PRNG: this value is the only thing standing between a leaked redirect and a
/// stolen token.
fn pkce() -> (String, String) {
    let mut raw = [0u8; 64];
    rand::thread_rng().fill(&mut raw[..]);
    let verifier = b64url(&raw);
    let challenge = b64url(&Sha256::digest(verifier.as_bytes()));
    (verifier, challenge)
}

/// Random state, checked when the callback arrives.
///
/// Without it the loopback listener would accept a code from any page that
/// happened to hit localhost:8080 while sign-in was open.
fn state_token() -> String {
    let mut raw = [0u8; 24];
    rand::thread_rng().fill(&mut raw[..]);
    b64url(&raw)
}

/// The page the browser lands on once the code is captured.
///
/// Inlined rather than served from a file: this has to render after the app
/// directory may already be read-only, and a missing asset would leave the user
/// staring at a blank tab wondering whether it worked.
fn done_page(ok: bool) -> String {
    let (title, body) = if ok {
        ("Авторизация успешна", "Можете закрыть это окно и вернуться в Meowave.")
    } else {
        ("Не удалось авторизоваться", "Вернитесь в Meowave и попробуйте ещё раз.")
    };
    format!(
        r#"<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Meowave</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{{box-sizing:border-box}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;
  background:#0b0b0d;color:#f4f4f5;
  font:400 15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}}
.card{{max-width:420px;padding:44px 40px;text-align:center;
  background:#141417;border:1px solid #26262b;border-radius:20px;
  box-shadow:0 24px 60px rgb(0 0 0 / .5);
  animation:in .5s cubic-bezier(.16,1,.3,1) both}}
@keyframes in{{from{{opacity:0;transform:translateY(12px) scale(.98)}}}}
.dot{{width:52px;height:52px;margin:0 auto 22px;border-radius:50%;
  display:grid;place-items:center;
  background:{ring}}}
.dot svg{{width:26px;height:26px;stroke:#0b0b0d;stroke-width:3;
  fill:none;stroke-linecap:round;stroke-linejoin:round}}
h1{{margin:0 0 10px;font-size:1.25rem;font-weight:550;letter-spacing:-.01em}}
p{{margin:0;color:#a1a1aa;font-size:.92rem}}
.brand{{margin-top:26px;font-size:.72rem;letter-spacing:.14em;
  text-transform:uppercase;color:#52525b}}
</style></head><body><div class="card">
<div class="dot"><svg viewBox="0 0 24 24">{icon}</svg></div>
<h1>{title}</h1><p>{body}</p><div class="brand">Meowave</div>
</div></body></html>"#,
        ring = if ok { "#1db954" } else { "#f87171" },
        icon = if ok {
            r#"<path d="M4 12.5l5.5 5.5L20 7"/>"#
        } else {
            r#"<path d="M6 6l12 12M18 6L6 18"/>"#
        },
        title = title,
        body = body
    )
}

/// Runs the loopback listener until the callback arrives.
///
/// Blocking and on its own thread: tiny_http is synchronous, and the alternative
/// — pulling axum and a second async stack in just for one request — is a lot of
/// dependency for a server that exists for about ten seconds.
///
/// The listener is bound before the browser opens, so a fast redirect cannot
/// arrive before anything is listening.
fn wait_for_code(server: tiny_http::Server, state: String) -> Result<String, String> {
    let deadline = std::time::Instant::now() + AUTH_TIMEOUT;

    loop {
        let left = deadline.saturating_duration_since(std::time::Instant::now());
        if left.is_zero() {
            return Err("время ожидания истекло — попробуйте войти ещё раз".into());
        }

        // recv_timeout rather than recv: the browser may never come back, and
        // an abandoned attempt must not hold the port forever.
        let req = match server.recv_timeout(left) {
            Ok(Some(r)) => r,
            Ok(None) => continue,
            Err(e) => return Err(format!("callback server: {e}")),
        };

        let url = req.url().to_string();
        // Anything that is not the callback (favicon requests are guaranteed)
        // gets a 404 and the loop keeps waiting for the real one.
        if !url.starts_with("/callback") {
            let _ = req.respond(tiny_http::Response::empty(404));
            continue;
        }

        let q: std::collections::HashMap<String, String> = url
            .split_once('?')
            .map(|(_, q)| q)
            .unwrap_or("")
            .split('&')
            .filter(|p| !p.is_empty())
            .filter_map(|p| {
                let (k, v) = p.split_once('=')?;
                Some((
                    urlencoding::decode(k).ok()?.into_owned(),
                    urlencoding::decode(v).ok()?.into_owned(),
                ))
            })
            .collect();

        // The user pressed "Cancel" on the consent screen, or Spotify rejected
        // the request outright.
        if let Some(err) = q.get("error") {
            let _ = respond_html(req, &done_page(false));
            return Err(match err.as_str() {
                "access_denied" => "доступ не разрешён".to_string(),
                other => format!("Spotify вернул ошибку: {other}"),
            });
        }

        // Constant-time is overkill for a value that is public in the URL bar,
        // but a mismatch must still abort rather than proceed.
        if q.get("state").map(|s| s.as_str()) != Some(state.as_str()) {
            let _ = respond_html(req, &done_page(false));
            return Err("не совпал state — попробуйте войти ещё раз".into());
        }

        let code = match q.get("code") {
            Some(c) if !c.is_empty() => c.clone(),
            _ => {
                let _ = respond_html(req, &done_page(false));
                return Err("Spotify не вернул код".into());
            }
        };

        // Respond before returning, so the tab shows the confirmation rather
        // than a connection-reset error when the server drops.
        let _ = respond_html(req, &done_page(true));
        // `server` is dropped here, which closes the listener and frees 8080.
        return Ok(code);
    }
}

fn respond_html(req: tiny_http::Request, html: &str) -> Result<(), std::io::Error> {
    let mut resp = tiny_http::Response::from_string(html);
    resp.add_header(
        tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..])
            .expect("static header"),
    );
    req.respond(resp)
}

/// Exchanges the authorisation code for a token pair.
///
/// Form-encoded and unauthenticated apart from client_id: PKCE clients have no
/// secret, so there is no Basic auth header here. Sending one would make
/// Spotify reject the request.
async fn exchange(code: &str, verifier: &str) -> Result<Stored, String> {
    let cid = client_id().ok_or("не задан Client ID Spotify")?;
    let resp = crate::api::client()?
        .post("https://accounts.spotify.com/api/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", cid.as_str()),
            ("code_verifier", verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("token request failed: {e}"))?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        // Spotify's own description is more useful than the status code: a bad
        // CLIENT_ID and a mismatched redirect URI both come back as 400.
        let msg = body
            .get("error_description")
            .and_then(|v| v.as_str())
            .or_else(|| body.get("error").and_then(|v| v.as_str()))
            .unwrap_or("unknown error");
        return Err(format!("Spotify: {msg}"));
    }

    Ok(Stored {
        access: body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or("no access_token in response")?
            .to_string(),
        refresh: body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        expires: now()
            + body
                .get("expires_in")
                .and_then(|v| v.as_u64())
                .unwrap_or(3600),
    })
}

/// Trades the refresh token for a fresh access token.
///
/// Spotify may or may not return a new refresh token; when it does not, the old
/// one stays valid and must be kept. Dropping it here would force a full
/// browser sign-in an hour later.
async fn refresh(stored: &Stored) -> Result<Stored, String> {
    if stored.refresh.is_empty() {
        return Err("no refresh token".into());
    }
    let cid = client_id().ok_or("не задан Client ID Spotify")?;
    let resp = crate::api::client()?
        .post("https://accounts.spotify.com/api/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", stored.refresh.as_str()),
            ("client_id", cid.as_str()),
        ])
        .send()
        .await
        .map_err(|e| format!("refresh failed: {e}"))?;

    if !resp.status().is_success() {
        return Err("сессия Spotify истекла — войдите заново".into());
    }
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(Stored {
        access: body
            .get("access_token")
            .and_then(|v| v.as_str())
            .ok_or("no access_token")?
            .to_string(),
        refresh: body
            .get("refresh_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or(&stored.refresh)
            .to_string(),
        expires: now()
            + body
                .get("expires_in")
                .and_then(|v| v.as_u64())
                .unwrap_or(3600),
    })
}

fn load_stored() -> Option<Stored> {
    let raw = crate::tokens::get_service_token("sp".into()).ok()??;
    serde_json::from_str(&raw).ok()
}

fn save_stored(s: &Stored) -> Result<(), String> {
    let raw = serde_json::to_string(s).map_err(|e| e.to_string())?;
    crate::tokens::set_service_token("sp".into(), raw)
}

/// A valid access token, refreshed if it is about to expire.
///
/// The 60-second margin matters: a token that passes the check and then expires
/// mid-request produces a 401 that looks like a broken sign-in rather than
/// ordinary expiry.
pub async fn access_token() -> Result<String, String> {
    let stored = load_stored().ok_or("not signed in")?;
    if stored.expires > now() + 60 {
        return Ok(stored.access);
    }
    let fresh = refresh(&stored).await?;
    save_stored(&fresh)?;
    Ok(fresh.access)
}

/// Full sign-in: PKCE, browser, loopback callback, token exchange.
#[tauri::command]
pub async fn spotify_login() -> Result<SpotifyAccount, String> {
    let cid = client_id().ok_or("не задан Client ID Spotify")?;

    let (verifier, challenge) = pkce();
    let state = state_token();

    // Bind first. If the port is taken — another sign-in already open, or an
    // unrelated dev server — say so instead of opening a browser that will
    // redirect into nothing.
    let server = tiny_http::Server::http(("127.0.0.1", CALLBACK_PORT))
        .map_err(|_| format!("порт {CALLBACK_PORT} занят — закройте программу, которая его использует"))?;

    let url = format!(
        "https://accounts.spotify.com/authorize?response_type=code&client_id={}&scope={}&redirect_uri={}&state={}&code_challenge_method=S256&code_challenge={}",
        urlencoding::encode(&cid),
        urlencoding::encode(SCOPES),
        urlencoding::encode(REDIRECT_URI),
        urlencoding::encode(&state),
        urlencoding::encode(&challenge),
    );

    // Blocking, and it can take a moment to hand off to the shell.
    let opened = tokio::task::spawn_blocking(move || open::that(&url))
        .await
        .map_err(|e| format!("browser thread: {e}"))?;
    opened.map_err(|e| format!("не удалось открыть браузер: {e}"))?;

    // The listener blocks, so it runs on a blocking thread rather than stalling
    // the async runtime the rest of the app shares.
    let code = tokio::task::spawn_blocking(move || wait_for_code(server, state))
        .await
        .map_err(|e| format!("callback thread: {e}"))??;

    let stored = exchange(&code, &verifier).await?;
    save_stored(&stored)?;

    me(&stored.access).await
}

/// Reads the signed-in profile.
async fn me(token: &str) -> Result<SpotifyAccount, String> {
    let resp = crate::api::client()?
        .get("https://api.spotify.com/v1/me")
        .bearer_auth(token)
        .send()
        .await
        .map_err(|e| format!("profile request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Spotify вернул {}", resp.status()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    Ok(SpotifyAccount {
        id: v["id"].as_str().unwrap_or_default().to_string(),
        // display_name is null on accounts that never set one, so the id is the
        // fallback rather than an empty card in the UI.
        name: v["display_name"]
            .as_str()
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| v["id"].as_str().unwrap_or("Spotify"))
            .to_string(),
        email: v["email"].as_str().unwrap_or_default().to_string(),
        avatar: v["images"]
            .as_array()
            .and_then(|a| a.first())
            .and_then(|i| i["url"].as_str())
            .map(|s| s.to_string()),
        // "premium" or "free": the free tier cannot stream full tracks through
        // the API, and the UI needs to say that up front rather than failing on
        // the first play.
        product: v["product"].as_str().unwrap_or("free").to_string(),
    })
}

/// The current account, or None when not signed in.
#[tauri::command]
pub async fn spotify_me() -> Result<Option<SpotifyAccount>, String> {
    match access_token().await {
        Ok(tok) => me(&tok).await.map(Some),
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub fn spotify_logout() -> Result<(), String> {
    crate::tokens::delete_service_token("sp".into())
}

/// Whether sign-in is possible at all, so the UI can show the row as
/// unavailable instead of offering a button that always errors.
#[tauri::command]
pub fn spotify_available() -> bool {
    configured()
}

/* ── library reads ──────────────────────────────────────────

   Playback inside the app is deliberately not attempted: Spotify streams are
   DRM-protected and the webview has no Widevine, so the honest feature is
   bringing the library over. Tracks arrive as plain names and are matched to
   a playable source by the frontend. */

fn sp_get(path: &str, token: &str) -> reqwest::RequestBuilder {
    crate::api::client()
        .expect("http client")
        .get(format!("https://api.spotify.com{path}"))
        .bearer_auth(token)
}

/// One row per playlist: enough to list, enough to drill in.
#[derive(Serialize)]
pub struct SpotifyPlaylist {
    pub id: String,
    pub name: String,
    pub total: u32,
}

#[tauri::command]
pub async fn spotify_playlists() -> Result<Vec<SpotifyPlaylist>, String> {
    let tok = access_token().await?;
    let mut lists = Vec::new();

    // Check if user has liked tracks in library
    if let Ok(resp) = sp_get("/v1/me/tracks?limit=1", &tok).send().await {
        if resp.status().is_success() {
            if let Ok(v) = resp.json::<serde_json::Value>().await {
                let total = v["total"].as_u64().unwrap_or(0) as u32;
                if total > 0 {
                    lists.push(SpotifyPlaylist {
                        id: "__liked__".to_string(),
                        name: "Любимые треки (Liked Songs)".to_string(),
                        total,
                    });
                }
            }
        }
    }

    let v: serde_json::Value = sp_get("/v1/me/playlists?limit=50", &tok)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    if let Some(rows) = v["items"].as_array() {
        for p in rows {
            if let Some(id) = p["id"].as_str() {
                lists.push(SpotifyPlaylist {
                    id: id.to_string(),
                    name: p["name"].as_str().unwrap_or("—").to_string(),
                    total: p["tracks"]["total"].as_u64().unwrap_or(0) as u32,
                });
            }
        }
    }
    Ok(lists)
}

/// Track rows of one playlist: {id, s, t: title, a: artist, al: album, d: seconds, art}.
///
/// Paginated. Spotify answers 100 rows at a time and hands back the next page
/// as `next`; reading only the first response silently imported the first 100
/// tracks of a longer playlist while the toast claimed the whole list had been
/// matched. Ten pages (1 000 tracks) is far past what a manual import is for,
/// and the bound keeps a runaway `next` from looping forever.
#[tauri::command]
pub async fn spotify_playlist_tracks(pid: String) -> Result<Vec<serde_json::Value>, String> {
    const MAX_PAGES: usize = 10;
    let tok = access_token().await?;

    let mut items: Vec<serde_json::Value> = Vec::new();
    let mut path = if pid == "__liked__" {
        "/v1/me/tracks?limit=50".to_string()
    } else {
        format!("/v1/playlists/{pid}/tracks?limit=100")
    };

    for _ in 0..MAX_PAGES {
        let v: serde_json::Value = sp_get(&path, &tok)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Spotify: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"))?;

        if let Some(rows) = v.get("items").and_then(|r| r.as_array()) {
            items.extend(rows.iter().cloned());
        }

        match v
            .get("next")
            .and_then(|n| n.as_str())
            .filter(|s| !s.is_empty())
        {
            Some(next) => path = next.to_string(),
            None => break,
        }
    }

    Ok(items
        .iter()
        .filter_map(|it| {
            let tr = if it.get("track").is_some() { &it["track"] } else { it };
            let name = tr["name"].as_str()?;
            if name.is_empty() {
                return None;
            }
            let track_id = tr["id"].as_str().unwrap_or("");
            let artist = tr["artists"]
                .as_array()
                .map(|as_| {
                    as_
                        .iter()
                        .filter_map(|a| a["name"].as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let album = tr["album"]["name"].as_str().unwrap_or("");
            let dur_sec = tr["duration_ms"].as_u64().unwrap_or(0) as f64 / 1000.0;
            let art = tr["album"]["images"]
                .as_array()
                .and_then(|imgs| imgs.first())
                .and_then(|img| img["url"].as_str())
                .unwrap_or("");

            Some(serde_json::json!({
                "id": track_id,
                "s": "sp",
                "t": name,
                "a": artist,
                "al": album,
                "d": dur_sec,
                "art": art,
            }))
        })
        .collect())
}

#[tauri::command]
pub async fn spotify_liked_tracks() -> Result<Vec<serde_json::Value>, String> {
    spotify_playlist_tracks("__liked__".to_string()).await
}

/// Search Spotify for tracks using the authenticated access token.
pub async fn spotify_search(query: &str) -> Result<Vec<crate::api::Track>, String> {
    let tok = access_token().await?;
    let path = format!("/v1/search?q={}&type=track&limit=20", urlencoding::encode(query));
    let resp = sp_get(&path, &tok)
        .send()
        .await
        .map_err(|e| format!("Spotify search network: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Spotify search error: {}", resp.status()));
    }
    let v: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Spotify search json: {e}"))?;

    let items = v.pointer("/tracks/items")
        .and_then(|t| t.as_array())
        .ok_or_else(|| "Spotify returned no track items".to_string())?;

    let mut tracks = Vec::new();
    for tr in items {
        let name = match tr.get("name").and_then(|n| n.as_str()) {
            Some(n) if !n.is_empty() => n,
            _ => continue,
        };
        let id = tr.get("id").and_then(|i| i.as_str()).unwrap_or("");
        let artist = tr.get("artists")
            .and_then(|as_| as_.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                    .collect::<Vec<_>>()
                    .join(", ")
            })
            .unwrap_or_else(|| "—".to_string());
        let album = tr.pointer("/album/name").and_then(|a| a.as_str()).unwrap_or("");
        let dur_ms = tr.get("duration_ms").and_then(|d| d.as_u64()).unwrap_or(0);
        let art = tr.pointer("/album/images/0/url").and_then(|u| u.as_str()).map(|s| s.to_string());

        tracks.push(crate::api::Track {
            id: id.to_string(),
            s: "sp".into(),
            t: name.to_string(),
            a: artist,
            al: album.to_string(),
            d: (dur_ms / 1000) as u32,
            art,
            mode: "web".into(),
        });
    }

    Ok(tracks)
}
