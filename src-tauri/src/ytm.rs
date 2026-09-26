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
    "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

/// The plain Android app, which is what answers today: `status: OK`, several
/// audio formats and every one of them a plain `url` (verified against a batch
/// of ids — both mp4 and webm containers, ranged GET returns 206).
const ANDROID_UA: &str = "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip";

/// UA for the media fetch itself: googlevideo only serves a stream to a client
/// that looks like one of Google's own players, so the bytes are pulled with
/// the identity that asked for the URL.
pub const MEDIA_UA: &str = ANDROID_UA;

/// Clients tried against the player endpoint, first that answers OK wins.
///
/// Google rotates *which* guest client is still allowed to answer
/// anonymously, so the playback identity is a list rather than a constant:
/// when one of them starts returning LOGIN_REQUIRED / UNPLAYABLE the next is
/// tried before the track is reported as broken. That turns the next bump on
/// this treadmill into a one-line edit instead of a release where YouTube
/// Music does not play at all.
const PLAYER_CLIENTS: &[(&str, &str)] = &[
    ("ANDROID", ANDROID_UA),
    ("ANDROID_VR", VR_UA),
    ("ANDROID_MUSIC", MUSIC_UA),
];

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

/// The `context.client` block for one of `PLAYER_CLIENTS`.
///
/// Name and version are what the bot check looks at first, so each client
/// declares the identity its User-Agent claims to be — the two must agree or
/// the request is refused as inconsistent.
fn player_ctx(name: &str, visitor: Option<&str>) -> Value {
    let mut client = match name {
        "ANDROID_VR" => json!({
            "clientName": "ANDROID_VR",
            "clientVersion": "1.65.10",
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
            "clientVersion": "6.42.52",
            "androidSdkVersion": 33,
            "osName": "Android",
            "osVersion": "13",
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
        "params": "EgWKAQIIAWoKEAoQAxAEEAkQBQ=="
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

async fn player_response(
    video_id: &str,
    visitor: Option<&str>,
    client: &str,
    ua: &str,
) -> Result<Value, String> {
    let body = json!({
        "context": player_ctx(client, visitor),
        "videoId": video_id,
        // Missing entirely before: the real app always sends this, and its
        // absence is one more signal the bot check keys on. Requesting the
        // HTML5 player explicitly is also what turns LOGIN_REQUIRED on a normal
        // video into a plain OK — confirmed against a batch of ids that all
        // failed without it and all passed with it.
        "playbackContext": {
            "contentPlaybackContext": { "html5Preference": "HTML5_PREF_WANTS" }
        },
        "contentCheckOk": true,
        "racyCheckOk": true
    });
    post(PLAYER_API, "player", ua, visitor, body).await
}

fn status_of(r: &Value) -> String {
    r.pointer("/playabilityStatus/status")
        .and_then(|s| s.as_str())
        .unwrap_or("UNKNOWN")
        .to_string()
}

/// Best audio-only stream for a video id.
pub async fn stream(video_id: &str, hq: bool, fmt: &str) -> Result<StreamPick, String> {
    // Refusals are handled in two steps:
    //
    //   1. A visitor id that has already answered for another video very often
    //      starts returning UNPLAYABLE / LOGIN_REQUIRED for tracks that play
    //      perfectly well on a fresh one. Observed reliably: search a query,
    //      resolve the first hit, then resolve the second one and it "does not
    //      exist". So mint a new guest and retry the same client once — each
    //      attempt is a new guest, which is what the real app does after a
    //      session expires.
    //
    //   2. If the client itself has fallen out of favour, no amount of new
    //      visitors helps: that is the current state of ANDROID_VR, which
    //      answers LOGIN_REQUIRED for every video. Then the next client in
    //      PLAYER_CLIENTS is tried.
    //
    // The mint itself is best-effort (see `visitor_data`): if it fails we still
    // ask the player, because an anonymous answer beats no answer at all.
    let mut visitor = visitor_data().await;
    let mut resp: Option<Value> = None;
    let mut ok = false;

    'clients: for (client, ua) in PLAYER_CLIENTS {
        for attempt in 0..2u8 {
            let r = player_response(video_id, visitor.as_deref(), client, ua).await?;
            remember_visitor(&r);
            let good = status_of(&r) == "OK";
            resp = Some(r);
            if good {
                ok = true;
                break 'clients;
            }
            if attempt == 0 {
                if let Ok(mut g) = VISITOR.lock() {
                    *g = None;
                }
                let fresh = visitor_data().await;
                // Nothing to vary: the mint itself is unreachable, so a second
                // identical anonymous call can only fail the same way.
                if fresh.is_none() && visitor.is_none() {
                    break;
                }
                visitor = fresh;
            }
        }
    }

    let resp = resp.ok_or("no answer from YouTube")?;
    if !ok {
        let status = status_of(&resp);
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

    // Which container the webview can decode, then the quality flag — see
    // pick_format.
    let pick = pick_format(&audio, hq, fmt).ok_or("no audio stream")?;

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
    use super::pick_format;
    use serde_json::json;

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
}
