//! Streaming service providers: search, track metadata, stream URL resolution.
//!
//! Every network call happens here rather than in the webview. Two reasons:
//! these APIs want Authorization / User-Agent headers a browser refuses to set,
//! and none of them send CORS headers.

use serde::{Deserialize, Serialize};

pub const UA: &str = "Meowave/0.1 (+https://github.com/meowave)";
pub const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/// One track shape for the frontend, whichever service it came from.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Track {
    pub id: String,
    /// Service id: "ym" | "sc" | "ytm".
    pub s: String,
    pub t: String,
    pub a: String,
    pub al: String,
    /// Duration in seconds.
    pub d: u32,
    pub art: Option<String>,
    /// "local" — we own playback through Web Audio, so EQ and 3D work.
    /// "remote" — someone else's player in an iframe; the audio never reaches us.
    pub mode: String,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub tracks: Vec<Track>,
    /// Services that failed. The frontend shows these alongside the results
    /// instead of pretending the search was clean.
    pub errors: Vec<ServiceError>,
}

#[derive(Serialize)]
pub struct ServiceError {
    pub service: String,
    pub message: String,
}

/// One client per configuration instead of one per request.
///
/// Every call used to build a fresh `reqwest::Client` — a new connection pool,
/// a new resolver, a new TLS setup — and throw it away after a single request.
/// So every search, every lyric lookup, every cover relay and every stream
/// resolved a fresh DNS + TCP + TLS handshake instead of reusing one that was
/// already warm, and the cover relay (one request per artwork on the page) paid
/// that price the most.
///
/// A client is cheap to clone — the pool lives behind an Arc — and it is only
/// as valid as the routing it was built with, so `proxy_set` drops both slots
/// and the next request rebuilds them (`reset_clients`).
static CLIENT: std::sync::RwLock<Option<reqwest::Client>> = std::sync::RwLock::new(None);
static MEDIA: std::sync::RwLock<Option<reqwest::Client>> = std::sync::RwLock::new(None);

fn reuse(
    slot: &std::sync::RwLock<Option<reqwest::Client>>,
    build: impl FnOnce() -> Result<reqwest::Client, String>,
) -> Result<reqwest::Client, String> {
    if let Ok(g) = slot.read() {
        if let Some(c) = g.as_ref() {
            return Ok(c.clone());
        }
    }
    let built = build()?;
    if let Ok(mut g) = slot.write() {
        *g = Some(built.clone());
    }
    Ok(built)
}

/// Drops both clients so the next request rebuilds them against the current
/// proxy settings; without this a cached client would keep routing traffic the
/// old way for the rest of the session.
pub fn reset_clients() {
    for slot in [&CLIENT, &MEDIA] {
        if let Ok(mut g) = slot.write() {
            *g = None;
        }
    }
}

pub fn client() -> Result<reqwest::Client, String> {
    reuse(&CLIENT, || {
        let mut b = reqwest::Client::builder()
            .user_agent(UA)
            .timeout(std::time::Duration::from_secs(20));
        // Optional and off by default. The proxy carries its own routing rules, so
        // only the blocked hosts go through it — Yandex and our 127.0.0.1 stream
        // proxy stay direct. Every network path in the app funnels through this
        // one constructor, which is why the switch works everywhere at once.
        if let Some(p) = crate::proxy::reqwest_proxy() {
            b = b.proxy(p);
        }
        b.build().map_err(|e| e.to_string())
    })
}

/// The same client, minus the deadline — for bodies that are read for minutes
/// instead of milliseconds: audio streaming through the local proxy and
/// downloads to disk.
///
/// `timeout()` on the normal client is a TOTAL deadline: reqwest applies it
/// from "connecting starts" until "the response body has finished". A track is
/// several megabytes that the media element reads at its own pace (WebKit
/// trickles a long song for minutes), so the 20 s budget ran out mid-transfer,
/// the proxy's upstream reader errored and playback died — a bug that only
/// showed up on long tracks and slow links, which is why it looked random.
///
/// A streaming client has to bound the *stalls*, not the whole transfer, so
/// this one has no total deadline: connect and per-read are capped instead.
pub fn media_client() -> Result<reqwest::Client, String> {
    reuse(&MEDIA, || {
        let mut b = reqwest::Client::builder()
            .user_agent(UA)
            .connect_timeout(std::time::Duration::from_secs(15))
            // Resets on every successful read, so a slow-but-moving stream is fine
            // while a connection that goes quiet for a minute still fails.
            .read_timeout(std::time::Duration::from_secs(60));
        if let Some(p) = crate::proxy::reqwest_proxy() {
            b = b.proxy(p);
        }
        b.build().map_err(|e| e.to_string())
    })
}

