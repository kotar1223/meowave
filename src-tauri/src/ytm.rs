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

/// Playback used to speak as the standalone VR app: for a long time it was the
/// only guest client that still answered anonymously with plain `url` fields
/// (no signature cipher to undo).
///
/// It stopped. As of 2026 every video comes back LOGIN_REQUIRED — "Sign in to
/// confirm you're not a bot" — with an empty `streamingData`, so this is now
/// only a fallback (see `PLAYER_CLIENTS`). The version string is the same
/// treadmill: YouTube ties its bot check to how current the client claims to
/// be, so every entry here will need bumping again eventually.
pub const VR_UA: &str =
    "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

/// The plain Android app, which is what answers today: `status: OK`, several
/// audio formats and every one of them a plain `url` (verified against a batch
/// of ids — both mp4 and webm containers, ranged GET returns 206).
const ANDROID_UA: &str = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";
/// 19.29.1 is refused outright now: HTTP 400 "Precondition check failed"
/// for every id, checked against the live endpoint. 20.10.4 is accepted.
pub const IOS_UA: &str = "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";
/// The Android app without `androidSdkVersion` in its context. YouTube holds
/// that variant to the older rules: its URLs are plain and, unlike the full
/// Android client's, are not cut off for lack of a PO token.
pub const SDKLESS_UA: &str = "com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip";
pub const WEB_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

/// UA for the media fetch itself: googlevideo only serves a stream to a client
/// that looks like one of Google's own players, so the bytes are pulled with
/// the identity that asked for the URL.
#[allow(dead_code)]
pub const MEDIA_UA: &str = ANDROID_UA;
#[allow(dead_code)]
pub const TV_UA: &str = "Mozilla/5.0 (SMART-TV; Linux; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/2.2 Chrome/69.0.3497.106 TV Safari/537.36";

/// Clients tried against the player endpoint, in this order until one answers
/// OK *and* its URL survives the deep-range probe (see `probe_deep`).
///
/// Which guest clients still work changes every few weeks, and the failure is
/// rarely a clean refusal: a client can answer OK with plain URLs that serve
/// the first megabyte or two and then 403 — no PO token — so the song starts
/// and dies. That is the "Playback failed" a few seconds in. So the order
/// below is only the starting point: `order()` puts the client that last
/// worked first and the ones that recently failed last, for the session.
const PLAYER_CLIENTS: &[(&str, &str)] = &[
    ("ANDROID_VR", VR_UA),
    ("ANDROID_SDKLESS", SDKLESS_UA),
    ("IOS", IOS_UA),
    ("ANDROID", ANDROID_UA),
    ("ANDROID_TESTSUITE", "Google-Test-Suite"),
];

/// What the session has learned about each client: when it last produced a
/// working URL and when it last failed (refusal, deep-range 403, or a stream
/// that died mid-track).
#[derive(Default, Clone, Copy)]
struct Health {
    ok_at: Option<std::time::Instant>,
    fail_at: Option<std::time::Instant>,
    fails: u32,
}

static HEALTH: std::sync::Mutex<Option<std::collections::HashMap<&'static str, Health>>> = std::sync::Mutex::new(None);
/// A failure older than this no longer counts against a client.
const FAIL_MEMORY: std::time::Duration = std::time::Duration::from_secs(15 * 60);

fn health_of(client: &str) -> Health {
    HEALTH
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|m| m.get(client).copied()))
        .unwrap_or_default()
}

fn health_set(client: &str, ok: bool) {
    let Some(name) = PLAYER_CLIENTS.iter().map(|(n, _)| *n).find(|n| *n == client) else {
        return;
    };
    if let Ok(mut g) = HEALTH.lock() {
        let h = g.get_or_insert_with(Default::default).entry(name).or_default();
        let now = std::time::Instant::now();
        if ok {
            h.ok_at = Some(now);
            h.fails = 0;
        } else {
            h.fail_at = Some(now);
            h.fails = h.fails.saturating_add(1);
        }
    }
}

/// Called by the stream proxy when googlevideo refuses a URL this client
/// minted, so the next resolve starts with a different one.
pub fn note_media_failure(client: &str, why: &str) {
    health_set(client, false);
    eprintln!("[meowave] ytm client {client} failed at the media host: {why}");
}

/// `PLAYER_CLIENTS` in the order worth trying now.
fn order() -> Vec<(&'static str, &'static str)> {
    let mut list: Vec<(usize, (&'static str, &'static str))> = PLAYER_CLIENTS.iter().copied().enumerate().collect();
    list.sort_by_key(|(i, (name, _))| {
        let h = health_of(name);
        let failed = h.fail_at.map(|t| t.elapsed() < FAIL_MEMORY).unwrap_or(false)
            && h.ok_at.map(|ok| h.fail_at.is_some_and(|f| f > ok)).unwrap_or(true);
        let fresh_ok = h.ok_at.map(|t| t.elapsed() < FAIL_MEMORY).unwrap_or(false) && !failed;
        (failed as u8, !fresh_ok as u8, *i)
    });
    list.into_iter().map(|(_, c)| c).collect()
}

/// The last attempts per video, newest last: what the settings self-test and
/// the "Details" button under a failed track show.
static DIAG: std::sync::Mutex<Option<std::collections::HashMap<String, Vec<String>>>> = std::sync::Mutex::new(None);

pub fn diag_note(video_id: &str, line: String) {
    if let Ok(mut g) = DIAG.lock() {
        let m = g.get_or_insert_with(Default::default);
        if m.len() > 64 && !m.contains_key(video_id) {
            m.clear();
        }
        let v = m.entry(video_id.to_string()).or_default();
        v.push(line);
        let n = v.len();
        if n > 16 {
            v.drain(..n - 16);
        }
    }
}

pub fn diag_for(video_id: &str) -> Vec<String> {
    DIAG.lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|m| m.get(video_id).cloned()))
        .unwrap_or_default()
}

/// Outcome of fetching a few bytes from deep inside a stream.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Probe {
    /// 206/200: the URL serves the whole file.
    Ok,
    /// 401/403/410: the URL only serves the start (or nothing).
    Denied(u16),
    /// Timeout, network error or an odd status: no verdict.
    Unknown,
}

/// The byte offset to probe: three quarters into the file, where a URL that
/// only serves the beginning has long stopped answering.
fn deep_offset(clen: Option<u64>) -> u64 {
    match clen {
        Some(n) if n > 8192 => n / 4 * 3,
        Some(_) => 0,
        None => 1_500_000,
    }
}

