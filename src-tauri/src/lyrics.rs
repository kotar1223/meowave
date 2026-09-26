//! Lyrics, in three tiers, all free and all without an API key.
//!
//! 1. **YouTube Music** — for a YouTube track the official client already knows
//!    the lyrics. `next` gives a browse id for the lyrics tab, `browse` returns
//!    the text. This is the same path the real app takes, so it is exactly the
//!    text the user expects to see. Plain text, no timings.
//!
//! 2. **LRCLIB** — a public, key-less, non-commercial lyrics database whose
//!    whole point is *synced* lyrics in LRC format. This is where the per-line
//!    timings come from, and it covers SoundCloud, Yandex and local files just
//!    as well as YouTube because it is looked up by artist/title/duration.
//!
//! 3. **AI transcription** — only when the first two find nothing. Handled in
//!    the frontend against a Whisper endpoint, because it needs the audio the
//!    player already has rather than a second download here.
//!
//! Everything is fetched in Rust rather than the webview: neither endpoint
//! sends CORS headers, and InnerTube wants headers a browser refuses to set.

use serde::Serialize;
use serde_json::Value;

use crate::api::client;

/// One lyric line. `at` is seconds from the start; `None` for plain lyrics.
#[derive(Serialize, Clone)]
pub struct Line {
    pub at: Option<f64>,
    pub text: String,
}

#[derive(Serialize)]
pub struct Lyrics {
    /// "ytm" | "lrclib" | "none"
    pub source: String,
    /// True when every line carries a timestamp and the view can highlight.
    pub synced: bool,
    pub lines: Vec<Line>,
}

impl Lyrics {
    fn none() -> Self {
        Lyrics {
            source: "none".into(),
            synced: false,
            lines: Vec::new(),
        }
    }
}

/// Splits a plain lyrics blob into lines, dropping the blank runs that
/// InnerTube leaves between verses at the start and end.
fn plain_lines(text: &str) -> Vec<Line> {
    text.lines()
        .map(|l| Line {
            at: None,
            text: l.trim_end().to_string(),
        })
        .skip_while(|l| l.text.is_empty())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .skip_while(|l| l.text.is_empty())
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect()
}