fn sec(ms: u64) -> u32 {
    (ms / 1000) as u32
}

/* ═══════════════════ Yandex Music ═══════════════════
   There is no public API, so we speak the same interface the web client does,
   authenticated with the user's own OAuth token from the keychain.
   It hands back a direct file URL, so we play it ourselves (mode: "local").  */

/// Public for ymlib.rs, which adds account/library reads (likes, playlists)
/// on top of the same API the search/stream paths use.
pub const YM_API: &str = "https://api.music.yandex.net";
/// Salt for the file URL signature. A constant baked into the Yandex client,
/// not a secret of ours.
const YM_SALT: &str = "XGRlBW9FXlekgbPrRHuSiA";

fn ym_auth(token: &str) -> String {
    format!("OAuth {}", token.trim())
}

pub async fn ym_search(token: &str, query: &str) -> Result<Vec<Track>, String> {
    let url = format!(
        "{YM_API}/search?type=track&page=0&nocorrect=false&text={}",
        urlencoding::encode(query)
    );
    let body: serde_json::Value = client()?
        .get(&url)
        .header("Authorization", ym_auth(token))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Yandex rejected the request: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let items = body
        .pointer("/result/tracks/results")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items.iter().filter_map(ym_track).collect())
}

fn ym_track(v: &serde_json::Value) -> Option<Track> {
    let id = v.get("id").map(|i| match i {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    })?;
    let artists = v
        .get("artists")
        .and_then(|a| a.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.get("name").and_then(|n| n.as_str()))
                .collect::<Vec<_>>()
                .join(", ")
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "—".into());
    let album = v
        .pointer("/albums/0/title")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();
    // Cover URIs come as "avatars.yandex.net/get-music-content/…/%%" with the
    // size left as a placeholder for the caller to fill in.
    let art = v
        .get("coverUri")
        .and_then(|c| c.as_str())
        .map(|c| format!("https://{}", c.replace("%%", "400x400")));

    Some(Track {
        id,
        s: "ym".into(),
        t: v.get("title").and_then(|t| t.as_str()).unwrap_or("—").into(),
        a: artists,
        al: album,
        d: sec(v.get("durationMs").and_then(|d| d.as_u64()).unwrap_or(0)),
        art,
        mode: "local".into(),
    })
}

