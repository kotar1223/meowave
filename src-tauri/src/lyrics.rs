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
/// `[offset:+/-ms]` is honoured: per the LRC convention a positive offset
/// makes every line appear that much earlier.
fn parse_lrc(body: &str) -> Vec<Line> {
    let mut out: Vec<Line> = Vec::new();
    let mut offset = 0.0_f64;
    for raw in body.lines() {
        let mut rest = raw.trim_start_matches('\u{feff}');
        let mut stamps: Vec<f64> = Vec::new();

        // Consume every leading [..] group. Metadata tags like [ar:Artist] do
        // not parse as a time and are skipped without emitting a line.
        while rest.starts_with('[') {
            let Some(close) = rest.find(']') else { break };
            let inside = &rest[1..close];
            if let Some(secs) = parse_stamp(inside) {
                stamps.push(secs);
            } else if let Some(ms) = parse_offset(inside) {
                offset = ms / 1000.0;
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
    if offset != 0.0 {
        for l in &mut out {
            l.at = l.at.map(|a| ((a - offset) * 1000.0).round().max(0.0) / 1000.0);
        }
    }
    out.sort_by(|a, b| a.at.partial_cmp(&b.at).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// "mm:ss", "mm:ss.xx", "mm:ss.xxx" and the "mm:ss:xx" variant some
/// players write -> seconds. Digits only: `str::parse::<f64>` used to accept
/// "nan", "inf" and signs, which put lines at NaN or before the start.
fn parse_stamp(s: &str) -> Option<f64> {
    let s = s.trim();
    let digits = |p: &str, max: usize| !p.is_empty() && p.len() <= max && p.bytes().all(|b| b.is_ascii_digit());
    let mut parts = s.splitn(3, ':');
    let m = parts.next()?;
    let rest = parts.next()?;
    let (sec, frac) = match parts.next() {
        Some(f) => (rest, Some(f)),
        None => match rest.split_once('.') {
            Some((a, b)) => (a, Some(b)),
            None => (rest, None),
        },
    };
    if !digits(m, 4) || !digits(sec, 2) || frac.is_some_and(|f| !digits(f, 3)) {
        return None;
    }
    let mins: f64 = m.parse().ok()?;
    let secs: f64 = sec.parse().ok()?;
    let frac = match frac {
        Some(f) => f.parse::<f64>().ok()? / 10f64.powi(f.len() as i32),
        None => 0.0,
    };
    Some(mins * 60.0 + secs + frac)
}

/// `offset:+250` / `offset: -100` -> milliseconds.
fn parse_offset(s: &str) -> Option<f64> {
    let (k, v) = s.split_once(':')?;
    if !k.trim().eq_ignore_ascii_case("offset") {
        return None;
    }
    let v = v.trim();
    let (sign, num) = match v.as_bytes().first()? {
        b'-' => (-1.0, &v[1..]),
        b'+' => (1.0, &v[1..]),
        _ => (1.0, v),
    };
    if num.is_empty() || num.len() > 7 || !num.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some(sign * num.parse::<f64>().ok()?)
}

/// Runs the cleaner and drops the result when nothing sung is left, so the
/// caller moves on to the next source instead of showing an empty panel.
fn finish(source: &str, synced: bool, lines: Vec<Line>, artist: &str, title: &str) -> Option<Lyrics> {
    let lines = crate::lyrics_clean::clean(lines, synced, artist, title);
    if lines.iter().all(|l| l.text.is_empty()) {
        return None;
    }
    let synced = synced && lines.iter().all(|l| l.at.is_some());
    Some(Lyrics { source: source.into(), synced, lines })
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
/// Yandex Music's own lyrics for a Yandex track — timed against the very file
/// that is playing, which no third-party database can promise.
async fn from_ym(track_id: &str) -> Result<Option<(bool, Vec<Line>)>, String> {
    use base64::Engine;
    use hmac::{Hmac, Mac};
    let token = crate::tokens::read_token("ym")?.unwrap_or_default();
    let token = token.trim().trim_start_matches("OAuth ").to_string();
    if token.is_empty() {
        return Ok(None);
    }
    let tid = track_id.split(':').next().unwrap_or(track_id);
    let c = client()?;
    for format in ["LRC", "TEXT"] {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let mut mac = <Hmac<sha2::Sha256> as Mac>::new_from_slice(b"p93jhgh689SBReK6ghtw62").map_err(|e| e.to_string())?;
        mac.update(format!("{tid}{ts}").as_bytes());
        let sign = base64::engine::general_purpose::STANDARD.encode(mac.finalize().into_bytes());
        let url = format!(
            "{}/tracks/{tid}/lyrics?format={format}&timeStamp={ts}&sign={}",
            crate::api::YM_API,
            urlencoding::encode(&sign)
        );
        let Ok(r) = c
            .get(&url)
            .header("Authorization", format!("OAuth {token}"))
            .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
            .send()
            .await
        else {
            continue;
        };
        if !r.status().is_success() {
            continue;
        }
        let v: Value = r.json().await.unwrap_or(Value::Null);
        let Some(dl) = v.pointer("/result/downloadUrl").and_then(|u| u.as_str()) else { continue };
        let Ok(body) = c.get(dl).send().await else { continue };
        let text = body.text().await.unwrap_or_default();
        if format == "LRC" {
            let lines = parse_lrc(&text);
            if !lines.is_empty() {
                return Ok(Some((true, lines)));
            }
        } else {
            let lines = plain_lines(&text);
            if !lines.is_empty() {
                return Ok(Some((false, lines)));
            }
        }
    }
    Ok(None)
}

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
            /* Synced lines are only worth showing when they were timed against
               this recording. The old fallback accepted a hit up to 15 s off
               and used its timestamps anyway — a radio edit's lyrics running
               against the album version drift further behind with every
               verse, which is exactly the "lyrics are out of sync" report.
               Now: synced only within 4 s and only for the same song (the
               matcher checks title and artist); a looser hit gives its plain
               text, unsynced, instead of wrong timings. */
            let mut best_synced: Option<(u32, Value)> = None;
            let mut best_plain: Option<(u32, Value)> = None;
            for it in items {
                let d = it.get("duration").and_then(|d| d.as_f64()).unwrap_or(0.0).round() as u32;
                let tn = it.get("trackName").and_then(|v| v.as_str()).unwrap_or("");
                let an = it.get("artistName").and_then(|v| v.as_str()).unwrap_or("");
                if crate::matching::score(title, artist, duration, tn, an, d).is_none() {
                    continue;
                }
                let gap = if duration == 0 { 0 } else { d.abs_diff(duration) };
                let has_synced = it.get("syncedLyrics").map(|v| v.is_string()).unwrap_or(false);
                if has_synced && gap <= 4 && best_synced.as_ref().map(|(g, _)| gap < *g).unwrap_or(true) {
                    best_synced = Some((gap, it.clone()));
                }
                if gap <= 15 && best_plain.as_ref().map(|(g, _)| gap < *g).unwrap_or(true) {
                    best_plain = Some((gap, it));
                }
            }
            if let Some((_, it)) = best_synced {
                return Some(it);
            }
            best_plain.map(|(_, mut it)| {
                if let Some(o) = it.as_object_mut() {
                    o.remove("syncedLyrics");
                }
                it
            })
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

/// Rounds a byte offset down to the nearest character boundary.
///
/// Slicing a `&str` at an offset inside a multi-byte character panics, and
/// these offsets are arithmetic on byte positions in remote HTML — a 12 000
/// byte cap lands wherever it lands, and a Cyrillic or accented lyric puts a
/// character right across it. `str::floor_char_boundary` is still unstable.
fn char_floor(s: &str, mut i: usize) -> usize {
    if i >= s.len() {
        return s.len();
    }
    while !s.is_char_boundary(i) {
        i -= 1;
    }
    i
}

fn find_matching_div_end(html: &str, start: usize, max_end: usize) -> usize {
    let mut depth = 1;
    let mut i = start;
    let bytes = html.as_bytes();
    /* Everything this returns is either an ASCII `</div>` match or the limit,
       and only the limit can be off a character boundary. */
    let limit = char_floor(html, max_end.min(bytes.len()));

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

/// Genius marks the page furniture inside a lyrics container — contributor
/// count, the translations menu, "Song Lyrics", the description teaser — with
/// `data-exclude-from-selection="true"`, the same flag its own copy button
/// uses to leave them out. Removing those elements here takes all of it out at
/// the source instead of guessing at the text afterwards.
fn strip_excluded(chunk: &str) -> String {
    const FLAG: &str = "data-exclude-from-selection=\"true\"";
    let mut out = String::with_capacity(chunk.len());
    let mut i = 0;
    while let Some(p) = chunk[i..].find(FLAG) {
        let at = i + p;
        let Some(open) = chunk[i..at].rfind('<').map(|o| i + o) else { break };
        let Some(gt) = chunk[at..].find('>').map(|g| at + g + 1) else { break };
        let name: String = chunk[open + 1..].chars().take_while(|c| c.is_ascii_alphanumeric()).collect();
        let end = if chunk[open..gt].ends_with("/>") {
            gt
        } else if name.eq_ignore_ascii_case("div") {
            let e = find_matching_div_end(chunk, gt, chunk.len());
            (e + "</div>".len()).min(chunk.len())
        } else {
            let close = format!("</{name}>");
            chunk[gt..].find(&close).map(|c| gt + c + close.len()).unwrap_or(gt)
        };
        out.push_str(&chunk[i..open]);
        i = end.max(open + 1).min(chunk.len());
        if !chunk.is_char_boundary(i) {
            i = char_floor(chunk, i);
        }
    }
    out.push_str(&chunk[i..]);
    out
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

        let chunk = strip_excluded(&html[tag_close..end_slice]);
        let cleaned = clean_html_lyrics(&chunk);
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

    let (a, t) = (artist.trim(), title.trim());

    // 0. A Yandex track's own synced lyrics.
    let mut ym_plain: Option<Lyrics> = None;
    if service == "ym" && !id.is_empty() {
        match from_ym(&id).await {
            Ok(Some((true, lines))) => {
                if let Some(l) = finish("ym", true, lines, a, t) {
                    return Ok(l);
                }
            }
            Ok(Some((false, lines))) => ym_plain = finish("ym", false, lines, a, t),
            _ => {}
        }
    }

    // 1. Synced lyrics from LRCLIB first
    if !a.is_empty() && !t.is_empty() {
        if let Ok(Some((synced, lines))) = from_lrclib(a, t, album.trim(), duration).await {
            if let Some(l) = finish("lrclib", synced, lines, a, t) {
                return Ok(l);
            }
        }
    }

    if let Some(l) = ym_plain {
        return Ok(l);
    }

    // 2. Genius search
    if !a.is_empty() && !t.is_empty() {
        if let Ok(Some(lines)) = from_genius(a, t).await {
            if let Some(l) = finish("genius", false, lines, a, t) {
                return Ok(l);
            }
        }
    }

    // 3. YouTube Music internal lyrics fallback
    if service == "ytm" {
        if let Ok(Some(text)) = from_ytm(&id).await {
            if let Some(l) = finish("ytm", false, plain_lines(&text), a, t) {
                return Ok(l);
            }
        }
    }

    Ok(Lyrics::none())
}

/// Distributes line timestamps smoothly across the track duration
/// so Genius or plain lyrics have synchronized karaoke timings.
#[allow(dead_code)]
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
    _duration: Option<u32>,
) -> Result<Lyrics, String> {
    let q = query.unwrap_or_default();
    let (a, t) = if !q.trim().is_empty() {
        ("", q.as_str())
    } else {
        (artist.as_deref().unwrap_or(""), title.as_deref().unwrap_or(""))
    };
    if let Ok(Some(lines)) = from_genius(a, t).await {
        // A free-text query has no separate title to strip, so only the
        // catalogue fields are passed when the user did not type one.
        let (ca, ct) = if q.trim().is_empty() { (a, t) } else { ("", "") };
        if let Some(l) = finish("genius", false, lines, ca, ct) {
            return Ok(l);
        }
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
    fn parses_stamp_variants_and_rejects_garbage() {
        assert_eq!(parse_stamp("01:02.5"), Some(62.5));
        assert_eq!(parse_stamp("01:02.50"), Some(62.5));
        assert_eq!(parse_stamp("00:05.123"), Some(5.123));
        assert_eq!(parse_stamp("02:03:45"), Some(123.45));
        assert_eq!(parse_stamp("3:04"), Some(184.0));
        for bad in ["nan:00", "00:inf", "-1:00", "+1:00", "00:1e3", "ar:Artist", "00:", ":12", "00:12.", "00:12.3456"] {
            assert_eq!(parse_stamp(bad), None, "{bad}");
        }
    }

    #[test]
    fn applies_lrc_offset() {
        let lines = parse_lrc("[offset:+500]\n[00:10.00] a\n[00:00.20] b");
        assert_eq!(lines[0].at, Some(0.0));
        assert_eq!(lines[1].at, Some(9.5));
        let lines = parse_lrc("[offset: -250]\n[00:10.00] a");
        assert_eq!(lines[0].at, Some(10.25));
    }

    #[test]
    fn drops_genius_header_marked_excluded() {
        let html = r#"<div data-lyrics-container="true"><div data-exclude-from-selection="true" class="LyricsHeader"><div>84 Contributors</div><div>Translations<ul><li>Español</li><li>Русский</li></ul></div><h2>Creep Lyrics</h2><div>“Creep” is the debut single… <span>Read More</span></div></div>[Verse 1]<br/>When you were here before<br/>Couldn't look you in the eye</div>"#;
        let text = extract_genius_lyrics(html);
        assert!(!text.contains("Contributors"));
        assert!(!text.contains("Español"));
        assert!(!text.contains("Read More"));
        let lines = crate::lyrics_clean::clean(plain_lines(&text), false, "Radiohead", "Creep");
        let got: Vec<&str> = lines.iter().map(|l| l.text.as_str()).collect();
        assert_eq!(got, vec!["When you were here before", "Couldn't look you in the eye"]);
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
    fn a_multibyte_character_across_the_size_cap_does_not_panic() {
        /* The scraper caps an unclosed container at 12 000 bytes past the tag,
           and a Cyrillic or CJK lyric puts a character boundary only every two
           or three bytes — so the cap can land inside a character and slicing
           there panics. That is a crash, not a missing lyric. */
        let head = "<div data-lyrics-container=\"true\">";
        let body = format!("x{}", "あ".repeat(7_000));
        let html = format!("{head}{body}");
        let cap = head.len() + 12_000;
        assert!(
            !html.is_char_boundary(cap),
            "the fixture has to put the cap mid-character or it tests nothing"
        );

        let extracted = extract_genius_lyrics(&html);
        assert!(extracted.contains('あ'));
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