/// Parses an LRC body: `[mm:ss.xx] text`, possibly several stamps per line.
fn parse_lrc(body: &str) -> Vec<Line> {
    let mut out: Vec<Line> = Vec::new();
    for raw in body.lines() {
        let mut rest = raw;
        let mut stamps: Vec<f64> = Vec::new();

        // Consume every leading [..] group. Metadata tags like [ar:Artist] do
        // not parse as a time and are skipped without emitting a line.
        while rest.starts_with('[') {
            let Some(close) = rest.find(']') else { break };
            let inside = &rest[1..close];
            if let Some(secs) = parse_stamp(inside) {
                stamps.push(secs);
            }
            rest = &rest[close + 1..];
        }

        let text = rest.trim().to_string();
        if stamps.is_empty() {
            continue;
        }
        for at in stamps {
            out.push(Line {
                at: Some(at),
                text: text.clone(),
            });
        }
    }
    out.sort_by(|a, b| a.at.partial_cmp(&b.at).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// "mm:ss.xx" or "mm:ss" -> seconds. Anything else is not a timestamp.
fn parse_stamp(s: &str) -> Option<f64> {
    let (m, rest) = s.split_once(':')?;
    let mins: f64 = m.trim().parse().ok()?;
    let secs: f64 = rest.trim().parse().ok()?;
    Some(mins * 60.0 + secs)
}

/// YouTube Music: video id -> plain lyrics.
async fn from_ytm(video_id: &str) -> Result<Option<String>, String> {
    let browse_id = crate::ytm::lyrics_browse_id(video_id).await?;
    let Some(browse_id) = browse_id else {
        return Ok(None);
    };
    crate::ytm::lyrics_text(&browse_id).await
}

/// LRCLIB: artist + title (+ duration, which is what makes the match reliable).
async fn from_lrclib(
    artist: &str,
    title: &str,
    album: &str,
    duration: u32,
) -> Result<Option<(bool, Vec<Line>)>, String> {
    let c = client()?;

    // /api/get is the exact match and the one that returns synced lyrics most
    // often. Duration is matched within a couple of seconds by the service.
    let mut url = format!(
        "https://lrclib.net/api/get?artist_name={}&track_name={}",
        urlencoding::encode(artist),
        urlencoding::encode(title)
    );
    if !album.is_empty() {
        url.push_str(&format!("&album_name={}", urlencoding::encode(album)));
    }
    if duration > 0 {
        url.push_str(&format!("&duration={duration}"));
    }

    let resp = c
        .get(&url)
        .header("User-Agent", crate::api::UA)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    // 404 simply means "not in the database", which is not an error worth
    // showing: the caller falls through to the next tier.
    let found: Option<Value> = if resp.status().is_success() {
        resp.json().await.ok()
    } else {
        // Fall back to a fuzzy search when the exact lookup misses. This is
        // what rescues slightly-off titles like "Track (feat. X) [Official]".
        let q = format!(
            "https://lrclib.net/api/search?q={}",
            urlencoding::encode(&format!("{artist} {title}"))
        );
        let mut list: Option<Vec<Value>> = None;
        if let Ok(r) = c.get(&q).header("User-Agent", crate::api::UA).send().await {
            if r.status().is_success() {
                list = r.json::<Vec<Value>>().await.ok();
            }
        }

        list.and_then(|items| {
            // Prefer a hit whose duration is close: the same title by a
            // different artist is the usual wrong answer.
            let mut best: Option<Value> = None;
            let mut best_gap = u32::MAX;
            for it in items {
                let d = it.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0) as u32;
                let gap = if duration == 0 {
                    0
                } else {
                    d.abs_diff(duration)
                };
                let has_synced = it
                    .get("syncedLyrics")
                    .map(|v| !v.is_null())
                    .unwrap_or(false);
                // A synced hit beats a plain one at equal distance.
                let score = gap.saturating_sub(if has_synced { 3 } else { 0 });
                if score < best_gap {
                    best_gap = score;
                    best = Some(it);
                }
            }
            // More than 15 s apart is a different recording.
            if duration > 0 && best_gap > 15 {
                None
            } else {
                best
            }
        })
    };

    let Some(item) = found else { return Ok(None) };

    if let Some(synced) = item.get("syncedLyrics").and_then(|v| v.as_str()) {
        let lines = parse_lrc(synced);
        if !lines.is_empty() {
            return Ok(Some((true, lines)));
        }
    }
    if let Some(plain) = item.get("plainLyrics").and_then(|v| v.as_str()) {
        let lines = plain_lines(plain);
        if !lines.is_empty() {
            return Ok(Some((false, lines)));
        }
    }
    Ok(None)
}

/// Looks up lyrics for one track, best source first.
#[tauri::command]
pub async fn lyrics_get(
    service: String,
    id: String,
    artist: String,
    title: String,
    album: String,
    duration: u32,
) -> Result<Lyrics, String> {
    // Synced beats correct-but-static, so LRCLIB is tried first for everything;
    // YouTube's own text is the fallback that is always right but never timed.
    if !artist.trim().is_empty() && !title.trim().is_empty() {
        if let Ok(Some((synced, lines))) =
            from_lrclib(artist.trim(), title.trim(), album.trim(), duration).await
        {
            return Ok(Lyrics {
                source: "lrclib".into(),
                synced,
                lines,
            });
        }
    }

    if service == "ytm" {
        if let Ok(Some(text)) = from_ytm(&id).await {
            let lines = plain_lines(&text);
            if !lines.is_empty() {
                return Ok(Lyrics {
                    source: "ytm".into(),
                    synced: false,
                    lines,
                });
            }
        }
    }

    Ok(Lyrics::none())
}