/// Turns a track id into a direct mp3 URL. Yandex makes this a two-step dance:
/// download-info -> an XML blob with host/path/ts/s -> an md5 signature.
pub async fn ym_stream_url(token: &str, id: &str, hq: bool) -> Result<String, String> {
    let c = client()?;
    let info: serde_json::Value = c
        .get(format!("{YM_API}/tracks/{id}/download-info"))
        .header("Authorization", ym_auth(token))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("no access to this track: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let variants = info
        .get("result")
        .and_then(|r| r.as_array())
        .ok_or("Yandex returned no download variants")?;

    // Best quality the account is entitled to. Without a Plus subscription
    // that's 128k no matter what we ask for.
    let pick = variants
        .iter()
        .filter(|v| v.get("codec").and_then(|c| c.as_str()) != Some("aac"))
        .max_by_key(|v| v.get("bitrateInKbps").and_then(|b| b.as_u64()).unwrap_or(0))
        .or_else(|| variants.first())
        .ok_or("empty variant list")?;
    let pick = if hq {
        pick
    } else {
        variants
            .iter()
            .min_by_key(|v| v.get("bitrateInKbps").and_then(|b| b.as_u64()).unwrap_or(999))
            .unwrap_or(pick)
    };

    let di = pick
        .get("downloadInfoUrl")
        .and_then(|u| u.as_str())
        .ok_or("no downloadInfoUrl")?;

    let xml = c
        .get(di)
        .header("Authorization", ym_auth(token))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .text()
        .await
        .map_err(|e| format!("reading xml: {e}"))?;

    let tag = |name: &str| -> Option<String> {
        let open = format!("<{name}>");
        let close = format!("</{name}>");
        let s = xml.find(&open)? + open.len();
        let e = xml[s..].find(&close)? + s;
        Some(xml[s..e].to_string())
    };
    let host = tag("host").ok_or("xml has no host")?;
    let path = tag("path").ok_or("xml has no path")?;
    let ts = tag("ts").ok_or("xml has no ts")?;
    let s = tag("s").ok_or("xml has no s")?;

    let trimmed = path.strip_prefix('/').unwrap_or(&path);
    let sign = format!("{:x}", md5::compute(format!("{YM_SALT}{trimmed}{s}")));
    Ok(format!("https://{host}/get-mp3/{sign}/{ts}{path}"))
}

/* ═══════════════════ SoundCloud ═══════════════════
   No sign-in needed. The public web client ships its own client_id inside its
   JavaScript bundles, so we fetch the homepage, pull the script URLs out of it
   and grep the first client_id we find — exactly what the site does for every
   anonymous visitor. If the user did connect an OAuth token, we use that
   instead (it unlocks their private/go+ tracks).
   The progressive transcoding is plain mp3, so mode: "local".              */

const SC_API: &str = "https://api-v2.soundcloud.com";

/// Scraped client_id, kept for the process lifetime. SoundCloud rotates them
/// every few weeks, so it's cached but never persisted.
static SC_CLIENT_ID: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

fn sc_cached_id() -> Option<String> {
    SC_CLIENT_ID.lock().ok().and_then(|g| g.clone())
}

fn sc_store_id(id: &str) {
    if let Ok(mut g) = SC_CLIENT_ID.lock() {
        *g = Some(id.to_string());
    }
}

/// Pulls a working client_id out of the public web player's JS bundles.
pub async fn sc_client_id() -> Result<String, String> {
    if let Some(id) = sc_cached_id() {
        return Ok(id);
    }
    let c = client()?;
    let html = c
        .get("https://soundcloud.com/")
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .text()
        .await
        .map_err(|e| format!("reading soundcloud.com: {e}"))?;

    // <script crossorigin src="https://a-v2.sndcdn.com/assets/0-xxxx.js">
    let mut scripts: Vec<String> = Vec::new();
    for piece in html.split("src=\"").skip(1) {
        if let Some(end) = piece.find('"') {
            let url = &piece[..end];
            if url.starts_with("https://a-v2.sndcdn.com/assets/") && url.ends_with(".js") {
                scripts.push(url.to_string());
            }
        }
    }
    // The id lives in one of the last bundles more often than not.
    scripts.reverse();

    for url in scripts.iter().take(8) {
        let Ok(resp) = c.get(url).header(reqwest::header::USER_AGENT, BROWSER_UA).send().await else { continue };
        let Ok(js) = resp.text().await else { continue };
        for marker in ["client_id:\"", "client_id=", "\"client_id\":\""] {
            if let Some(pos) = js.find(marker) {
                let rest = &js[pos + marker.len()..];
                let id: String = rest
                    .chars()
                    .take_while(|ch| ch.is_ascii_alphanumeric())
                    .collect();
                if id.len() >= 24 {
                    sc_store_id(&id);
                    return Ok(id);
                }
            }
        }
    }
    Err("could not find a public SoundCloud client_id".into())
}

/// An OAuth token beats the anonymous client_id when the user connected one.
fn sc_is_oauth(token: &str) -> bool {
    let t = token.trim();
    t.starts_with("OAuth ") || (t.contains('-') && t.len() > 40)
}

async fn sc_req(c: &reqwest::Client, url: &str, token: &str) -> Result<reqwest::RequestBuilder, String> {
    let t = token.trim();
    if sc_is_oauth(t) {
        let v = if t.starts_with("OAuth ") {
            t.to_string()
        } else {
            format!("OAuth {t}")
        };
        return Ok(c.get(url).header("Authorization", v).header(reqwest::header::USER_AGENT, BROWSER_UA));
    }
    let id = if t.len() >= 24 && t.chars().all(|ch| ch.is_ascii_alphanumeric()) {
        t.to_string()
    } else {
        sc_client_id().await?
    };
    Ok(c.get(url).query(&[("client_id", id)]).header(reqwest::header::USER_AGENT, BROWSER_UA))
}

pub async fn sc_search(token: &str, query: &str) -> Result<Vec<Track>, String> {
    let url = format!("{SC_API}/search/tracks?limit=25&q={}", urlencoding::encode(query));
    let c = client()?;
    let body: serde_json::Value = sc_req(&c, &url, token)
        .await?
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SoundCloud rejected the request: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let items = body
        .get("collection")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items
        .iter()
        .filter(|v| v.get("kind").and_then(|k| k.as_str()) == Some("track"))
        .filter_map(|v| {
            Some(Track {
                id: v.get("id")?.to_string().trim_matches('"').to_string(),
                s: "sc".into(),
                t: v.get("title").and_then(|t| t.as_str()).unwrap_or("—").into(),
                a: v.pointer("/user/username")
                    .and_then(|u| u.as_str())
                    .unwrap_or("—")
                    .into(),
                al: v
                    .pointer("/publisher_metadata/album_title")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .into(),
                d: sec(v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0)),
                art: v
                    .get("artwork_url")
                    .and_then(|a| a.as_str())
                    .map(|a| a.replace("-large.", "-t500x500.")),
                mode: "local".into(),
            })
        })
        .collect())
}

