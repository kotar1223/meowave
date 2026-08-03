//! YouTube Music through the InnerTube endpoints the official clients use.
//!
//! No API key, no sign-in: we identify as the Android music client, which
//! answers guest requests and — unlike the web client — returns stream URLs
//! that are already plain, unsigned links. That keeps playback local, so the
//! EQ, the 3D panner and the visualiser all work, instead of the old iframe
//! that hid the audio from us entirely.

use serde::Serialize;
use serde_json::{json, Value};

use crate::api::{client, Track};

const MUSIC_API: &str = "https://music.youtube.com/youtubei/v1";
const PLAYER_API: &str = "https://youtubei.googleapis.com/youtubei/v1";
/// Public InnerTube key shipped inside the clients themselves; not a secret.
const KEY: &str = "AIzaSyAOghZGza2MQSZkY_zfZ370N-PUdXEo8AI";

/// Search speaks as the Android music app — it returns the nicest song shelves.
const MUSIC_UA: &str = "com.google.android.apps.youtube.music/6.42.52 (Linux; U; Android 13) gzip";

/// Playback speaks as the standalone VR app. Every other guest client now gets
/// "Please sign in" / "Sign in to confirm you're not a bot"; this one still
/// answers anonymously, and its formats carry plain `url` fields with no
/// signature cipher to undo.
pub const VR_UA: &str =
    "com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

fn music_ctx() -> Value {
    json!({
        "client": {
            "clientName": "ANDROID_MUSIC",
            "clientVersion": "6.42.52",
            "androidSdkVersion": 33,
            "osName": "Android",
            "osVersion": "13",
            "hl": "en",
            "gl": "US"
        }
    })
}

fn vr_ctx(visitor: &str) -> Value {
    json!({
        "client": {
            "clientName": "ANDROID_VR",
            "clientVersion": "1.60.19",
            "deviceMake": "Oculus",
            "deviceModel": "Quest 3",
            "androidSdkVersion": 32,
            "osName": "Android",
            "osVersion": "12L",
            "hl": "en",
            "gl": "US",
            "utcOffsetMinutes": 0,
            "visitorData": visitor
        }
    })
}

/// A guest identity token. The player endpoint refuses anonymous calls without
/// one, so we mint it once and reuse it for the session.
static VISITOR: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

async fn visitor_data() -> Result<String, String> {
    if let Some(v) = VISITOR.lock().ok().and_then(|g| g.clone()) {
        return Ok(v);
    }
    let body = json!({
        "context": { "client": { "clientName": "WEB", "clientVersion": "2.20240726.00.00", "hl": "en", "gl": "US" } }
    });
    let resp: Value = client()?
        .post("https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;

    let v = resp
        .pointer("/responseContext/visitorData")
        .and_then(|v| v.as_str())
        .ok_or("YouTube did not issue a visitor id")?
        .to_string();
    if let Ok(mut g) = VISITOR.lock() {
        *g = Some(v.clone());
    }
    Ok(v)
}

async fn post(base: &str, path: &str, ua: &str, visitor: Option<&str>, body: Value) -> Result<Value, String> {
    let mut req = client()?
        .post(format!("{base}/{path}?key={KEY}&prettyPrint=false"))
        .header("User-Agent", ua)
        .header("Content-Type", "application/json")
        .header("X-Goog-Api-Format-Version", "2");
    if let Some(v) = visitor {
        req = req.header("X-Goog-Visitor-Id", v);
    }
    req.json(&body)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube rejected the request: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))
}

/// Walks the whole response tree collecting song rows. The shelf layout
/// changes constantly, so we search by renderer name instead of following a
/// fixed path. The Android client answers with `musicTwoColumnItemRenderer`;
/// the web one still uses `musicResponsiveListItemRenderer`, so accept both.
fn collect<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
    match v {
        Value::Object(map) => {
            for key in [
                "musicTwoColumnItemRenderer",
                "musicResponsiveListItemRenderer",
            ] {
                if let Some(item) = map.get(key) {
                    out.push(item);
                }
            }
            for child in map.values() {
                collect(child, out);
            }
        }
        Value::Array(items) => items.iter().for_each(|i| collect(i, out)),
        _ => {}
    }
}

/// Concatenates a `{ runs: [{text}] }` node.
fn runs_text(node: Option<&Value>) -> String {
    node.and_then(|n| n.get("runs"))
        .and_then(|r| r.as_array())
        .map(|runs| {
            runs.iter()
                .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                .collect::<String>()
        })
        .unwrap_or_default()
}

/// "3:41" / "1:02:07" -> seconds.
fn hms(text: &str) -> u32 {
    let mut total = 0u32;
    for part in text.trim().split(':') {
        let Ok(n) = part.trim().parse::<u32>() else { return 0 };
        total = total * 60 + n;
    }
    total
}

fn flex_runs(item: &Value) -> Vec<String> {
    let mut out = Vec::new();
    if let Some(cols) = item.get("flexColumns").and_then(|c| c.as_array()) {
        for col in cols {
            let runs = col.pointer(
                "/musicResponsiveListItemFlexColumnRenderer/text/runs",
            );
            let Some(runs) = runs.and_then(|r| r.as_array()) else { continue };
            let joined: String = runs
                .iter()
                .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("");
            out.push(joined);
        }
    }
    out
}

