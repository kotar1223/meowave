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

/// Cleans raw HTML snippet from Genius data-lyrics-container into plain lines.
pub fn clean_html_lyrics(chunk: &str) -> String {
    let with_newlines = chunk
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("<br>", "\n")
        .replace("</p>", "\n")
        .replace("</div>", "\n");

    let mut in_tag = false;
    let mut text = String::with_capacity(with_newlines.len());
    for ch in with_newlines.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            text.push(ch);
        }
    }

    let decoded = text
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
        .replace("&#8217;", "'")
        .replace("&#8216;", "'")
        .replace("&#8220;", "\"")
        .replace("&#8221;", "\"");

    let filtered_lines: Vec<&str> = decoded
        .lines()
        .map(|l| l.trim())
        .filter(|l| {
            if l.is_empty() {
                return false;
            }
            if l.ends_with("Contributors")
                || l.contains("Translations")
                || l.ends_with(" Lyrics")
                || l.eq_ignore_ascii_case("lyrics")
                || l.starts_with("Embed")
                || l.ends_with("Embed")
                || l.contains("You might also like")
            {
                return false;
            }
            true
        })
        .collect();

    filtered_lines.join("\n")
}

fn find_matching_div_end(html: &str, start: usize, max_end: usize) -> usize {
    let mut depth = 1;
    let mut i = start;
    let bytes = html.as_bytes();
    let limit = max_end.min(bytes.len());

    while i < limit && depth > 0 {
        if bytes[i..limit].starts_with(b"<div") {
            let next_ch = bytes.get(i + 4);
            if next_ch == Some(&b' ') || next_ch == Some(&b'>') || next_ch == Some(&b'/') {
                depth += 1;
                i += 4;
                continue;
            }
        } else if bytes[i..limit].starts_with(b"</div>") {
            depth -= 1;
            if depth == 0 {
                return i;
            }
            i += 6;
            continue;
        }
        i += 1;
    }
    limit
}

/// Extracts lyrics from a full Genius page HTML.
pub fn extract_genius_lyrics(html: &str) -> String {
    let mut out = Vec::new();
    let marker = "data-lyrics-container=\"true\"";
    let mut offset = 0;

    while let Some(pos) = html[offset..].find(marker) {
        let start_marker = offset + pos;
        let tag_close = match html[start_marker..].find('>') {
            Some(i) => start_marker + i + 1,
            None => break,
        };

        let next_container = html[tag_close..]
            .find("data-lyrics-container=\"true\"")
            .map(|i| tag_close + i);

        let max_bound = match next_container {
            Some(np) => np,
            None => {
                let candidates = [
                    html[tag_close..].find("class=\"LyricsEditDesktop"),
                    html[tag_close..].find("<div class=\"SongHeader"),
                    html[tag_close..].find("class=\"Sidebar"),
                ];
                candidates
                    .into_iter()
                    .flatten()
                    .min()
                    .map(|c| tag_close + c)
                    .unwrap_or(html.len().min(tag_close + 12000))
            }
        };

        let end_slice = find_matching_div_end(html, tag_close, max_bound);

        let chunk = &html[tag_close..end_slice];
        let cleaned = clean_html_lyrics(chunk);
        if !cleaned.trim().is_empty() {
            out.push(cleaned);
        }

        offset = match next_container {
            Some(next_pos) => next_pos,
            None => {
                if end_slice > tag_close {
                    end_slice
                } else {
                    html[tag_close..]
                        .chars()
                        .next()
                        .map(|c| tag_close + c.len_utf8())
                        .unwrap_or(html.len())
                }
            }
        };
    }

    out.join("\n\n")
}