pub async fn sc_stream_url(token: &str, id: &str) -> Result<String, String> {
    let c = client()?;
    let track: serde_json::Value = sc_req(&c, &format!("{SC_API}/tracks/{id}"), token)
        .await?
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("no access to this track: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    // Prefer progressive (plain mp3) over hls: <audio> plays it as-is.
    let transcodings = track
        .pointer("/media/transcodings")
        .and_then(|t| t.as_array())
        .ok_or("track has no transcodings")?;
    let pick = transcodings
        .iter()
        .find(|t| t.pointer("/format/protocol").and_then(|p| p.as_str()) == Some("progressive"))
        .or_else(|| transcodings.first())
        .ok_or("empty transcoding list")?;
    let url = pick.get("url").and_then(|u| u.as_str()).ok_or("transcoding has no url")?;

    let resolved: serde_json::Value = sc_req(&c, url, token)
        .await?
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    resolved
        .get("url")
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "SoundCloud did not return a stream URL".into())
}

pub async fn sc_related(token: &str, id: &str) -> Result<Vec<Track>, String> {
    let url = format!("{SC_API}/tracks/{id}/related?limit=20");
    let c = client()?;
    let body: serde_json::Value = sc_req(&c, &url, token)
        .await?
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SoundCloud rejected related request: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let items = body
        .get("collection")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    Ok(items
        .iter()
        .filter(|v| v.get("kind").and_then(|k| k.as_str()) == Some("track"))
        .filter_map(|v| {
            Some(Track {
                id: v.get("id")?.to_string().trim_matches('"').to_string(),
                s: "sc".into(),
                t: v.get("title").and_then(|t| t.as_str()).unwrap_or("—").into(),
                a: v.pointer("/user/username")
                    .and_then(|u| u.as_str())
                    .unwrap_or("—")
                    .into(),
                al: v
                    .pointer("/publisher_metadata/album_title")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .into(),
                d: sec(v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0)),
                art: v
                    .get("artwork_url")
                    .and_then(|a| a.as_str())
                    .map(|a| a.replace("-large.", "-t500x500."))
                    .or_else(|| v.pointer("/user/avatar_url").and_then(|a| a.as_str()).map(|s| s.to_string())),
                mode: "local".into(),
            })
        })
        .collect())
}

/* ═══════════════════ YouTube Music ═══════════════════
   Guest InnerTube, no API key and no sign-in — see ytm.rs. The Android music
   client hands back plain audio URLs, so playback stays local (mode: "local")
   and the EQ, 3D panner and visualiser keep working.                       */

pub async fn ytm_search(query: &str) -> Result<Vec<Track>, String> {
    crate::ytm::search(query).await
}

/* ═════════════════ commands exposed to the frontend ════════════════ */

/// Searches every connected service at once. One service failing doesn't sink
/// the others; its error comes back in a separate list.
#[tauri::command]
pub async fn api_search(query: String, services: Vec<String>) -> Result<SearchResult, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(SearchResult { tracks: vec![], errors: vec![] });
    }

    let mut tasks = Vec::new();
    for s in services {
        let q = query.clone();
        tasks.push(tokio::spawn(async move {
            // SoundCloud and YouTube Music work anonymously; only Yandex
            // insists on the user's own token.
            /* Tokenless services must not touch the keychain at all. On a
               desktop with no Secret Service (minimal Linux, a container, a
               session without D-Bus) `get_password` ERRORS instead of answering
               "no entry", and that error failed the search for two services
               that never needed a credential — YouTube Music and SoundCloud
               looked broken when they were fine. */
            let token = if crate::tokens::TOKENLESS_SERVICES.contains(&s.as_str()) {
                String::new()
            } else {
                match crate::tokens::read_token(&s) {
                    Ok(t) => t.unwrap_or_default(),
                    Err(e) => return (s.clone(), Err(e)),
                }
            };
            let res = match s.as_str() {
                "ym" if token.is_empty() => Err("not connected".to_string()),
                "ym" => ym_search(&token, &q).await,
                "sc" => sc_search(&token, &q).await,
                "ytm" => ytm_search(&q).await,
                "sp" => crate::spotify::spotify_search(&q).await,
                other => Err(format!("unknown service: {other}")),
            };
            (s, res)
        }));
    }

    let mut tracks = Vec::new();
    let mut errors = Vec::new();
    for t in tasks {
        match t.await {
            Ok((service, Ok(mut list))) => {
                let _ = service;
                tracks.append(&mut list);
            }
            Ok((service, Err(message))) => errors.push(ServiceError { service, message }),
            Err(e) => errors.push(ServiceError {
                service: "-".into(),
                message: e.to_string(),
            }),
        }
    }
    Ok(SearchResult { tracks, errors })
}

