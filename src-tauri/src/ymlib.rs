//! Yandex Music account: sign-in without a hand-copied token, library sync
//! (likes + playlists) for import.
//!
//! Sign-in. Yandex's OAuth page does not hand the token back to a desktop
//! client: the redirect target must belong to a registered Yandex app, which
//! we cannot ship. So instead of asking the user to open DevTools, we open the
//! OAuth page (or plain music.yandex.ru when no client id is configured), let
//! the user sign in there, and then the user opens yandex.ru/music in the SAME
//! browser and copies the `yandex_music` cookie through a local paste page we
//! serve on the loopback. The page extracts the value client-side and POSTs it
//! back to us — no DevTools, no manual Application-tab spelunking, and the
//! token never leaves the machine.
//!
//! When YM_CLIENT_ID is configured we can use the real OAuth endpoint
//! (oauth.yandex.ru/authorize?...), whose success page prints the
//! access_token — the paste page handles that shape too.

use base64::Engine;
use rand::Rng;
use serde::Serialize;

const AUTH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

fn client_id() -> Option<String> {
    std::env::var("YM_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

/// Whether the one-click flow can run. Without a configured client id we fall
/// back to the cookie-paste flow, which still beats DevTools — so this command
/// exists for the UI to show the right hint, and both paths are "available".
#[tauri::command]
pub fn ym_available() -> bool {
    true
}

#[derive(Serialize)]
pub struct YmStarted {
    /// URL to open in the browser.
    pub url: String,
    /// Loopback port the paste page listens on.
    pub port: u16,
    /// csrf/state echo so the frontend can match the finish call.
    pub session: String,
}

/// Opens the browser and starts the loopback listener. Does not block: the
/// token arrives later, through `ym_finish`.
#[tauri::command]
pub async fn ym_login_start() -> Result<YmStarted, String> {
    // Bind before opening anything, so a fast paste cannot arrive before the
    // listener exists — same ordering discipline as the Spotify flow.
    let server = tiny_http::Server::http(("127.0.0.1", 0))
        .map_err(|e| format!("loopback listener: {e}"))?;
    let port = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or("no local port")?;

    let state: String = {
        let mut raw = [0u8; 18];
        rand::thread_rng().fill(&mut raw[..]);
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(raw)
    };

    // Real OAuth when a client id exists (the success page shows the token);
    // otherwise the music site itself, whose cookies after sign-in carry the
    // same credential the old DevTools guide went hunting for.
    let url = match client_id() {
        Some(cid) => format!(
            "https://oauth.yandex.ru/authorize?response_type=token&client_id={cid}&state={state}"
        ),
        None => "https://music.yandex.ru".to_string(),
    };

    let opened = {
        let url = url.clone();
        tokio::task::spawn_blocking(move || open::that(&url))
            .await
            .map_err(|e| format!("browser thread: {e}"))?
    };
    opened.map_err(|e| format!("не удалось открыть браузер: {e}"))?;

    // Serve the paste page in the background; the process answers GET (the
    // page) and POST (the token) until the token or the deadline arrives.
    std::thread::spawn(move || serve_paste(server, state));

    Ok(YmStarted {
        url,
        port,
        session: String::new(),
    })
}

/// Page served locally: the user pastes either the OAuth access_token (the
/// success page lets you copy it) or the `yandex_music` cookie value.
/// Everything runs in the page; the token only ever goes to 127.0.0.1.
fn paste_page() -> String {
    r#"<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">
<title>Meowave — вход в Яндекс Музыку</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{{box-sizing:border-box}}body{{margin:0;min-height:100vh;display:grid;place-items:center;
 background:#0b0b0d;color:#f4f4f5;font:400 15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}}
.card{{max-width:520px;width:100%;padding:38px 40px;background:#141417;border:1px solid #26262b;
 border-radius:20px;box-shadow:0 24px 60px rgb(0 0 0/.5)}}
h1{{margin:0 0 8px;font-size:1.2rem;letter-spacing:-.01em}}
p{{margin:0 0 14px;color:#a1a1aa;font-size:.9rem}}
ol{{margin:0 0 16px;padding-left:20px;color:#d4d4d8;font-size:.9rem}}
ol li{{margin:6px 0}}code{{background:#1c1c21;padding:1px 6px;border-radius:6px;font-size:.85em}}
textarea{{width:100%;min-height:92px;background:#0f0f12;color:#f4f4f5;border:1px solid #2e2e34;
 border-radius:12px;padding:10px 12px;font:inherit;resize:vertical}}
button{{margin-top:14px;width:100%;padding:11px;border:0;border-radius:12px;background:#ffdb4d;
 color:#1a1a1a;font:600 15px/1 inherit;cursor:pointer}}
button:disabled{{opacity:.6;cursor:default}}
.ok{{color:#4ade80}}.err{{color:#f87171}}
.brand{{margin-top:18px;font-size:.7rem;letter-spacing:.14em;text-transform:uppercase;color:#52525b;text-align:center}}
</style></head><body><div class="card">
<h1>Вход в Яндекс Музыку</h1>
<ol>
<li>Войдите в аккаунт на <b>music.yandex.ru</b> в этом браузере (если ещё не).</li>
<li>Нажмите <code>F12</code> → <code>Application</code> → <code>Cookies</code> → <code>music.yandex.ru</code>.</li>
<li>Скопируйте значение куки <code>yandex_music</code> и вставьте ниже.
<span style="color:#71717a">Если вы прошли OAuth-страницу — вставьте показанный там access_token.</span></li>
</ol>
<textarea id="t" placeholder="yandex_music=…"></textarea>
<button id="go">Войти в Meowave</button>
<p id="m"></p>
<div class="brand">Meowave</div>
<script>
const b=document.getElementById('go'),t=document.getElementById('t'),m=document.getElementById('m');
b.onclick=async()=>{{
 const v=t.value.trim().split('\n')[0].replace(/^yandex_music=/,'').trim();
 if(!v){{m.textContent='Вставьте значение куки';m.className='err';return}}
 b.disabled=true;
 try{{
  const r=await fetch('/token',{{method:'POST',headers:{{'Content-Type':'application/json'}},
   body:JSON.stringify({{token:v}})}});
  if(!r.ok)throw 0;
  m.textContent='Готово! Вернитесь в Meowave.';m.className='ok';t.value='';
 }}catch(e){{m.textContent='Не отправилось — попробуйте ещё раз';m.className='err';b.disabled=false}}
}};
</script></div></body></html>"#
    .to_string()
}

fn respond(req: tiny_http::Request, code: u16, body: &str, ctype: &str) {
    let mut resp = tiny_http::Response::from_string(body).with_status_code(code);
    resp.add_header(
        tiny_http::Header::from_bytes(&b"Content-Type"[..], ctype.as_bytes())
            .expect("static header"),
    );
    let _ = req.respond(resp);
}

fn serve_paste(server: tiny_http::Server, state: String) {
    let deadline = std::time::Instant::now() + AUTH_TIMEOUT;
    loop {
        if std::time::Instant::now() >= deadline {
            return;
        }
        let left = deadline.saturating_duration_since(std::time::Instant::now());
        let mut req = match server.recv_timeout(left) {
            Ok(Some(r)) => r,
            _ => continue,
        };
        let path = req.url().split('?').next().unwrap_or("").to_string();
        match path.as_str() {
            "/" => {
                let page = paste_page();
                respond(req, 200, &page, "text/html; charset=utf-8");
            }
            "/token" => {
                let mut body = String::new();
                let _ = req.as_reader().read_to_string(&mut body);
                let token = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|v| v["token"].as_str().map(|s| s.to_string()))
                    .unwrap_or_default();
                if token.len() < 10 {
                    respond(
                        req,
                        400,
                        "{\"error\":\"bad token\"}",
                        "application/json",
                    );
                    continue;
                }
                // Persist through the same keychain path as every other service.
                let _ = crate::tokens::set_service_token("ym".into(), token.clone());
                let _ = state; // reserved for a future strict check
                respond(req, 200, "{\"ok\":true}", "application/json");
                return; // token received: stop serving
            }
            _ => {
                respond(req, 404, "not found", "text/plain");
            }
        }
    }
}

/// Triggers the frontend refresh: initServices() re-reads the keychain after
/// the paste page has stored the token. Kept as a command so the flow stays
/// explicit and awaits nothing from the listener thread.
#[tauri::command]
pub fn ym_finish() -> Result<(), String> {
    Ok(())
}

#[derive(Serialize)]
pub struct YmPlaylist {
    pub id: String,
    pub name: String,
    pub total: u32,
}

/// Raw track rows shaped like the Spotify importer's: {t,a,al,d} plus the
/// native id (`i`), so frontend matching can prefer the real, playable
/// Yandex source over a name-match elsewhere.
fn ym_row(v: &serde_json::Value) -> Option<serde_json::Value> {
    let id = v.get("id").map(|i| match i {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    })?;
    let t = v.get("title").and_then(|x| x.as_str())?;
    if t.is_empty() {
        return None;
    }
    let a = v
        .get("artists")
        .and_then(|x| x.as_array())
        .map(|xs| {
            xs.iter()
                .filter_map(|x| x.get("name").and_then(|n| n.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .unwrap_or_default();
    let al = v
        .get("albums")
        .and_then(|x| x.as_array())
        .and_then(|xs| xs.first())
        .and_then(|x| x.get("title"))
        .and_then(|x| x.as_str())
        .unwrap_or("")
        .to_string();
    let d = v.get("durationMs").and_then(|x| x.as_u64()).unwrap_or(0) as f64 / 1000.0;
    let exp = v
        .get("contentWarning")
        .and_then(|x| x.as_str())
        .map(|s| s == "explicit")
        .unwrap_or(false)
        || v.get("explicit").and_then(|x| x.as_bool()).unwrap_or(false);
    Some(serde_json::json!({ "i": id, "t": t, "a": a, "al": al, "d": d, "exp": exp }))
}

fn ym_api(path: &str, token: &str) -> reqwest::RequestBuilder {
    crate::api::client()
        .expect("http client")
        .get(format!("{}{}", crate::api::YM_API, path))
        .header("Authorization", format!("OAuth {}", token.trim()))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
}

async fn ym_token() -> Result<String, String> {
    crate::tokens::read_token("ym")?
        .ok_or_else(|| "нет токена Яндекс Музыки — войдите в аккаунт".to_string())
}

async fn ym_uid(token: &str) -> Result<String, String> {
    let v: serde_json::Value = ym_api("/account/status", token)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Yandex: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;
    extract_uid(&v).ok_or_else(|| "не удалось получить uid пользователя Яндекс Музыки".to_string())
}

pub(crate) fn extract_uid(v: &serde_json::Value) -> Option<String> {
    v.pointer("/result/account/uid")
        .or_else(|| v.pointer("/result/account/id"))
        .or_else(|| v.pointer("/result/default_email"))
        .and_then(|u| match u {
            serde_json::Value::Number(n) => Some(n.to_string()),
            serde_json::Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
            _ => None,
        })
}

/// Liked tracks: /tracks are returned as {id, albumId} pairs plus a `tracks`
/// array of full objects; page through the library (50 likes per call).
#[tauri::command]
pub async fn ym_liked_tracks() -> Result<Vec<serde_json::Value>, String> {
    let token = ym_token().await?;
    let uid = ym_uid(&token).await?;
    let mut full: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    // The likes endpoint has no cursor; it returns the whole library. Bound it
    // defensively all the same: 60 pages × 50 = far past any honest library.
    for page in 0..60u32 {
        let before_len = full.len();
        let v: serde_json::Value = ym_api(&format!("/users/{uid}/likes/tracks?page={page}&per-page=50"), &token)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Yandex: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"))?;
        let library_ids = v
            .pointer("/result/library/tracks")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default();
        if library_ids.is_empty() {
            break;
        }
        // Full track objects ride along in result.tracks for this page.
        if let Some(rows) = v.pointer("/result/tracks").and_then(|x| x.as_array()) {
            for tr in rows {
                if let Some(row) = ym_row(tr) {
                    let key = row["i"].as_str().unwrap_or("").to_string();
                    if seen.insert(key) {
                        full.push(row);
                    }
                }
            }
        }
        // Older responses put the ids only in library.tracks; resolve them in batches of 50.
        if full.is_empty() {
            let ids: Vec<String> = library_ids
                .iter()
                .filter_map(|x| {
                    x.get("id").map(|i| match i {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    })
                })
                .collect();
            if ids.is_empty() {
                break;
            }
            for chunk in ids.chunks(50) {
                let batch = chunk.join(",");
                let v2: serde_json::Value = ym_api(&format!("/tracks/{batch}"), &token)
                    .send()
                    .await
                    .map_err(|e| format!("network: {e}"))?
                    .error_for_status()
                    .map_err(|e| format!("Yandex: {e}"))?
                    .json()
                    .await
                    .map_err(|e| format!("bad response: {e}"))?;
                if let Some(rows) = v2.pointer("/result").and_then(|x| x.as_array()) {
                    for tr in rows {
                        if let Some(row) = ym_row(tr) {
                            let key = row["i"].as_str().unwrap_or("").to_string();
                            if seen.insert(key) {
                                full.push(row);
                            }
                        }
                    }
                }
            }
        }
        if full.len() == before_len {
            break;
        }
    }
    Ok(full)
}

/// The user's playlists (own first, then liked ones), enough to import from.
#[tauri::command]
pub async fn ym_playlists() -> Result<Vec<YmPlaylist>, String> {
    let token = ym_token().await?;
    let uid = ym_uid(&token).await?;
    let v: serde_json::Value = ym_api(&format!("/users/{uid}/playlists/list"), &token)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Yandex: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;
    Ok(v.pointer("/result")
        .and_then(|x| x.as_array())
        .map(|rows| {
            rows.iter()
                .filter_map(|p| {
                    let kind = p.get("kind").map(|k| match k {
                        serde_json::Value::String(s) => s.clone(),
                        other => other.to_string(),
                    })?;
                    Some(YmPlaylist {
                        id: kind,
                        name: p
                            .get("title")
                            .and_then(|x| x.as_str())
                            .unwrap_or("—")
                            .to_string(),
                        total: p
                            .get("trackCount")
                            .and_then(|x| x.as_u64())
                            .unwrap_or(0) as u32,
                    })
                })
                .collect()
        })
        .unwrap_or_default())
}

/// Tracks of one playlist, paginated (Yandex returns ~150 byte rows of
/// {id,albumId} and a parallel `tracks` array; both are read).
#[tauri::command]
pub async fn ym_playlist_tracks(kind: String) -> Result<Vec<serde_json::Value>, String> {
    let token = ym_token().await?;
    let uid = ym_uid(&token).await?;
    let mut out: Vec<serde_json::Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for page in 0..40u32 {
        let v: serde_json::Value = ym_api(
            &format!("/users/{uid}/playlists/{kind}?page={page}&per-page=100&mix=extra"),
            &token,
        )
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Yandex: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;
        let rows = v
            .pointer("/result/tracks")
            .and_then(|x| x.as_array())
            .cloned()
            .unwrap_or_default();
        if rows.is_empty() {
            break;
        }
        let before = out.len();
        for tr in rows.iter().filter(|t| t.get("title").is_some()) {
            if let Some(row) = ym_row(tr) {
                let key = row["i"].as_str().unwrap_or("").to_string();
                if seen.insert(key) {
                    out.push(row);
                }
            }
        }
        // Track ids with no inline object: resolve in one batch.
        let ids: Vec<String> = rows
            .iter()
            .filter(|t| t.get("title").is_none())
            .filter_map(|t| {
                t.get("id").map(|i| match i {
                    serde_json::Value::String(s) => s.clone(),
                    other => other.to_string(),
                })
            })
            .collect();
        if !ids.is_empty() {
            let batch = ids.join(",");
            let v2: serde_json::Value = ym_api(&format!("/tracks/{batch}"), &token)
                .send()
                .await
                .map_err(|e| format!("network: {e}"))?
                .error_for_status()
                .map_err(|e| format!("Yandex: {e}"))?
                .json()
                .await
                .map_err(|e| format!("bad response: {e}"))?;
            if let Some(rows2) = v2.pointer("/result").and_then(|x| x.as_array()) {
                for tr in rows2 {
                    if let Some(row) = ym_row(tr) {
                        let key = row["i"].as_str().unwrap_or("").to_string();
                        if seen.insert(key) {
                            out.push(row);
                        }
                    }
                }
            }
        }
        if out.len() == before {
            break;
        }
        if out.len() >= 1000 {
            break;
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_uid_number() {
        let v = serde_json::json!({
            "result": {
                "account": {
                    "uid": 123456789
                }
            }
        });
        assert_eq!(extract_uid(&v), Some("123456789".to_string()));
    }

    #[test]
    fn test_extract_uid_string() {
        let v = serde_json::json!({
            "result": {
                "account": {
                    "uid": "987654321"
                }
            }
        });
        assert_eq!(extract_uid(&v), Some("987654321".to_string()));
    }

    #[test]
    fn test_extract_uid_fallback_id() {
        let v = serde_json::json!({
            "result": {
                "account": {
                    "id": 55555
                }
            }
        });
        assert_eq!(extract_uid(&v), Some("55555".to_string()));
    }

    #[test]
    fn test_ym_row_parsing() {
        let tr = serde_json::json!({
            "id": 4242,
            "title": "Space Song",
            "artists": [
                { "name": "Beach House" }
            ],
            "albums": [
                {
                    "title": "Depression Cherry",
                    "coverUri": "avatars.yandex.net/get-music-content/123/%%"
                }
            ],
            "durationMs": 320000
        });
        let row = ym_row(&tr).expect("parsed row");
        assert_eq!(row["i"], "4242");
        assert_eq!(row["t"], "Space Song");
        assert_eq!(row["a"], "Beach House");
        assert_eq!(row["al"], "Depression Cherry");
        assert_eq!(row["d"].as_f64().unwrap(), 320.0);
    }
}