/// `contentLength` of a format, or the `clen` parameter of its URL.
pub fn clen_of(url: &str, format: Option<&Value>) -> Option<u64> {
    if let Some(n) = format
        .and_then(|f| f.get("contentLength"))
        .and_then(|v| v.as_str().and_then(|s| s.parse().ok()).or_else(|| v.as_u64()))
    {
        return Some(n);
    }
    url_param(url, "clen").and_then(|v| v.parse().ok())
}

pub fn url_param(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    let query = query.split('#').next().unwrap_or(query);
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| v.to_string())
    })
}

pub async fn probe_deep(url: &str, ua: &str, clen: Option<u64>) -> (Probe, u16) {
    let start = deep_offset(clen);
    let Ok(c) = crate::api::media_client() else {
        return (Probe::Unknown, 0);
    };
    let req = c
        .get(url)
        .header("User-Agent", ua)
        .header("Range", format!("bytes={start}-{}", start + 2047));
    let resp = match tokio::time::timeout(std::time::Duration::from_secs(8), req.send()).await {
        Ok(Ok(r)) => r,
        _ => return (Probe::Unknown, 0),
    };
    let code = resp.status().as_u16();
    let verdict = match code {
        200 | 206 => {
            // A refusal can also arrive as an empty 200; a real range has bytes.
            match tokio::time::timeout(std::time::Duration::from_secs(8), resp.bytes()).await {
                Ok(Ok(b)) if !b.is_empty() => Probe::Ok,
                Ok(Ok(_)) => Probe::Denied(code),
                _ => Probe::Unknown,
            }
        }
        // Past the end of a short file: nothing to learn, not a refusal.
        416 => Probe::Ok,
        401 | 403 | 410 => Probe::Denied(code),
        _ => Probe::Unknown,
    };
    (verdict, code)
}

/// The UA a URL must be fetched with: googlevideo checks that the media
/// request comes from the same kind of client the URL was minted for.
pub fn media_ua_for(client: &str) -> &'static str {
    match client {
        "ANDROID_VR" => VR_UA,
        "ANDROID_SDKLESS" => SDKLESS_UA,
        "IOS" => IOS_UA,
        "ANDROID_TESTSUITE" => "Google-Test-Suite",
        _ => ANDROID_UA,
    }
}

fn web_remix_ctx() -> Value {
    json!({
        "client": {
            "clientName": "WEB_REMIX",
            "clientVersion": "1.20240726.01.00",
            "hl": "en",
            "gl": "US"
        }
    })
}

fn music_ctx() -> Value {
    json!({
        "client": {
            "clientName": "ANDROID_MUSIC",
            "clientVersion": "7.20.51",
            "androidSdkVersion": 33,
            "osName": "Android",
            "osVersion": "13",
            "hl": "en",
            "gl": "US"
        }
    })
}

/// The `context.client` block for one of `PLAYER_CLIENTS`.
///
/// Name and version are what the bot check looks at first, so each client
/// declares the identity its User-Agent claims to be — the two must agree or
/// the request is refused as inconsistent.
fn player_ctx(name: &str, visitor: Option<&str>) -> Value {
    let mut client = match name {
        "ANDROID_TESTSUITE" => json!({
            "clientName": "ANDROID_TESTSUITE",
            "clientVersion": "1.9",
            "androidSdkVersion": 30,
            "osName": "Android",
            "osVersion": "11",
            "hl": "en",
            "gl": "US"
        }),
        "ANDROID_VR" => json!({
            "clientName": "ANDROID_VR",
            "clientVersion": "1.61.48",
            "deviceMake": "Oculus",
            "deviceModel": "Quest 3",
            "androidSdkVersion": 32,
            "osName": "Android",
            "osVersion": "12L",
            "hl": "en",
            "gl": "US",
            "utcOffsetMinutes": 0
        }),
        "ANDROID_MUSIC" => json!({
            "clientName": "ANDROID_MUSIC",
            "clientVersion": "7.20.51",
            "androidSdkVersion": 33,
            "osName": "Android",
            "osVersion": "13",
            "hl": "en",
            "gl": "US"
        }),
        "IOS" => json!({
            "clientName": "IOS",
            "clientVersion": "20.10.4",
            "deviceMake": "Apple",
            "deviceModel": "iPhone16,2",
            "osName": "iPhone",
            "osVersion": "18.3.2.22D82",
            "hl": "en",
            "gl": "US"
        }),
        // Same app as ANDROID, minus androidSdkVersion: see SDKLESS_UA.
        "ANDROID_SDKLESS" => json!({
            "clientName": "ANDROID",
            "clientVersion": "20.10.38",
            "osName": "Android",
            "osVersion": "11",
            "hl": "en",
            "gl": "US"
        }),
        "TVHTML5_SIMPLY_EMBEDDED_PLAYER" => json!({
            "clientName": "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
            "clientVersion": "2.0",
            "hl": "en",
            "gl": "US"
        }),
        _ => json!({
            "clientName": "ANDROID",
            "clientVersion": "20.10.38",
            "androidSdkVersion": 34,
            "osName": "Android",
            "osVersion": "14",
            "hl": "en",
            "gl": "US"
        }),
    };
    // Optional: see `visitor_data`. A request without it is answered, just as
    // a guest without a stamped card.
    if let Some(v) = visitor {
        client["visitorData"] = Value::String(v.to_string());
    }
    json!({ "client": client })
}

/// A guest identity token. Best-effort — never a reason to fail a track.
///
/// Minting it is a separate round trip to `www.youtube.com`, the host most
/// likely to be throttled, blocked or rate-limited, and this used to return
/// `Err` on any hiccup: `stream()` bailed out before it ever reached the player
/// endpoint, so "YouTube Music does not play" could have nothing to do with
/// YouTube's answer at all. The player endpoint answers without one too
/// (checked against the same ids with and without), so a missing id now only
/// costs a retry, not the track.
static VISITOR: std::sync::Mutex<Option<String>> = std::sync::Mutex::new(None);

async fn visitor_data() -> Option<String> {
    if let Some(v) = VISITOR.lock().ok().and_then(|g| g.clone()) {
        return Some(v);
    }
    let body = json!({
        "context": { "client": { "clientName": "WEB", "clientVersion": "2.20240726.00.00", "hl": "en", "gl": "US" } }
    });
    let resp: Value = client().ok()?
        .post("https://www.youtube.com/youtubei/v1/visitor_id?prettyPrint=false")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;

    let v = resp.pointer("/responseContext/visitorData")?.as_str()?.to_string();
    if let Ok(mut g) = VISITOR.lock() {
        *g = Some(v.clone());
    }
    Some(v)
}