/// Looks up lyrics on Genius via public search API and page scrape.
async fn from_genius(artist: &str, title: &str) -> Result<Option<Vec<Line>>, String> {
    let c = client()?;
    let query = if artist.is_empty() {
        title.to_string()
    } else {
        format!("{artist} {title}")
    };
    let q = format!(
        "https://genius.com/api/search/multi?q={}",
        urlencoding::encode(&query)
    );

    let resp = c
        .get(&q)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("genius search: {e}"))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let json: Value = resp.json().await.map_err(|e| format!("genius json: {e}"))?;
    let mut page_url: Option<String> = None;

    if let Some(sections) = json.pointer("/response/sections").and_then(|s| s.as_array()) {
        for s in sections {
            let stype = s.get("type").and_then(|t| t.as_str()).unwrap_or("");
            if stype == "song" || stype == "top_hit" {
                if let Some(hits) = s.get("hits").and_then(|h| h.as_array()) {
                    for h in hits {
                        if let Some(result) = h.get("result") {
                            if let Some(url) = result.get("url").and_then(|u| u.as_str()) {
                                if url.starts_with("https://genius.com/") && !url.contains("/albums/") {
                                    page_url = Some(url.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            if page_url.is_some() {
                break;
            }
        }
    }

    let Some(url) = page_url else {
        return Ok(None);
    };

    let page_resp = c
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("genius page: {e}"))?;

    if !page_resp.status().is_success() {
        return Ok(None);
    }

    let html = page_resp.text().await.map_err(|e| format!("genius html: {e}"))?;
    let text = extract_genius_lyrics(&html);
    let lines = plain_lines(&text);
    if lines.is_empty() {
        Ok(None)
    } else {
        Ok(Some(lines))
    }
}

/// Looks up lyrics for one track, best source first (LRCLIB -> Genius -> YTM).
#[tauri::command]
pub async fn lyrics_get(
    service: Option<String>,
    id: Option<String>,
    artist: Option<String>,
    title: Option<String>,
    album: Option<String>,
    duration: Option<u32>,
) -> Result<Lyrics, String> {
    let service = service.unwrap_or_default();
    let id = id.unwrap_or_default();
    let artist = artist.unwrap_or_default();
    let title = title.unwrap_or_default();
    let album = album.unwrap_or_default();
    let duration = duration.unwrap_or(0);

    // 1. Synced lyrics from LRCLIB first
    if !artist.trim().is_empty() && !title.trim().is_empty() {
        if let Ok(Some((synced, lines))) =
            from_lrclib(artist.trim(), title.trim(), album.trim(), duration).await
        {
            let (final_synced, final_lines) = if !synced && duration > 10 {
                (true, sync_lines(lines, duration))
            } else {
                (synced, lines)
            };
            return Ok(Lyrics {
                source: "lrclib".into(),
                synced: final_synced,
                lines: final_lines,
            });
        }
    }

    // 2. Genius search
    if !artist.trim().is_empty() && !title.trim().is_empty() {
        if let Ok(Some(lines)) = from_genius(artist.trim(), title.trim()).await {
            let (synced, timed_lines) = if duration > 10 {
                (true, sync_lines(lines, duration))
            } else {
                (false, lines)
            };
            return Ok(Lyrics {
                source: "genius".into(),
                synced,
                lines: timed_lines,
            });
        }
    }

    // 3. YouTube Music internal lyrics fallback
    if service == "ytm" {
        if let Ok(Some(text)) = from_ytm(&id).await {
            let lines = plain_lines(&text);
            if !lines.is_empty() {
                let (synced, timed_lines) = if duration > 10 {
                    (true, sync_lines(lines, duration))
                } else {
                    (false, lines)
                };
                return Ok(Lyrics {
                    source: "ytm".into(),
                    synced,
                    lines: timed_lines,
                });
            }
        }
    }

    Ok(Lyrics::none())
}

/// Distributes line timestamps smoothly across the track duration
/// so Genius or plain lyrics have synchronized karaoke timings.
pub fn sync_lines(lines: Vec<Line>, duration: u32) -> Vec<Line> {
    if lines.is_empty() || duration == 0 {
        return lines;
    }
    let total_secs = duration as f64;
    let intro_secs = (total_secs * 0.04).clamp(3.0, 10.0);
    let outro_secs = (total_secs * 0.04).clamp(3.0, 8.0);
    let usable_secs = (total_secs - intro_secs - outro_secs).max(5.0);

    let weights: Vec<f64> = lines
        .iter()
        .map(|l| (l.text.chars().count() as f64).clamp(8.0, 80.0))
        .collect();
    let total_weight: f64 = weights.iter().sum();
    if total_weight <= 0.0 {
        return lines;
    }

    let mut current_time = intro_secs;
    let mut out = Vec::with_capacity(lines.len());
    for (i, line) in lines.into_iter().enumerate() {
        let stamp = (current_time * 10.0).round() / 10.0;
        let line_dur = (weights[i] / total_weight) * usable_secs;
        current_time += line_dur;
        out.push(Line {
            at: Some(stamp),
            text: line.text,
        });
    }
    out
}

/// Explicit Genius search endpoint for user queries.
#[tauri::command]
pub async fn lyrics_search_genius(
    artist: Option<String>,
    title: Option<String>,
    query: Option<String>,
    duration: Option<u32>,
) -> Result<Lyrics, String> {
    let q = query.unwrap_or_default();
    let (a, t) = if !q.trim().is_empty() {
        ("", q.as_str())
    } else {
        (artist.as_deref().unwrap_or(""), title.as_deref().unwrap_or(""))
    };
    if let Ok(Some(lines)) = from_genius(a, t).await {
        let dur = duration.unwrap_or(0);
        let (synced, timed_lines) = if dur > 10 {
            (true, sync_lines(lines, dur))
        } else {
            (false, lines)
        };
        return Ok(Lyrics {
            source: "genius".into(),
            synced,
            lines: timed_lines,
        });
    }
    Ok(Lyrics::none())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_lrc_lines() {
        let lrc = "[00:12.34] Hello world\n[00:15.67] Second line";
        let lines = parse_lrc(lrc);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].text, "Hello world");
        assert_eq!(lines[0].at, Some(12.34));
    }

    #[test]
    fn cleans_html_genius_lyrics() {
        let chunk = "<div>[Verse 1]<br/>I wish I was special<br>You&#x27;re so fucking special<br/>You might also like<br/>14 Contributors<br/>Creep Lyrics<br/>25Embed</div>";
        let cleaned = clean_html_lyrics(chunk);
        assert!(cleaned.contains("[Verse 1]"));
        assert!(cleaned.contains("I wish I was special"));
        assert!(cleaned.contains("You're so fucking special"));
        assert!(!cleaned.contains("You might also like"));
        assert!(!cleaned.contains("14 Contributors"));
        assert!(!cleaned.contains("Creep Lyrics"));
        assert!(!cleaned.contains("Embed"));
    }

    #[test]
    fn extracts_multi_container_lyrics() {
        let html = r#"
            <div data-lyrics-container="true">Line 1<br/>Line 2</div>
            <div class="separator">advertisement</div>
            <div data-lyrics-container="true">Line 3<br/>Line 4</div>
            <div class="LyricsEditDesktop">footer</div>
        "#;
        let extracted = extract_genius_lyrics(html);
        assert!(extracted.contains("Line 1\nLine 2"));
        assert!(extracted.contains("Line 3\nLine 4"));
        assert!(!extracted.contains("advertisement"));
        assert!(!extracted.contains("footer"));
    }

    #[test]
    fn tests_sync_lines_timing_order() {
        let lines = vec![
            Line { at: None, text: "First line".into() },
            Line { at: None, text: "Second longer line here".into() },
            Line { at: None, text: "Third line".into() },
        ];
        let synced = sync_lines(lines, 180);
        assert_eq!(synced.len(), 3);
        assert!(synced[0].at.is_some());
        assert!(synced[1].at.is_some());
        assert!(synced[2].at.is_some());
        assert!(synced[0].at.unwrap() < synced[1].at.unwrap());
        assert!(synced[1].at.unwrap() < synced[2].at.unwrap());
    }

    #[tokio::test]
    #[ignore]
    async fn live_genius_test() {
        let r = lyrics_search_genius(Some("Radiohead".into()), Some("Creep".into()), None, Some(238)).await;
        println!("GENIUS RESULT: {:?}", r.map(|l| (l.source, l.lines.len())));
    }
}