/// Validates a token by making the smallest request the service will accept.
#[tauri::command]
pub async fn api_check_token(service: String, token: String) -> Result<bool, String> {
    let t = token.trim();
    match service.as_str() {
        "ym" => ym_search(t, "test").await.map(|_| true),
        "sc" => sc_search(t, "test").await.map(|_| true),
        "ytm" => ytm_search("test").await.map(|_| true),
        "sp" => crate::spotify::access_token().await.map(|_| true),
        other => Err(format!("unknown service: {other}")),
    }
}

/// Probes a service without a token: used by the UI to show sc/ytm as ready
/// and to surface a real reason when they aren't.
#[tauri::command]
pub async fn api_probe_service(service: String) -> Result<bool, String> {
    match service.as_str() {
        "sc" => sc_search("", "test").await.map(|_| true),
        "ytm" => ytm_search("test").await.map(|_| true),
        "ym" => Err("Yandex Music needs your token".into()),
        "sp" => Ok(crate::spotify::configured()),
        other => Err(format!("unknown service: {other}")),
    }
}

/// Radio / related recommendations for a track from connected streaming services.
#[tauri::command]
pub async fn api_radio(service: String, id: String) -> Result<Vec<Track>, String> {
    match service.as_str() {
        "ytm" => crate::ytm::radio(&id).await,
        "sc" => {
            let token = match crate::tokens::read_token("sc") {
                Ok(t) => t.unwrap_or_default(),
                Err(_) => String::new(),
            };
            sc_related(&token, &id).await
        }
        _ => Ok(vec![]),
    }
}

/// Fetch tracks from a SoundCloud playlist or set.
#[tauri::command]
pub async fn sc_playlist_tracks(url_or_id: String) -> Result<Vec<Track>, String> {
    let raw = url_or_id.trim();
    let client_id = sc_client_id().await?;
    let c = client()?;
    let url = if raw.starts_with("http://") || raw.starts_with("https://") {
        format!("{SC_API}/resolve?url={}&client_id={client_id}", urlencoding::encode(raw))
    } else {
        format!("{SC_API}/playlists/{raw}?client_id={client_id}")
    };

    let resp: serde_json::Value = c
        .get(&url)
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SoundCloud error: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let raw_tracks = resp
        .get("tracks")
        .and_then(|t| t.as_array())
        .ok_or_else(|| "playlist has no tracks".to_string())?;

    let mut full_tracks: Vec<Track> = Vec::new();
    let mut stub_ids: Vec<String> = Vec::new();

    for t in raw_tracks {
        if let Some(title) = t.get("title").and_then(|v| v.as_str()) {
            if let Some(id) = t.get("id").map(|v| v.to_string().trim_matches('"').to_string()) {
                full_tracks.push(Track {
                    id,
                    s: "sc".into(),
                    t: title.into(),
                    a: t.pointer("/user/username").and_then(|u| u.as_str()).unwrap_or("—").into(),
                    al: t.pointer("/publisher_metadata/album_title").and_then(|x| x.as_str()).unwrap_or("").into(),
                    d: sec(t.get("duration").and_then(|d| d.as_u64()).unwrap_or(0)),
                    art: t.get("artwork_url").and_then(|a| a.as_str()).map(|a| a.replace("-large.", "-t500x500.")),
                    mode: "local".into(),
                });
            }
        } else if let Some(id) = t.get("id").map(|v| v.to_string().trim_matches('"').to_string()) {
            if stub_ids.len() < 100 {
                stub_ids.push(id);
            }
        }
    }

    if !stub_ids.is_empty() {
        for chunk in stub_ids.chunks(50) {
            let ids_param = chunk.join(",");
            let tracks_url = format!("{SC_API}/tracks?ids={ids_param}&client_id={client_id}");
            if let Ok(r) = c.get(&tracks_url).header(reqwest::header::USER_AGENT, BROWSER_UA).send().await {
                if let Ok(items) = r.json::<Vec<serde_json::Value>>().await {
                    for v in items {
                        if let Some(id) = v.get("id").map(|x| x.to_string().trim_matches('"').to_string()) {
                            let title = v.get("title").and_then(|x| x.as_str()).unwrap_or("—");
                            let artist = v.pointer("/user/username").and_then(|x| x.as_str()).unwrap_or("—");
                            let album = v.pointer("/publisher_metadata/album_title").and_then(|x| x.as_str()).unwrap_or("");
                            let duration = sec(v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0));
                            let art = v.get("artwork_url").and_then(|a| a.as_str()).map(|a| a.replace("-large.", "-t500x500."));
                            full_tracks.push(Track {
                                id,
                                s: "sc".into(),
                                t: title.into(),
                                a: artist.into(),
                                al: album.into(),
                                d: duration,
                                art,
                                mode: "local".into(),
                            });
                        }
                    }
                }
            }
        }
    }

    full_tracks.truncate(200);
    Ok(full_tracks)
}