/// Every player answer carries a (possibly new) visitor id. Remembering it is
/// free and keeps the cached one from going stale after the session expires —
/// the response mints it for us instead of us asking for one.
fn remember_visitor(resp: &Value) {
    if let Some(v) = resp.pointer("/responseContext/visitorData").and_then(|v| v.as_str()) {
        if let Ok(mut g) = VISITOR.lock() {
            *g = Some(v.to_string());
        }
    }
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
                "musicListItemWrapperModel",
                "playlistPanelVideoRenderer",
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
    // 1. Android Modern Element Renderers (musicListItemWrapperModel)
    if let Some(data) = item.get("musicListItemData").or_else(|| item.pointer("/model/musicListItemWrapperModel/musicListItemData")) {
        let id = data.pointer("/onTap/innertubeCommand/watchEndpoint/videoId")
            .or_else(|| data.pointer("/playbackEndpoint/watchEndpoint/videoId"))
            .or_else(|| data.pointer("/navigationEndpoint/watchEndpoint/videoId"))
            .and_then(|v| v.as_str())?
            .to_string();
        let title = data.get("title").and_then(|v| v.as_str())?.to_string();
        let subtitle = data.get("subtitle").and_then(|v| v.as_str()).unwrap_or("");
        let parts: Vec<&str> = subtitle.split('•').map(|p| p.trim()).collect();
        let artist = parts.get(1).copied().unwrap_or(parts.first().copied().unwrap_or("—")).to_string();
        let duration = parts
            .iter()
            .rev()
            .find(|p| p.contains(':'))
            .map(|p| hms(p))
            .or_else(|| {
                data.pointer("/duration/runs/0/text")
                    .or_else(|| data.pointer("/durationText/runs/0/text"))
                    .and_then(|v| v.as_str())
                    .map(hms)
            })
            .unwrap_or(0);
        let art = data.pointer("/thumbnail/image/sources")
            .and_then(|s| s.as_array())
            .and_then(|s| s.last())
            .and_then(|s| s.get("url"))
            .and_then(|u| u.as_str())
            .map(|u| u.to_string());
        return Some(Track {
            id,
            s: "ytm".into(),
            t: title,
            a: artist,
            al: String::new(),
            d: duration,
            art,
            mode: "local".into(),
        });
    }

    // 2. Playlist Panel Video Renderer (watch next / radio)
    if let Some(vid) = item.get("videoId").and_then(|v| v.as_str()) {
        let title = runs_text(item.get("title"));
        if !title.is_empty() {
            let artist = runs_text(item.get("shortBylineText").or_else(|| item.get("longBylineText")));
            let dur = item.get("lengthText")
                .map(|t| runs_text(Some(t)))
                .map(|s| hms(&s))
                .unwrap_or(0);
            let art = item.pointer("/thumbnail/thumbnails")
                .and_then(|t| t.as_array())
                .and_then(|t| t.last())
                .and_then(|t| t.get("url"))
                .and_then(|u| u.as_str())
                .map(|u| u.replace("w60-h60", "w400-h400").replace("w120-h120", "w400-h400"));
            return Some(Track {
                id: vid.to_string(),
                s: "ytm".into(),
                t: title,
                a: if artist.is_empty() { "—".to_string() } else { artist },
                al: String::new(),
                d: dur,
                art,
                mode: "local".into(),
            });
        }
    }

    // 3. Web Responsive List Items and Two-Column Items
    let id = item
        .pointer("/navigationEndpoint/watchEndpoint/videoId")
        .or_else(|| item.pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchEndpoint/videoId"))
        .or_else(|| item.pointer("/playlistItemData/videoId"))
        .and_then(|v| v.as_str())?
        .to_string();

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

/// Radio / related tracks for a video id from the Watch Next queue.
///
/// Asked for as the song's own radio playlist (`RDAMVM<id>`), which is what
/// the YouTube Music app plays after a song: fifty tracks picked by YouTube's
/// recommender instead of the dozen "up next" rows the bare `next` call gave.
/// The old request stays as the fallback.
pub async fn radio(video_id: &str) -> Result<Vec<Track>, String> {
    let mut tracks = watch_playlist(&format!("RDAMVM{video_id}"), Some(video_id)).await.unwrap_or_default();
    if tracks.len() < 5 {
        let body = json!({
            "context": music_ctx(),
            "videoId": video_id,
            "isAudioOnly": true
        });
        if let Ok(resp) = post(MUSIC_API, "next", MUSIC_UA, None, body).await {
            let mut renderers = Vec::new();
            collect(&resp, &mut renderers);
            for r in renderers {
                if let Some(tr) = parse_item(r) {
                    if !tracks.iter().any(|existing: &Track| existing.id == tr.id) {
                        tracks.push(tr);
                    }
                }
            }
        }
    }
    tracks.retain(|t| t.id != video_id);
    if tracks.is_empty() {
        return Err("YouTube Music returned no radio for this track".into());
    }
    Ok(tracks)
}

/// WEB_REMIX calls the way music.youtube.com itself makes them. Browse
/// answers for the web client only come back complete with the site's Origin.
async fn post_web(path: &str, body: Value) -> Result<Value, String> {
    client()?
        .post(format!("{MUSIC_API}/{path}?key={KEY}&prettyPrint=false"))
        .header("User-Agent", WEB_UA)
        .header("Content-Type", "application/json")
        .header("Origin", "https://music.youtube.com")
        .header("Referer", "https://music.youtube.com/")
        .header("X-YouTube-Client-Name", "67")
        .header("X-YouTube-Client-Version", "1.20240726.01.00")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("YouTube rejected the request: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))
}

fn web_ctx_lang(hl: &str) -> Value {
    json!({
        "client": {
            "clientName": "WEB_REMIX",
            "clientVersion": "1.20240726.01.00",
            "hl": hl,
            "gl": if hl == "ru" { "RU" } else { "US" }
        }
    })
}

/// The queue YouTube Music plays for a playlist id: an album (`OLAK5uy_…`),
/// a mix (`RD…`) or a song radio (`RDAMVM…`).
pub async fn watch_playlist(playlist_id: &str, video_id: Option<&str>) -> Result<Vec<Track>, String> {
    let mut body = json!({
        "context": web_remix_ctx(),
        "playlistId": playlist_id,
        "isAudioOnly": true,
        "enablePersistentPlaylistPanel": true,
        "tunerSettingValue": "AUTOMIX_SETTING_NORMAL"
    });
    if let Some(v) = video_id {
        body["videoId"] = Value::String(v.to_string());
    }
    let resp = post_web("next", body).await?;
    let mut renderers = Vec::new();
    collect(&resp, &mut renderers);
    let mut tracks: Vec<Track> = Vec::new();
    for r in renderers {
        if let Some(tr) = parse_item(r) {
            if !tracks.iter().any(|e| e.id == tr.id) {
                tracks.push(tr);
            }
        }
    }
    Ok(tracks)
}

/// Title, artist, length and cover of one video — what a dropped or pasted
/// link needs to become a queue entry. The `next` answer lists the video
/// itself first, with the same fields a search row carries.
pub async fn track_meta(video_id: &str) -> Result<Track, String> {
    let body = json!({
        "context": web_remix_ctx(),
        "videoId": video_id,
        "isAudioOnly": true
    });
    let resp = post_web("next", body).await?;
    let mut renderers = Vec::new();
    collect(&resp, &mut renderers);
    for r in renderers {
        if let Some(tr) = parse_item(r) {
            if tr.id == video_id {
                return Ok(tr);
            }
        }
    }
    // Not a music video: the player endpoint still knows the basics.
    let r = player_response(video_id, None, "ANDROID", ANDROID_UA).await?;
    let d = r.get("videoDetails").ok_or("YouTube does not know this video")?;
    let title = d.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
    if title.is_empty() {
        return Err("YouTube does not know this video".into());
    }
    let author = d.get("author").and_then(|t| t.as_str()).unwrap_or("—").trim_end_matches(" - Topic").to_string();
    let secs = d.get("lengthSeconds").and_then(|t| t.as_str()).and_then(|t| t.parse::<u32>().ok()).unwrap_or(0);
    let art = d
        .pointer("/thumbnail/thumbnails")
        .and_then(|t| t.as_array())
        .and_then(|t| t.last())
        .and_then(|t| t.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| u.to_string());
    Ok(Track {
        id: video_id.to_string(),
        s: "ytm".into(),
        t: title,
        a: author,
        al: String::new(),
        d: secs,
        art,
        mode: "local".into(),
    })
}

fn last_thumb(v: Option<&Value>) -> Option<String> {
    v.and_then(|t| t.as_array())
        .and_then(|t| t.last())
        .and_then(|t| t.get("url"))
        .and_then(|u| u.as_str())
        .map(|u| u.to_string())
}

/// One card of a browse shelf.
fn card_of(item: &Value) -> Option<crate::feeds::Card> {
    use crate::feeds::Card;
    if let Some(two) = item.get("musicTwoRowItemRenderer") {
        let t = runs_text(two.get("title"));
        if t.is_empty() {
            return None;
        }
        let sub = runs_text(two.get("subtitle"));
        let art = last_thumb(two.pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail/thumbnails"));
        let nav = two.get("navigationEndpoint");
        if let Some(vid) = nav.and_then(|n| n.pointer("/watchEndpoint/videoId")).and_then(|v| v.as_str()) {
            let parts: Vec<&str> = sub.split('•').map(|p| p.trim()).filter(|p| !p.is_empty()).collect();
            let artist = parts.iter().find(|p| !p.contains(':') && !p.ends_with("просмотров") && !p.ends_with("views")).copied().unwrap_or("—");
            return Some(Card::track(Track {
                id: vid.to_string(),
                s: "ytm".into(),
                t: t.clone(),
                a: artist.to_string(),
                al: String::new(),
                d: 0,
                art: art.clone(),
                mode: "local".into(),
            }));
        }
        let browse = nav.and_then(|n| n.get("browseEndpoint"))?;
        let bid = browse.get("browseId").and_then(|b| b.as_str())?;
        let page = browse
            .pointer("/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
            .and_then(|p| p.as_str())
            .unwrap_or("");
        let play = two
            .pointer("/thumbnailOverlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchPlaylistEndpoint/playlistId")
            .and_then(|p| p.as_str());
        return match page {
            "MUSIC_PAGE_TYPE_ALBUM" | "MUSIC_PAGE_TYPE_AUDIOBOOK" => {
                Some(Card::new("album", "ytm", play.unwrap_or(bid), &t, &sub, art))
            }
            "MUSIC_PAGE_TYPE_PLAYLIST" => Some(Card::new("playlist", "ytm", bid.trim_start_matches("VL"), &t, &sub, art)),
            "MUSIC_PAGE_TYPE_ARTIST" => Some(Card::new("artist", "ytm", bid, &t, &sub, art)),
            _ => None,
        };
    }
    if let Some(btn) = item.get("musicNavigationButtonRenderer") {
        let t = runs_text(btn.get("buttonText"));
        let be = btn.pointer("/clickCommand/browseEndpoint")?;
        let bid = be.get("browseId").and_then(|b| b.as_str())?;
        let params = be.get("params").and_then(|p| p.as_str()).unwrap_or("");
        let mut c = Card::new("browse", "ytm", &format!("{bid}|{params}"), &t, "", None);
        if let Some(argb) = btn.pointer("/solid/leftStripeColor").and_then(|c| c.as_u64()) {
            c.color = Some(format!("#{:06x}", argb & 0xFF_FFFF));
        }
        return Some(c);
    }
    if let Some(row) = item.get("musicResponsiveListItemRenderer") {
        if let Some(tr) = parse_item(row) {
            return Some(Card::track(tr));
        }
        let cols = flex_runs(row);
        let t = cols.first().cloned().unwrap_or_default();
        if t.is_empty() {
            return None;
        }
        let sub = cols.get(1).cloned().unwrap_or_default();
        let art = last_thumb(row.pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails"));
        let browse = row.pointer("/navigationEndpoint/browseEndpoint")?;
        let bid = browse.get("browseId").and_then(|b| b.as_str())?;
        let page = browse
            .pointer("/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
            .and_then(|p| p.as_str())
            .unwrap_or("");
        let play = row
            .pointer("/overlay/musicItemThumbnailOverlayRenderer/content/musicPlayButtonRenderer/playNavigationEndpoint/watchPlaylistEndpoint/playlistId")
            .and_then(|p| p.as_str());
        return match page {
            "MUSIC_PAGE_TYPE_ALBUM" => Some(Card::new("album", "ytm", play.unwrap_or(bid), &t, &sub, art)),
            "MUSIC_PAGE_TYPE_PLAYLIST" => Some(Card::new("playlist", "ytm", bid.trim_start_matches("VL"), &t, &sub, art)),
            "MUSIC_PAGE_TYPE_ARTIST" => Some(Card::new("artist", "ytm", bid, &t, &sub, art)),
            _ => None,
        };
    }
    None
}

/// Shelves of a YouTube Music browse page: explore, charts, new releases, a
/// mood or genre. Podcasts and episode rows are dropped — this is a music app.
pub async fn browse_shelves(browse_id: &str, params: Option<&str>, hl: &str) -> Result<Vec<crate::feeds::Shelf>, String> {
    let mut body = json!({ "context": web_ctx_lang(hl), "browseId": browse_id });
    if let Some(p) = params.filter(|p| !p.is_empty()) {
        body["params"] = Value::String(p.to_string());
    }
    let resp = post_web("browse", body).await?;
    let mut raw: Vec<&Value> = Vec::new();
    fn walk<'a>(v: &'a Value, out: &mut Vec<&'a Value>) {
        match v {
            Value::Object(map) => {
                for key in ["musicCarouselShelfRenderer", "gridRenderer", "musicShelfRenderer"] {
                    if let Some(s) = map.get(key) {
                        out.push(s);
                        return;
                    }
                }
                for c in map.values() {
                    walk(c, out);
                }
            }
            Value::Array(a) => a.iter().for_each(|i| walk(i, out)),
            _ => {}
        }
    }
    walk(&resp, &mut raw);
    let mut shelves = Vec::new();
    for sh in raw {
        let title = {
            let t = runs_text(sh.pointer("/header/musicCarouselShelfBasicHeaderRenderer/title"));
            if !t.is_empty() {
                t
            } else {
                let g = runs_text(sh.pointer("/header/gridHeaderRenderer/title"));
                if !g.is_empty() {
                    g
                } else {
                    runs_text(sh.get("title"))
                }
            }
        };
        let items = sh
            .get("contents")
            .or_else(|| sh.get("items"))
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();
        let cards: Vec<crate::feeds::Card> = items.iter().filter_map(card_of).collect();
        if cards.is_empty() {
            continue;
        }
        shelves.push(crate::feeds::Shelf { title, s: "ytm".into(), cards });
    }
    Ok(shelves)
}

/// Search YouTube Music songs. Tries WEB_REMIX first, falls back to ANDROID_MUSIC.
pub async fn search(query: &str) -> Result<Vec<Track>, String> {
    // 1. Try WEB_REMIX client first: reliable and structured response
    let web_body = json!({
        "context": web_remix_ctx(),
        "query": query,
        "params": "EgWKAQIIAWoKEAoQAxAEEAkQBQ=="
    });
    if let Ok(resp) = post(MUSIC_API, "search", WEB_UA, None, web_body).await {
        let mut items = Vec::new();
        collect(&resp, &mut items);
        let mut tracks: Vec<Track> = items.iter().filter_map(|i| parse_item(i)).collect();
        if !tracks.is_empty() {
            let mut seen = std::collections::HashSet::new();
            tracks.retain(|t| seen.insert(t.id.clone()));
            tracks.truncate(25);
            return Ok(tracks);
        }
    }

    // 2. Fall back to ANDROID_MUSIC client
    let body = json!({
        "context": music_ctx(),
        "query": query,
        "params": "EgWKAQIIAWoKEAoQAxAEEAkQBQ=="
    });
    let resp = post(MUSIC_API, "search", MUSIC_UA, None, body).await?;
    let mut items = Vec::new();
    collect(&resp, &mut items);
    let mut tracks: Vec<Track> = items.iter().filter_map(|i| parse_item(i)).collect();
    let mut seen = std::collections::HashSet::new();
    tracks.retain(|t| seen.insert(t.id.clone()));
    tracks.truncate(25);
    Ok(tracks)
}

/// Fetch tracks from a YouTube Music playlist by URL or ID.
pub async fn playlist(raw: &str) -> Result<Vec<Track>, String> {
    /// YouTube Music answers a page at a time, roughly 100 tracks each. Twenty
    /// pages is far past what a manual import is for, and it bounds the walk.
    const MAX_PAGES: usize = 20;
    let id = if raw.contains("list=") {
        raw.split("list=").nth(1).and_then(|s| s.split('&').next()).unwrap_or(raw).trim()
    } else {
        raw.trim()
    };
    let browse_id = if id.starts_with("VL") { id.to_string() } else { format!("VL{id}") };

    let mut tracks: Vec<Track> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut body = json!({
        "context": web_remix_ctx(),
        "browseId": browse_id
    });

    for _ in 0..MAX_PAGES {
        let resp = post(MUSIC_API, "browse", WEB_UA, None, body).await?;
        let mut items = Vec::new();
        collect(&resp, &mut items);
        for t in items.iter().filter_map(|i| parse_item(i)) {
            if seen.insert(t.id.clone()) {
                tracks.push(t);
            }
        }
        /* A playlist longer than one response comes back a page at a time and
           the rest is reached through a token. Reading only the first response
           and truncating the result at 100 dropped the rest of every long
           playlist without saying so. */
        let Some(token) = continuation_token(&resp).map(|t| t.to_string()) else {
            break;
        };
        body = json!({
            "context": web_remix_ctx(),
            "continuation": token
        });
    }

    Ok(tracks)
}

/// Finds the next-page token in a browse or search response.
///
/// YouTube Music nests it under a different name depending on which shelf the
/// response came from, so it is looked up by name rather than by walking one
/// fixed path that a response shape change would break.
fn continuation_token(v: &Value) -> Option<&str> {
    fn walk(v: &Value) -> Option<&str> {
        match v {
            Value::Object(map) => {
                for key in [
                    "continuationCommand",
                    "nextContinuationData",
                    "nextRadioContinuationData",
                ] {
                    if let Some(t) = map
                        .get(key)
                        .and_then(|c| c.get("token"))
                        .and_then(|t| t.as_str())
                    {
                        return Some(t);
                    }
                }
                map.values().find_map(walk)
            }
            Value::Array(items) => items.iter().find_map(walk),
            _ => None,
        }
    }
    walk(v)
}

#[derive(Serialize)]
pub struct StreamPick {
    pub url: String,
    pub mime: String,
    pub bitrate: u64,
    /// Player client that answered; the media fetch must use its UA.
    pub client: String,
    /// Format id: the same itag from another client is the same file, byte
    /// for byte, which is what lets the proxy resume a dead stream elsewhere.
    pub itag: u64,
}

async fn player_response(
    video_id: &str,
    visitor: Option<&str>,
    client: &str,
    ua: &str,
) -> Result<Value, String> {
    let mut body = json!({
        "context": player_ctx(client, visitor),
        "videoId": video_id,
        "playbackContext": {
            "contentPlaybackContext": { "html5Preference": "HTML5_PREF_WANTS" }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });
    if client == "TVHTML5_SIMPLY_EMBEDDED_PLAYER" {
        body["thirdParty"] = json!({ "embedUrl": format!("https://www.youtube.com/watch?v={video_id}") });
    }
    post(PLAYER_API, "player", ua, visitor, body).await
}

fn status_of(r: &Value) -> String {
    r.pointer("/playabilityStatus/status")
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN")
        .to_string()
}

/// Audio formats with a plain `url`: adaptive audio first, muxed formats
/// with an audio track only when there is nothing else.
fn audio_formats(resp: &Value) -> Vec<&Value> {
    let with_url = |f: &&Value| f.get("url").and_then(|u| u.as_str()).is_some();
    let mime = |f: &Value| f.get("mimeType").and_then(|m| m.as_str()).unwrap_or("").to_string();
    let adaptive: Vec<&Value> = resp
        .pointer("/streamingData/adaptiveFormats")
        .and_then(|f| f.as_array())
        .map(|a| a.iter().filter(|f| mime(f).starts_with("audio/")).filter(with_url).collect())
        .unwrap_or_default();
    if !adaptive.is_empty() {
        return adaptive;
    }
    resp.pointer("/streamingData/formats")
        .and_then(|f| f.as_array())
        .map(|a| {
            a.iter()
                .filter(|f| {
                    let m = mime(f);
                    m.contains("audio") || m.contains("mp4a") || m.contains("opus")
                })
                .filter(with_url)
                .collect()
        })
        .unwrap_or_default()
}

fn reason_of(r: &Value) -> String {
    let status = status_of(r);
    r.pointer("/playabilityStatus/reason")
        .and_then(|v| v.as_str())
        .map(|s| format!("{status} — {s}"))
        .unwrap_or(status)
}

/// One client's answer for a video, after the visitor-id retry: the response
/// when it is playable, the refusal text when not.
async fn ask_client(video_id: &str, client: &str, ua: &str) -> Result<Value, String> {
    // A visitor id that has already answered for another video very often
    // starts returning UNPLAYABLE / LOGIN_REQUIRED for tracks that play fine
    // on a fresh one, so a refusal is retried once with a new guest — what
    // the real app does after a session expires. The mint itself is
    // best-effort: an anonymous answer beats no answer at all.
    let mut visitor = visitor_data().await;
    let mut last = String::from("no answer");
    for attempt in 0..2u8 {
        match player_response(video_id, visitor.as_deref(), client, ua).await {
            Ok(r) => {
                remember_visitor(&r);
                if status_of(&r) == "OK" && !audio_formats(&r).is_empty() {
                    return Ok(r);
                }
                last = if status_of(&r) == "OK" {
                    "OK, but no plain audio URL".to_string()
                } else {
                    reason_of(&r)
                };
            }
            Err(e) => last = e,
        }
        if attempt == 0 {
            if let Ok(mut g) = VISITOR.lock() {
                *g = None;
            }
            let fresh = visitor_data().await;
            // Nothing to vary: a second identical anonymous call fails the same way.
            if fresh.is_none() && visitor.is_none() {
                break;
            }
            visitor = fresh;
        }
    }
    Err(last)
}

fn pick_of(f: &Value, client: &str) -> Option<StreamPick> {
    Some(StreamPick {
        url: f.get("url")?.as_str()?.to_string(),
        mime: f
            .get("mimeType")
            .and_then(|m| m.as_str())
            .unwrap_or("audio/mp4")
            .split(';')
            .next()
            .unwrap_or("audio/mp4")
            .to_string(),
        bitrate: bitrate(f),
        client: client.to_string(),
        itag: f.get("itag").and_then(|i| i.as_u64()).unwrap_or(0),
    })
}

/// Best audio-only stream for a video id.
///
/// Every client in `order()` is asked in turn; the first whose URL also
/// passes `probe_deep` wins. A client that answers OK but whose URL is cut
/// off past the start is remembered as a last resort rather than used —
/// that is the song that plays a few seconds and dies.
pub async fn stream(video_id: &str, hq: bool, fmt: &str) -> Result<StreamPick, String> {
    let mut refusals: Vec<String> = Vec::new();
    let mut last_resort: Option<StreamPick> = None;
    for (client, ua) in order() {
        let resp = match ask_client(video_id, client, ua).await {
            Ok(r) => r,
            Err(why) => {
                diag_note(video_id, format!("{client}: {why}"));
                refusals.push(format!("{client}: {why}"));
                if why.contains("LOGIN_REQUIRED") || why.contains("UNPLAYABLE") || why.contains("no plain audio") {
                    health_set(client, false);
                }
                continue;
            }
        };
        let audio = audio_formats(&resp);
        let Some(f) = pick_format(&audio, hq, fmt) else { continue };
        let Some(pick) = pick_of(f, client) else { continue };
        let (probe, code) = probe_deep(&pick.url, media_ua_for(client), clen_of(&pick.url, Some(f))).await;
        match probe {
            Probe::Denied(_) => {
                diag_note(video_id, format!("{client}: OK, but the URL is refused past the start (HTTP {code}, no PO token)"));
                health_set(client, false);
                if last_resort.is_none() {
                    last_resort = Some(pick);
                }
            }
            Probe::Ok | Probe::Unknown => {
                let note = if probe == Probe::Ok { "OK, whole file reachable" } else { "OK (deep probe inconclusive)" };
                diag_note(video_id, format!("{client}: {note}, itag {}", pick.itag));
                if probe == Probe::Ok {
                    health_set(client, true);
                }
                return Ok(pick);
            }
        }
    }
    // Better a stream that may die than none: the proxy then tries to resume
    // it through another client (`stream_same_itag`).
    if let Some(p) = last_resort {
        return Ok(p);
    }
    let all = refusals.join("; ");
    Err(if all.is_empty() {
        "YouTube will not play this track: no client answered".to_string()
    } else {
        format!("YouTube will not play this track: {all}")
    })
}

/// The same format from a client not yet tried, for resuming a stream that
/// one client's URL stopped serving. Same itag means the same bytes, so the
/// proxy continues at the very offset where the old URL failed.
pub async fn stream_same_itag(video_id: &str, itag: u64, tried: &[String]) -> Result<StreamPick, String> {
    for (client, ua) in order() {
        if tried.iter().any(|t| t == client) {
            continue;
        }
        let Ok(resp) = ask_client(video_id, client, ua).await else { continue };
        let audio = audio_formats(&resp);
        let found = audio
            .iter()
            .find(|f| f.get("itag").and_then(|i| i.as_u64()) == Some(itag))
            .and_then(|f| pick_of(f, client));
        if let Some(p) = found {
            diag_note(video_id, format!("{client}: resumed the stream with itag {itag}"));
            return Ok(p);
        }
    }
    Err(format!("no other client serves itag {itag}"))
}

/// One row of the settings self-test.
#[derive(Serialize)]
pub struct SelfTest {
    pub client: String,
    pub status: String,
    pub reason: String,
    pub formats: usize,
    /// HTTP status of the first bytes, 0 if not reached.
    pub start: u16,
    /// HTTP status of a range three quarters in, 0 if not reached.
    pub deep: u16,
    pub ms: u64,
}

/// Asks every client for one video and fetches the start and a deep range of
/// its best audio format. Shows the user — and whoever reads their report —
/// exactly which clients still work from their connection.
#[tauri::command]
pub async fn ytm_selftest(video_id: Option<String>) -> Result<Vec<SelfTest>, String> {
    let id = video_id.filter(|v| !v.trim().is_empty()).unwrap_or_else(|| "dQw4w9WgXcQ".to_string());
    let mut out = Vec::new();
    for (client, ua) in PLAYER_CLIENTS.iter().copied() {
        let t0 = std::time::Instant::now();
        let mut row = SelfTest {
            client: client.to_string(),
            status: String::new(),
            reason: String::new(),
            formats: 0,
            start: 0,
            deep: 0,
            ms: 0,
        };
        match player_response(&id, visitor_data().await.as_deref(), client, ua).await {
            Ok(r) => {
                row.status = status_of(&r);
                row.reason = r
                    .pointer("/playabilityStatus/reason")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                let audio = audio_formats(&r);
                row.formats = audio.len();
                if let Some(f) = pick_format(&audio, true, "best") {
                    if let Some(url) = f.get("url").and_then(|u| u.as_str()) {
                        if let Ok(c) = crate::api::media_client() {
                            let first = c
                                .get(url)
                                .header("User-Agent", media_ua_for(client))
                                .header("Range", "bytes=0-2047")
                                .send();
                            if let Ok(Ok(resp)) = tokio::time::timeout(std::time::Duration::from_secs(8), first).await {
                                row.start = resp.status().as_u16();
                            }
                        }
                        row.deep = probe_deep(url, media_ua_for(client), clen_of(url, Some(f))).await.1;
                    }
                }
            }
            Err(e) => {
                row.status = "ERROR".into();
                row.reason = e;
            }
        }
        row.ms = t0.elapsed().as_millis() as u64;
        out.push(row);
    }
    Ok(out)
}

fn bitrate(f: &Value) -> u64 {
    f.get("bitrate").and_then(|b| b.as_u64()).unwrap_or(0)
}

/// Picks one audio format: the container the caller's webview can decode first,
/// then the quality flag within that container.
///
/// Which container decodes is a per-platform fact, and here it decides whether
/// anything plays at all: YouTube hands out Opus-in-WebM by default, Chromium
/// decodes it, but WKWebView on an older macOS and WebKitGTK without the
/// GStreamer plugins refuse the file — the track never starts while SoundCloud
/// and Yandex, both mp3, are fine. That is the "YouTube Music does not play for
/// anyone" shape: it is the only service whose format is not universal.
///
/// `fmt` comes from the frontend (`fmt=mp4` / `fmt=webm` from
/// `canPlayType`); `"best"` is the default and keeps YouTube's own ranking. A
/// video without the requested container falls back to whatever it does have:
/// any audio beats an error.
fn pick_format<'a>(audio: &[&'a Value], hq: bool, fmt: &str) -> Option<&'a Value> {
    let want = match fmt {
        "mp4" => Some("audio/mp4"),
        "webm" => Some("audio/webm"),
        _ => None,
    };
    let pool: Vec<&Value> = match want {
        Some(prefix) => {
            let filtered: Vec<&Value> = audio
                .iter()
                .copied()
                .filter(|f| {
                    f.get("mimeType")
                        .and_then(|m| m.as_str())
                        .map(|m| m.starts_with(prefix))
                        .unwrap_or(false)
                })
                .collect();
            if filtered.is_empty() {
                audio.to_vec()
            } else {
                filtered
            }
        }
        None => audio.to_vec(),
    };
    if hq {
        pool.into_iter().max_by_key(|f| bitrate(f))
    } else {
        pool.into_iter().min_by_key(|f| bitrate(f))
    }
}

/// Browse id for a video's lyrics tab, if it has one.
///
/// `next` returns the tab strip for the watch page; the lyrics tab carries a
/// browse endpoint, and an instrumental or unlicensed track simply has the tab
/// disabled — that is the `None` case, not an error.
pub async fn lyrics_browse_id(video_id: &str) -> Result<Option<String>, String> {
    let body = json!({
        "context": music_ctx(),
        "videoId": video_id,
        "isAudioOnly": true
    });
    let resp = post(MUSIC_API, "next", MUSIC_UA, None, body).await?;

    let tabs = resp.pointer(
        "/contents/singleColumnMusicWatchNextResultsRenderer/tabbedRenderer/watchNextTabbedResultsRenderer/tabs",
    );
    let Some(tabs) = tabs.and_then(|t| t.as_array()) else {
        return Ok(None);
    };

    for tab in tabs {
        let r = tab.pointer("/tabRenderer");
        let Some(r) = r else { continue };
        let title = r
            .pointer("/title")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_lowercase();
        // The tab strip is Queue / Lyrics / Related in that order, but the
        // titles are localised, so match on the browse id's own prefix too.
        let id = r
            .pointer("/endpoint/browseEndpoint/browseId")
            .and_then(|b| b.as_str());
        let Some(id) = id else { continue };
        if title.contains("lyric") || id.starts_with("MPLYt") {
            // A disabled tab still lists an id but is marked unselectable.
            if r.get("unselectable").and_then(|u| u.as_bool()).unwrap_or(false) {
                return Ok(None);
            }
            return Ok(Some(id.to_string()));
        }
    }
    Ok(None)
}

/// The lyrics text behind a browse id.
pub async fn lyrics_text(browse_id: &str) -> Result<Option<String>, String> {
    let body = json!({ "context": music_ctx(), "browseId": browse_id });
    let resp = post(MUSIC_API, "browse", MUSIC_UA, None, body).await?;

    // Modern shape: a description shelf with runs. Older responses put the
    // whole blob in a single `simpleText`, so both are accepted.
    let shelf = resp.pointer(
        "/contents/sectionListRenderer/contents/0/musicDescriptionShelfRenderer/description",
    );
    if let Some(d) = shelf {
        if let Some(s) = d.get("simpleText").and_then(|s| s.as_str()) {
            return Ok(Some(s.to_string()));
        }
        if let Some(runs) = d.get("runs").and_then(|r| r.as_array()) {
            let joined: String = runs
                .iter()
                .filter_map(|r| r.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("");
            if !joined.trim().is_empty() {
                return Ok(Some(joined));
            }
        }
    }
    Ok(None)
}

#[cfg(test)]
mod tests {
    use super::{clen_of, continuation_token, deep_offset, health_set, media_ua_for, order, pick_format, url_param, PLAYER_CLIENTS};
    use serde_json::json;

    /// The failover reads the itag and the length straight off the signed
    /// URL; a fragment the proxy appends must not leak into the value.
    #[test]
    fn reads_parameters_off_a_googlevideo_url() {
        let u = "https://rr1.googlevideo.com/videoplayback?expire=1&itag=251&clen=4096000&mime=audio%2Fwebm#mwua=IOS";
        assert_eq!(url_param(u, "itag").as_deref(), Some("251"));
        assert_eq!(url_param(u, "mime").as_deref(), Some("audio%2Fwebm"));
        assert_eq!(url_param(u, "nope"), None);
        assert_eq!(url_param("https://x/no-query", "itag"), None);
        assert_eq!(clen_of(u, None), Some(4_096_000));
        // The format's own contentLength wins over the URL's.
        assert_eq!(clen_of(u, Some(&json!({"contentLength": "123456"}))), Some(123_456));
    }

    /// The deep probe asks for a range three quarters in — where a URL that
    /// only serves the first megabytes stops answering.
    #[test]
    fn deep_probe_lands_three_quarters_in() {
        assert_eq!(deep_offset(Some(4_000_000)), 3_000_000);
        assert_eq!(deep_offset(Some(1000)), 0);
        assert_eq!(deep_offset(None), 1_500_000);
    }

    /// A client whose URLs were refused moves to the back of the line and
    /// comes back once it works again.
    #[test]
    fn a_failed_client_is_asked_last_until_it_recovers() {
        let first = PLAYER_CLIENTS[0].0;
        health_set(first, false);
        let now: Vec<&str> = order().into_iter().map(|(c, _)| c).collect();
        assert_eq!(now.last().copied(), Some(first));
        assert_eq!(now.len(), PLAYER_CLIENTS.len());
        health_set(first, true);
        let back: Vec<&str> = order().into_iter().map(|(c, _)| c).collect();
        assert_eq!(back.first().copied(), Some(first));
    }

    /// Every client has a media user agent of its own: googlevideo checks it.
    #[test]
    fn every_client_has_its_own_media_user_agent() {
        for (c, ua) in PLAYER_CLIENTS.iter().copied() {
            assert!(!media_ua_for(c).is_empty(), "{c}");
            assert!(!ua.is_empty(), "{c}");
        }
        assert_ne!(media_ua_for("IOS"), media_ua_for("ANDROID_VR"));
    }

    /// A playlist longer than one response is only reachable through this
    /// token, and it is nested under a different name in each shelf shape.
    #[test]
    fn finds_the_next_page_token_wherever_it_is_nested() {
        let modern = json!({
            "contents": {"singleColumnBrowseResultsRenderer": {"tabs": [{"tabRenderer": {
                "content": {"sectionListRenderer": {"contents": [{"musicPlaylistShelfRenderer": {
                    "contents": [
                        {"musicResponsiveListItemRenderer": {"playlistItemData": {"videoId": "v1"}}},
                        {"continuationItemRenderer": {"continuationEndpoint": {
                            "continuationCommand": {"token": "TOKEN-A", "request": "CONTINUATION_REQUEST_TYPE_BROWSE"}
                        }}}
                    ]
                }}]}}
            }}]}}
        });
        assert_eq!(continuation_token(&modern), Some("TOKEN-A"));

        // The older radio/next shape names it differently and keeps it shallow.
        let radio = json!({"contents": [{"nextRadioContinuationData": {"token": "TOKEN-B"}}]});
        assert_eq!(continuation_token(&radio), Some("TOKEN-B"));

        // A single-page playlist has no token at all, and the walk has to stop
        // rather than ask again with nothing.
        let single = json!({"contents": [{"musicResponsiveListItemRenderer": {"videoId": "v1"}}]});
        assert_eq!(continuation_token(&single), None);
    }

    /// The real shape of an adaptiveFormats audio subset: one WebM/Opus pair
    /// around one AAC pair, exactly the numbers YouTube hands out for a
    /// typical music video.
    fn audio() -> Vec<serde_json::Value> {
        vec![
            json!({"mimeType":"audio/mp4; codecs=\"mp4a.40.2\"","bitrate":130677,"url":"u1"}),
            json!({"mimeType":"audio/mp4; codecs=\"mp4a.40.5\"","bitrate":50152,"url":"u2"}),
            json!({"mimeType":"audio/webm; codecs=\"opus\"","bitrate":165002,"url":"u3"}),
            json!({"mimeType":"audio/webm; codecs=\"opus\"","bitrate":49496,"url":"u4"}),
        ]
    }

    fn pick(fmt: &str, hq: bool) -> String {
        let rows = audio();
        let all: Vec<&serde_json::Value> = rows.iter().collect();
        pick_format(&all, hq, fmt)
            .and_then(|f| f.get("url").and_then(|u| u.as_str()))
            .unwrap_or("none")
            .to_string()
    }

    /// A webview that cannot decode Opus must never be handed a WebM file —
    /// that is the whole point of the fmt parameter.
    #[test]
    fn container_preference_is_honoured() {
        assert_eq!(pick("mp4", true), "u1", "hq mp4 must beat webm");
        assert_eq!(pick("mp4", false), "u2");
        assert_eq!(pick("webm", true), "u3");
        assert_eq!(pick("webm", false), "u4");
    }

    /// Without a preference the caller gets YouTube's own extremes, so
    /// "best" behaves exactly as it did before the container logic existed.
    #[test]
    fn best_keeps_the_old_ranking() {
        assert_eq!(pick("best", true), "u3", "highest bitrate overall");
        assert_eq!(pick("best", false), "u4", "lowest bitrate overall");
    }

    /// A video with only one container must still play: falling back beats
    /// an error for a format the caller merely hoped for.
    #[test]
    fn missing_container_falls_back_instead_of_failing() {
        let webm_only = [json!({
            "mimeType":"audio/webm; codecs=\"opus\"","bitrate":165002,"url":"only"
        })];
        let refs: Vec<&serde_json::Value> = webm_only.iter().collect();
        assert_eq!(
            pick_format(&refs, true, "mp4").and_then(|f| f.get("url")).unwrap(),
            "only"
        );
        // No audio formats at all is still an error, not a silent success.
        assert!(pick_format(&[], true, "best").is_none());
    }

    #[tokio::test]
    #[ignore]
    async fn live_ytm_test() {
        let res = super::search("eminem without me").await;
        match &res {
            Ok(tracks) => {
                println!("SEARCH OK, got {} tracks", tracks.len());
                for (i, tr) in tracks.iter().take(3).enumerate() {
                    let st = super::stream(&tr.id, false, "best").await;
                    match st {
                        Ok(pick) => {
                            println!("Track {} ({}: {}) STREAM OK: mime={}, url_prefix={}", i, tr.id, tr.t, pick.mime, &pick.url[..pick.url.len().min(80)]);
                        },
                        Err(e) => println!("Track {} ({}: {}) STREAM ERR: {e}", i, tr.id, tr.t),
                    }
                }
            }
            Err(e) => println!("SEARCH ERR: {e}"),
        }
    }
}