fn parse_item(item: &Value) -> Option<Track> {
    // Only song/video rows carry a watch endpoint with a videoId. Albums,
    // artists and playlists point at a browse endpoint and get dropped here.
    let id = item
        .pointer("/navigationEndpoint/watchEndpoint/videoId")
        .or_else(|| item.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId"))
        .or_else(|| item.pointer("/playlistItemData/videoId"))
        .and_then(|v| v.as_str())?
        .to_string();

    // Two-column layout: title + subtitle. List layout: flex columns.
    let two_col_title = runs_text(item.get("title"));
    let (title, meta) = if two_col_title.is_empty() {
        let cols = flex_runs(item);
        let title = cols.first()?.clone();
        (title, cols.get(1).cloned().unwrap_or_default())
    } else {
        (two_col_title, runs_text(item.get("subtitle")))
    };

    if title.is_empty() {
        return None;
    }

    // "Artist • Album • 3:41" — the fields present vary per result type.
    let parts: Vec<&str> = meta.split('•').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
    let artist = parts.first().copied().unwrap_or("—").to_string();
    let duration = parts
        .iter()
        .rev()
        .find(|p| p.contains(':'))
        .map(|p| hms(p))
        .unwrap_or(0);
    let album = parts
        .iter()
        .skip(1)
        .find(|p| !p.contains(':') && !p.ends_with("views") && !p.ends_with("plays"))
        .map(|p| p.to_string())
        .unwrap_or_default();

    let art = item
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
        .or_else(|| item.pointer("/thumbnail/thumbnails"))
        .and_then(|t| t.as_array())
        .and_then(|t| t.last())
        .and_then(|t| t.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| u.replace("w60-h60", "w400-h400").replace("w120-h120", "w400-h400"));

    Some(Track {
        id,
        s: "ytm".into(),
        t: title,
        a: artist,
        al: album,
        d: duration,
        art,
        mode: "local".into(),
    })
}

/// Search restricted to songs (`EgWKAQIIAWoK...` is the songs-only filter the
/// web client sends).
pub async fn search(query: &str) -> Result<Vec<Track>, String> {
    let body = json!({
        "context": music_ctx(),
        "query": query,
        "params": "EgWKAQIIAWoKEAoQAxAEEAkQBQ%3D%3D"
    });
    let resp = post(MUSIC_API, "search", MUSIC_UA, None, body).await?;

    let mut items = Vec::new();
    collect(&resp, &mut items);

    let mut tracks: Vec<Track> = items.iter().filter_map(|i| parse_item(i)).collect();
    // The same video shows up in several shelves; keep the first occurrence.
    let mut seen = std::collections::HashSet::new();
    tracks.retain(|t| seen.insert(t.id.clone()));
    tracks.truncate(25);
    Ok(tracks)
}

#[derive(Serialize)]
pub struct StreamPick {
    pub url: String,
    pub mime: String,
    pub bitrate: u64,
}

async fn player_response(video_id: &str, visitor: &str) -> Result<Value, String> {
    let body = json!({
        "context": vr_ctx(visitor),
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true
    });
    post(PLAYER_API, "player", VR_UA, Some(visitor), body).await
}

fn status_of(r: &Value) -> String {
    r.pointer("/playabilityStatus/status")
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN")
        .to_string()
}

/// Best audio-only stream for a video id.
pub async fn stream(video_id: &str, hq: bool) -> Result<StreamPick, String> {
    // A visitor id that has already answered for another video very often
    // starts returning UNPLAYABLE / LOGIN_REQUIRED for tracks that play
    // perfectly well on a fresh one. Observed reliably: search a query, resolve
    // the first hit, then resolve the second one and it "does not exist".
    //
    // So: try the cached id, and on any refusal mint brand-new ids and retry a
    // couple of times before believing YouTube. Each attempt is a new guest,
    // which is exactly what the real app does after a session expires.
    let mut resp = {
        let cached = visitor_data().await?;
        player_response(video_id, &cached).await?
    };

    for _ in 0..2 {
        if status_of(&resp) == "OK" {
            break;
        }
        if let Ok(mut g) = VISITOR.lock() {
            *g = None;
        }
        let fresh = visitor_data().await?;
        resp = player_response(video_id, &fresh).await?;
    }

    let status = status_of(&resp);
    if status != "OK" {
        let reason = resp
            .pointer("/playabilityStatus/reason")
            .and_then(|r| r.as_str())
            .unwrap_or(&status);
        return Err(format!("YouTube will not play this track: {reason}"));
    }

    let formats = resp
        .pointer("/streamingData/adaptiveFormats")
        .and_then(|f| f.as_array())
        .ok_or("no adaptive formats")?;

    let audio: Vec<&Value> = formats
        .iter()
        .filter(|f| {
            f.get("mimeType")
                .and_then(|m| m.as_str())
                .map(|m| m.starts_with("audio/"))
                .unwrap_or(false)
        })
        // A `signatureCipher` format needs the JS player's decipher routine;
        // the Android client normally hands out plain `url` fields, so skip
        // anything still encrypted rather than shipping a broken link.
        .filter(|f| f.get("url").is_some())
        .collect();

    if audio.is_empty() {
        return Err("no plain audio stream available".into());
    }

    fn bitrate(f: &Value) -> u64 {
        f.get("bitrate").and_then(|b| b.as_u64()).unwrap_or(0)
    }
    let pick = if hq {
        audio.iter().copied().max_by_key(|f| bitrate(f))
    } else {
        audio.iter().copied().min_by_key(|f| bitrate(f))
    }
    .ok_or("no audio stream")?;

    Ok(StreamPick {
        url: pick.get("url").and_then(|u| u.as_str()).ok_or("format has no url")?.to_string(),
        mime: pick
            .get("mimeType")
            .and_then(|m| m.as_str())
            .unwrap_or("audio/mp4")
            .split(';')
            .next()
            .unwrap_or("audio/mp4")
            .to_string(),
        bitrate: bitrate(pick),
    })
}