/// Fetch public Spotify playlist tracks without account or login.
#[tauri::command]
pub async fn spotify_public_playlist_tracks(url_or_id: String) -> Result<Vec<Track>, String> {
    let raw = url_or_id.trim();
    // Normalize intl URLs like https://open.spotify.com/intl-ru/playlist/...
    let normalized = if let Some(pos) = raw.find("/intl-") {
        if let Some(slash) = raw[pos + 1..].find('/') {
            format!("https://open.spotify.com/{}", &raw[pos + 1 + slash + 1..])
        } else {
            raw.to_string()
        }
    } else {
        raw.to_string()
    };
    let norm = normalized.as_str();

    let (embed_type, id) = if norm.contains("album/") || norm.contains("album:") {
        let id = if norm.contains("album/") {
            norm.split("album/").nth(1).and_then(|s| s.split('?').next()).and_then(|s| s.split('/').next()).unwrap_or(norm).trim()
        } else {
            norm.split("album:").nth(1).and_then(|s| s.split('?').next()).unwrap_or(norm).trim()
        };
        ("album", id)
    } else if norm.contains("track/") || norm.contains("track:") {
        let id = if norm.contains("track/") {
            norm.split("track/").nth(1).and_then(|s| s.split('?').next()).and_then(|s| s.split('/').next()).unwrap_or(norm).trim()
        } else {
            norm.split("track:").nth(1).and_then(|s| s.split('?').next()).unwrap_or(norm).trim()
        };
        ("track", id)
    } else {
        let id = if norm.contains("playlist/") {
            norm.split("playlist/").nth(1).and_then(|s| s.split('?').next()).and_then(|s| s.split('/').next()).unwrap_or(norm).trim()
        } else if norm.contains("playlist:") {
            norm.split("playlist:").nth(1).and_then(|s| s.split('?').next()).unwrap_or(norm).trim()
        } else {
            norm
        };
        ("playlist", id)
    };

    // If user is connected to Spotify via OAuth, use official API for 100% reliable tracks
    if embed_type == "playlist" {
        if let Ok(rows) = crate::spotify::spotify_playlist_tracks(id.to_string()).await {
            if !rows.is_empty() {
                let mut tracks = Vec::new();
                for r in rows {
                    let title = r.get("t").and_then(|t| t.as_str()).unwrap_or("").trim();
                    if title.is_empty() { continue; }
                    let artist = r.get("a").and_then(|a| a.as_str()).unwrap_or("—").trim();
                    let album = r.get("al").and_then(|al| al.as_str()).unwrap_or("").trim();
                    let dur = r.get("d").and_then(|d| d.as_u64()).unwrap_or(0) as u32;
                    let track_id = r.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let art = r.get("art").and_then(|a| a.as_str()).map(|s| s.to_string());
                    tracks.push(Track {
                        id: track_id.to_string(),
                        s: "sp".into(),
                        t: title.to_string(),
                        a: artist.to_string(),
                        al: album.to_string(),
                        d: dur,
                        art,
                        mode: "web".into(),
                    });
                }
                if !tracks.is_empty() {
                    return Ok(tracks);
                }
            }
        }
    }

    let embed_url = format!("https://open.spotify.com/embed/{embed_type}/{id}");
    let c = client()?;
    let html = c
        .get(&embed_url)
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify error: {e}"))?
        .text()
        .await
        .map_err(|e| format!("reading Spotify page: {e}"))?;

    let json_str = if let Some(start) = html.find("<script id=\"__NEXT_DATA__\"") {
        let after = &html[start..];
        if let Some(tag_close) = after.find('>') {
            let content = &after[tag_close + 1..];
            content.find("</script>").map(|end| &content[..end])
        } else { None }
    } else if let Some(start) = html.find("<script id=\"initial-state\"") {
        let after = &html[start..];
        if let Some(tag_close) = after.find('>') {
            let content = &after[tag_close + 1..];
            content.find("</script>").map(|end| &content[..end])
        } else { None }
    } else {
        None
    };

    let json_str = json_str.ok_or_else(|| "could not find playlist JSON data in Spotify page".to_string())?;
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| format!("parsing Spotify JSON: {e}"))?;

    let entity = data.pointer("/props/pageProps/state/data/entity")
        .or_else(|| data.pointer("/props/pageProps/entity"))
        .ok_or_else(|| "no playlist entity found in Spotify page".to_string())?;
    let default_art = entity
        .pointer("/coverArt/sources/0/url")
        .or_else(|| entity.pointer("/visualIdentity/image/0/url"))
        .or_else(|| entity.pointer("/images/0/url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string());

    let album_title = entity
        .get("name")
        .or_else(|| entity.get("title"))
        .and_then(|n| n.as_str())
        .unwrap_or("")
        .to_string();

    let track_list = entity.get("trackList")
        .or_else(|| entity.pointer("/trackList"))
        .or_else(|| entity.pointer("/tracks/items"))
        .and_then(|t| t.as_array());

    let mut tracks = Vec::new();

    if let Some(list) = track_list {
        for tr in list {
            let title = tr.get("title")
                .or_else(|| tr.get("name"))
                .or_else(|| tr.pointer("/track/name"))
                .and_then(|t| t.as_str()).unwrap_or("").trim();
            if title.is_empty() { continue; }
            let artist = tr.get("subtitle")
                .or_else(|| tr.get("artist"))
                .or_else(|| tr.pointer("/track/artists/0/name"))
                .and_then(|s| s.as_str()).unwrap_or("—").trim();
            let duration_ms = tr.get("duration")
                .or_else(|| tr.get("duration_ms"))
                .or_else(|| tr.pointer("/track/duration_ms"))
                .and_then(|d| d.as_u64()).unwrap_or(0);
            let uri = tr.get("uri")
                .or_else(|| tr.pointer("/track/uri"))
                .and_then(|u| u.as_str()).unwrap_or("");
            let track_id = uri.strip_prefix("spotify:track:").unwrap_or(uri);
            let art = tr.pointer("/coverArt/sources/0/url")
                .or_else(|| tr.pointer("/album/images/0/url"))
                .and_then(|u| u.as_str())
                .map(|s| s.to_string())
                .or_else(|| default_art.clone());

            tracks.push(Track {
                id: track_id.to_string(),
                s: "sp".into(),
                t: title.to_string(),
                a: artist.to_string(),
                al: album_title.clone(),
                d: (duration_ms / 1000) as u32,
                art,
                mode: "web".into(),
            });
        }
    } else if embed_type == "track" {
        let title = entity.get("title").or_else(|| entity.get("name")).and_then(|t| t.as_str()).unwrap_or("").trim();
        if !title.is_empty() {
            let artist = entity.get("subtitle").or_else(|| entity.get("artist")).and_then(|s| s.as_str()).unwrap_or("—").trim();
            let duration_ms = entity.get("duration").or_else(|| entity.get("duration_ms")).and_then(|d| d.as_u64()).unwrap_or(0);
            let uri = entity.get("uri").and_then(|u| u.as_str()).unwrap_or("");
            let track_id = uri.strip_prefix("spotify:track:").unwrap_or(id);
            tracks.push(Track {
                id: track_id.to_string(),
                s: "sp".into(),
                t: title.to_string(),
                a: artist.to_string(),
                al: album_title,
                d: (duration_ms / 1000) as u32,
                art: default_art,
                mode: "web".into(),
            });
        }
    }

    if tracks.is_empty() {
        return Err("no tracks found in Spotify entity".to_string());
    }

    Ok(tracks)
}

/// Fetch tracks from a YouTube Music playlist by URL or ID.
#[tauri::command]
pub async fn ytm_playlist_tracks(url_or_id: String) -> Result<Vec<Track>, String> {
    crate::ytm::playlist(&url_or_id).await
}

/// Fetch tracks from a Yandex Music playlist or album by URL or ID without auth.
#[tauri::command]
pub async fn ym_public_playlist_tracks(url_or_id: String) -> Result<Vec<Track>, String> {
    let raw = url_or_id.trim();
    let c = client()?;

    // 1. Check if user playlist: .../users/{user}/playlists/{kind}
    if raw.contains("/users/") && raw.contains("/playlists/") {
        let parts: Vec<&str> = raw.split("/users/").collect();
        if parts.len() > 1 {
            let after_user = parts[1];
            let user = after_user.split("/playlists/").next().unwrap_or("").trim();
            let kind_raw = after_user.split("/playlists/").nth(1).unwrap_or("").trim();
            let kind = kind_raw.split('?').next().unwrap_or(kind_raw).trim();
            if !user.is_empty() && !kind.is_empty() {
                let api_url = format!("{YM_API}/users/{user}/playlists/{kind}");
                let resp = c.get(&api_url).send().await.map_err(|e| format!("network: {e}"))?;
                if resp.status().is_success() {
                    let v: serde_json::Value = resp.json().await.map_err(|e| format!("json: {e}"))?;
                    if let Some(tracks_arr) = v.pointer("/result/tracks").and_then(|t| t.as_array()) {
                        let tracks: Vec<Track> = tracks_arr.iter().filter_map(|item| {
                            let tr = item.get("track").unwrap_or(item);
                            ym_track(tr)
                        }).collect();
                        if !tracks.is_empty() {
                            return Ok(tracks);
                        }
                    }
                }
            }
        }
    }

    // 2. Check if album: .../album/{id}
    if raw.contains("album/") || raw.contains("/album/") {
        let after = if raw.contains("/album/") {
            raw.split("/album/").nth(1).unwrap_or("")
        } else {
            raw.split("album/").nth(1).unwrap_or("")
        };
        let album_id = after.split('?').next().unwrap_or(after).split('/').next().unwrap_or("").trim();
        if !album_id.is_empty() {
            let api_url = format!("{YM_API}/albums/{album_id}/with-tracks");
            let resp = c.get(&api_url).send().await.map_err(|e| format!("network: {e}"))?;
            if resp.status().is_success() {
                let v: serde_json::Value = resp.json().await.map_err(|e| format!("json: {e}"))?;
                if let Some(vols) = v.pointer("/result/volumes").and_then(|t| t.as_array()) {
                    let mut tracks = Vec::new();
                    for vol in vols {
                        if let Some(arr) = vol.as_array() {
                            for tr in arr {
                                if let Some(t) = ym_track(tr) {
                                    tracks.push(t);
                                }
                            }
                        }
                    }
                    if !tracks.is_empty() {
                        return Ok(tracks);
                    }
                }
            }
        }
    }

    // 3. Check if artist: .../artist/{id}
    if raw.contains("artist/") || raw.contains("/artist/") {
        let after = if raw.contains("/artist/") {
            raw.split("/artist/").nth(1).unwrap_or("")
        } else {
            raw.split("artist/").nth(1).unwrap_or("")
        };
        let artist_id = after.split('?').next().unwrap_or(after).split('/').next().unwrap_or("").trim();
        if !artist_id.is_empty() {
            let api_url = format!("{YM_API}/artists/{artist_id}/tracks?page=0&page-size=50");
            let resp = c.get(&api_url).send().await.map_err(|e| format!("network: {e}"))?;
            if resp.status().is_success() {
                let v: serde_json::Value = resp.json().await.map_err(|e| format!("json: {e}"))?;
                if let Some(items) = v.pointer("/result/tracks").and_then(|t| t.as_array()) {
                    let tracks: Vec<Track> = items.iter().filter_map(ym_track).collect();
                    if !tracks.is_empty() {
                        return Ok(tracks);
                    }
                }
            }
        }
    }

    // 4. Check if single track: .../track/{id}
    if raw.contains("track/") || raw.contains("/track/") {
        let after = if raw.contains("/track/") {
            raw.split("/track/").nth(1).unwrap_or("")
        } else {
            raw.split("track/").nth(1).unwrap_or("")
        };
        let track_id = after.split('?').next().unwrap_or(after).split('/').next().unwrap_or("").trim();
        if !track_id.is_empty() {
            let api_url = format!("{YM_API}/tracks/{track_id}");
            let resp = c.get(&api_url).send().await.map_err(|e| format!("network: {e}"))?;
            if resp.status().is_success() {
                let v: serde_json::Value = resp.json().await.map_err(|e| format!("json: {e}"))?;
                if let Some(items) = v.pointer("/result").and_then(|t| t.as_array()) {
                    let tracks: Vec<Track> = items.iter().filter_map(ym_track).collect();
                    if !tracks.is_empty() {
                        return Ok(tracks);
                    }
                }
            }
        }
    }

    // 5. Check if short playlist URL: .../playlists/{kind}
    if raw.contains("playlists/") {
        let kind = raw.split("playlists/").nth(1).unwrap_or("").split('?').next().unwrap_or("").split('/').next().unwrap_or("").trim();
        if !kind.is_empty() {
            for user in ["yamusic-daily", "yamusic-origin", "yandex-music"] {
                let api_url = format!("{YM_API}/users/{user}/playlists/{kind}");
                if let Ok(resp) = c.get(&api_url).send().await {
                    if resp.status().is_success() {
                        if let Ok(v) = resp.json::<serde_json::Value>().await {
                            if let Some(tracks_arr) = v.pointer("/result/tracks").and_then(|t| t.as_array()) {
                                let tracks: Vec<Track> = tracks_arr.iter().filter_map(|item| {
                                    let tr = item.get("track").unwrap_or(item);
                                    ym_track(tr)
                                }).collect();
                                if !tracks.is_empty() {
                                    return Ok(tracks);
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Err("Could not parse Yandex Music playlist or album".to_string())
}


