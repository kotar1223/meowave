//! Streaming service providers: search, track metadata, stream URL resolution.
//!
//! Every network call happens here rather than in the webview. Two reasons:
//! these APIs want Authorization / User-Agent headers a browser refuses to set,
//! and none of them send CORS headers.

use serde::{Deserialize, Serialize};

pub const UA: &str = "Meowave/0.1 (+https://github.com/meowave)";

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

pub fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(UA)
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())
}

fn sec(ms: u64) -> u32 {
    (ms / 1000) as u32
}

/* ═══════════════════ Yandex Music ═══════════════════
   There is no public API, so we speak the same interface the web client does,
   authenticated with the user's own OAuth token from the keychain.
   It hands back a direct file URL, so we play it ourselves (mode: "local").  */

const YM_API: &str = "https://api.music.yandex.net";
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
   A real public API, but the client_id comes from registering an app.
   The user's OAuth token goes into the keychain like every other service.
   The progressive transcoding is plain mp3, so mode: "local".              */

const SC_API: &str = "https://api-v2.soundcloud.com";

/// The token field accepts either an OAuth token or a bare client_id, and the
/// two are authorised differently, so guess which one we were handed.
fn sc_is_oauth(token: &str) -> bool {
    let t = token.trim();
    t.starts_with("OAuth ") || t.contains('-') && t.len() > 40
}

fn sc_req(c: &reqwest::Client, url: &str, token: &str) -> reqwest::RequestBuilder {
    let t = token.trim();
    if sc_is_oauth(t) {
        let v = if t.starts_with("OAuth ") {
            t.to_string()
        } else {
            format!("OAuth {t}")
        };
        c.get(url).header("Authorization", v)
    } else {
        c.get(url).query(&[("client_id", t)])
    }
}

pub async fn sc_search(token: &str, query: &str) -> Result<Vec<Track>, String> {
    let url = format!("{SC_API}/search/tracks?limit=25&q={}", urlencoding::encode(query));
    let body: serde_json::Value = sc_req(&client()?, &url, token)
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

/* ═══════════════════ YouTube Music ═══════════════════
   Their terms don't allow serving the audio outside their own player, so YTM
   is a remote control only: search and metadata through YouTube Data API v3,
   playback through the embedded iframe player (mode: "remote").
   EQ, 3D and the visualiser are dead here — the audio never enters our
   AudioContext.                                                            */

pub async fn ytm_search(api_key: &str, query: &str) -> Result<Vec<Track>, String> {
    let url = format!(
        "https://www.googleapis.com/youtube/v3/search\
         ?part=snippet&type=video&videoCategoryId=10&maxResults=20&q={}&key={}",
        urlencoding::encode(query),
        urlencoding::encode(api_key.trim())
    );
    let body: serde_json::Value = client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube rejected the request: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let items = body.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    Ok(items
        .iter()
        .filter_map(|v| {
            Some(Track {
                id: v.pointer("/id/videoId")?.as_str()?.to_string(),
                s: "ytm".into(),
                t: v.pointer("/snippet/title")?.as_str()?.to_string(),
                a: v.pointer("/snippet/channelTitle")
                    .and_then(|c| c.as_str())
                    .unwrap_or("—")
                    .to_string(),
                al: String::new(),
                // /search doesn't include duration; the iframe player reports
                // it once the video loads.
                d: 0,
                art: v
                    .pointer("/snippet/thumbnails/high/url")
                    .and_then(|u| u.as_str())
                    .map(|s| s.to_string()),
                mode: "remote".into(),
            })
        })
        .collect())
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
            let token = match crate::tokens::read_token(&s) {
                Ok(Some(t)) => t,
                Ok(None) => return (s.clone(), Err("not connected".to_string())),
                Err(e) => return (s.clone(), Err(e)),
            };
            let res = match s.as_str() {
                "ym" => ym_search(&token, &q).await,
                "sc" => sc_search(&token, &q).await,
                "ytm" => ytm_search(&token, &q).await,
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
        "ytm" => ytm_search(t, "test").await.map(|_| true),
        other => Err(format!("unknown service: {other}")),
    }
}
