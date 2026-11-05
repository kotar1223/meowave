//! Local HTTP proxy for audio streams.
//!
//! The URLs Yandex and SoundCloud hand out are signed, short-lived, and come
//! without CORS headers. Point <audio> straight at one and the webview marks
//! the stream cross-origin, after which `createMediaElementSource` returns
//! silence — killing the EQ, the 3D panner and the visualiser.
//!
//! Proxying through 127.0.0.1 makes the stream same-origin. Range requests are
//! passed through, so seeking still works.
//!
//!   GET /stream/<service>/<track_id>?k=<token>&hq=1
//!   GET /health
//!
//! ## Why the token
//!
//! Binding to 127.0.0.1 is not access control. Any page in any browser on the
//! machine can walk the loopback port range, and this proxy is worth attacking:
//! `/stream/local/<id>` reads files off the user's disk, and `/stream/ym/<id>`
//! resolves through the Yandex token in the keychain, so an unauthenticated
//! endpoint hands out both the library and the subscription. The id of a local
//! file is md5 of its path, which is guessable for the usual locations.
//!
//! So every request carries a per-process random token, the `Host` header must
//! name loopback (a page whose own domain resolves to 127.0.0.1 fails this),
//! and CORS is only granted after the token checks out.

use std::collections::HashMap;
use std::sync::Mutex;

use tiny_http::{Header, Response, Server, StatusCode};

/// Short-lived cache of resolved URLs. Without it every seek fires another
/// download-info round trip at the service.
static CACHE: Mutex<Option<HashMap<String, (String, std::time::Instant)>>> = Mutex::new(None);
const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(240);

/// Per-process access token. Handed to the frontend by `stream_info` and
/// required on every request; see the module comment.
static TOKEN: std::sync::OnceLock<String> = std::sync::OnceLock::new();

pub fn token() -> &'static str {
    TOKEN.get_or_init(|| {
        use rand::RngCore;
        let mut raw = [0u8; 24];
        rand::thread_rng().fill_bytes(&mut raw);
        raw.iter().map(|b| format!("{b:02x}")).collect()
    })
}

fn cache_get(key: &str) -> Option<String> {
    let mut guard = CACHE.lock().ok()?;
    let map = guard.get_or_insert_with(HashMap::new);
    match map.get(key) {
        Some((url, at)) if at.elapsed() < CACHE_TTL => Some(url.clone()),
        _ => {
            map.remove(key);
            None
        }
    }
}

fn cache_put(key: String, url: String) {
    if let Ok(mut guard) = CACHE.lock() {
        guard
            .get_or_insert_with(HashMap::new)
            .insert(key, (url, std::time::Instant::now()));
    }
}

fn cache_drop(key: &str) {
    if let Ok(mut guard) = CACHE.lock() {
        if let Some(map) = guard.as_mut() {
            map.remove(key);
        }
    }
}

/// Which file a track's stream is, per stream cache key (round 9: "very
/// strong noise", "plays half, then another song").
///
/// A media element reads one file in many requests: the start, a seek, the
/// rest after a dropped connection. Each request may resolve the track anew,
/// and a new resolve is not always the same file — another YouTube client can
/// sign the DRC or a re-encoded copy under the same itag, a refused YouTube
/// track is answered from Yandex or SoundCloud, a SoundCloud preset can
/// change. Bytes from the middle of another file are garbage to the decoder:
/// AAC turns them into loud noise, WebM into a decode error and a skip.
///
/// So the first request (from byte 0) pins the file's identity, and a later
/// request for a range inside the file is answered only from that same file.
/// When the source really changed, the answer is 409 and the player reloads
/// the track from the start and seeks by time — clean, instead of splicing.
static PINS: Mutex<Option<HashMap<String, (String, std::time::Instant)>>> = Mutex::new(None);
const PIN_TTL: std::time::Duration = std::time::Duration::from_secs(3 * 60 * 60);

/// Identity of the file behind a resolved stream URL: googlevideo names it
/// (itag, length, last-modified, extra tags), anything else by its service
/// and size.
fn file_ident(service: &str, url: &str, alt: Option<&str>, codec: Option<&str>, total: Option<u64>) -> String {
    if url.contains("googlevideo.com") {
        let p = |k: &str| crate::ytm::url_param(url, k).unwrap_or_default();
        return format!("yt:{}:{}:{}:{}", p("itag"), p("clen"), p("lmt"), p("xtags"));
    }
    format!(
        "{}:{}:{}",
        alt.unwrap_or(service),
        codec.unwrap_or(""),
        total.map(|t| t.to_string()).unwrap_or_default()
    )
}

/// May bytes from `start` of the file `ident` be served for `key`? A request
/// from the start (re)pins; a later one must match the pin.
fn pin_ok(key: &str, start: u64, ident: &str) -> bool {
    let Ok(mut g) = PINS.lock() else { return true };
    let m = g.get_or_insert_with(HashMap::new);
    if m.len() > 256 {
        m.retain(|_, (_, at)| at.elapsed() < PIN_TTL);
        if m.len() > 256 {
            m.clear();
        }
    }
    if start > 0 {
        if let Some((pinned, at)) = m.get(key) {
            if at.elapsed() < PIN_TTL && pinned != ident {
                eprintln!("[meowave] {key}: the source changed under the player ({pinned} -> {ident}); asking it to reload");
                return false;
            }
        }
    }
    m.insert(key.to_string(), (ident.to_string(), std::time::Instant::now()));
    true
}

/// The answer to a request for the middle of a file that is no longer the
/// one being played: the player reloads from the start (see `pin_ok`).
fn source_changed(origin: Option<&str>, request: tiny_http::Request) -> Result<(), String> {
    let mut resp = Response::from_string("source changed: reload the track from the start").with_status_code(StatusCode(409));
    for h in cors(origin) {
        resp = resp.with_header(h);
    }
    request.respond(resp).map_err(|e| e.to_string())
}

/// Pipes an upstream response body straight to the client.
///
/// The previous code called `resp.bytes()` and only then answered, so nothing
/// reached `<audio>` until the entire track had been downloaded — a whole FLAC
/// held in RAM and several seconds of silence before playback started. Reading
/// chunk by chunk means the first bytes leave the proxy as soon as they arrive.
enum UpstreamKind {
    Direct(Option<reqwest::Response>),
    /// An HLS rendition read as one file (see `HlsFile`): part `idx`, from
    /// byte `at` of that part.
    Parts {
        file: std::sync::Arc<HlsFile>,
        idx: usize,
        at: u64,
        resp: Option<reqwest::Response>,
        /// Leading bytes still to drop from `resp`: a host that answered a
        /// ranged request with the whole part.
        skip: u64,
    },
}

/// googlevideo serves bounded byte ranges and refuses open-ended ones for
/// several guest clients: `Range: bytes=0-` comes back 403 while a 2 KB probe
/// of the very same URL — the self-test's — is a 206. That was the
/// "failed at the media host: HTTP 403" loop: every client passed the probe,
/// every real stream was refused. So a YouTube stream is pulled the way
/// YouTube's own players pull it, one bounded window after another.
///
/// How big a window may be is not fixed either: from some connections a
/// 2 KB range is a 206 and a 1 MiB one a 403 (the self-test's "win=0KB").
/// A refused window is therefore asked again at a quarter of the size, down
/// to `GV_MIN_WINDOW`, and the size that worked is kept for the session so the
/// next track starts with it instead of failing over to another client first.
const GV_FIRST_WINDOW: u64 = 512 * 1024;
const GV_WINDOW: u64 = 2 * 1024 * 1024;
const GV_MIN_WINDOW: u64 = 64 * 1024;
static GV_CAP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(GV_WINDOW);
/// When the cap last shrank. A refusal can also be about one expired URL, so
/// a smaller cap is not kept forever: after a while full windows are tried again.
static GV_CAP_AT: std::sync::Mutex<Option<std::time::Instant>> = std::sync::Mutex::new(None);
const GV_CAP_MEMORY: std::time::Duration = std::time::Duration::from_secs(10 * 60);

/// The largest window to ask googlevideo for now.
fn gv_window() -> u64 {
    let stale = GV_CAP_AT.lock().ok().and_then(|g| *g).is_some_and(|t| t.elapsed() > GV_CAP_MEMORY);
    if stale {
        GV_CAP.store(GV_WINDOW, std::sync::atomic::Ordering::Relaxed);
        if let Ok(mut g) = GV_CAP_AT.lock() {
            *g = None;
        }
    }
    GV_CAP.load(std::sync::atomic::Ordering::Relaxed).clamp(GV_MIN_WINDOW, GV_WINDOW)
}

/// For the YouTube self-test: the window size in use, in KiB.
pub fn gv_window_kb() -> u64 {
    gv_window() / 1024
}

/// The first window of a stream: small, so playback starts fast.
fn gv_first_window() -> u64 {
    GV_FIRST_WINDOW.min(gv_window())
}

/// A window of `size` was refused: the next request asks for a quarter of it.
/// Returns the new size, or `None` when it is already as small as it goes
/// (the refusal is then about the URL, not the size).
fn gv_shrink(size: u64) -> Option<u64> {
    if size <= GV_MIN_WINDOW {
        return None;
    }
    let next = (size / 4).max(GV_MIN_WINDOW);
    let _ = GV_CAP.fetch_min(next, std::sync::atomic::Ordering::Relaxed);
    if let Ok(mut g) = GV_CAP_AT.lock() {
        *g = Some(std::time::Instant::now());
    }
    eprintln!("[meowave] googlevideo refused a {} KB window, asking for {} KB", size / 1024, next / 1024);
    Some(next)
}

/// A body pulled in bounded windows: the last byte the caller wants and how
/// much to ask for per request.
#[derive(Clone, Copy)]
struct Window {
    end: u64,
    size: u64,
}

/// Pipes an upstream response body straight to the client.
///
/// Supports both direct HTTP chunk streaming (with read timeouts and seamless
/// reconnect) and sequential HLS playlist segment streaming (e.g. for SoundCloud
/// tracks with only HLS transcodings).
type Aes128Ctr = ctr::Ctr128BE<aes::Aes128>;

struct Upstream<'a> {
    // Borrowed from the per-request thread's Arc, which outlives the response.
    rt: &'a tokio::runtime::Runtime,
    /// Yandex's encrypted lossless ("encraw"): AES-128-CTR, zero IV, keyed per
    /// file. CTR is a keystream XOR, so a byte range is decrypted by seeking
    /// the keystream to the range's first byte.
    cipher: Option<Aes128Ctr>,
    kind: UpstreamKind,
    buf: Vec<u8>,
    pos: usize,
    upstream_url: String,
    media_ua: Option<String>,
    bytes_delivered: u64,
    expected_total: Option<u64>,
    initial_offset: u64,
    reconnect_attempts: u8,
    /// YouTube only: how to continue the same file through another client
    /// when googlevideo stops serving this URL mid-track.
    failover: Option<Failover>,
    /// Bounded windows instead of one open-ended request (googlevideo).
    window: Option<Window>,
    /// Last byte of the window currently being read.
    cur_end: u64,
}

/// Everything needed to resume a googlevideo stream elsewhere: the same itag
/// from another client is the same file, so the new URL is simply asked for
/// the byte where the old one stopped.
struct Failover {
    video_id: String,
    itag: u64,
    client: String,
    tried: Vec<String>,
    cache_key: String,
    left: u8,
}

/// How one read from the upstream body went.
enum Step {
    Data(Vec<u8>),
    End,
    Broken,
}

impl<'a> Upstream<'a> {
    fn new(
        rt: &'a tokio::runtime::Runtime,
        resp: Option<reqwest::Response>,
        upstream_url: String,
        media_ua: Option<String>,
        expected_total: Option<u64>,
        initial_offset: u64,
    ) -> Self {
        Self {
            rt,
            cipher: None,
            kind: UpstreamKind::Direct(resp),
            buf: Vec::new(),
            pos: 0,
            upstream_url,
            media_ua,
            bytes_delivered: 0,
            expected_total,
            initial_offset,
            reconnect_attempts: 0,
            failover: None,
            window: None,
            cur_end: 0,
        }
    }

    /// An HLS file from part `idx`, byte `at` of it; `limit` bytes in all
    /// (`None`: to the end, sizes unknown).
    fn parts(rt: &'a tokio::runtime::Runtime, file: std::sync::Arc<HlsFile>, idx: usize, at: u64, limit: Option<u64>) -> Self {
        let media_ua = file.ua.clone();
        Self {
            rt,
            cipher: None,
            kind: UpstreamKind::Parts { file, idx, at, resp: None, skip: 0 },
            buf: Vec::new(),
            pos: 0,
            upstream_url: String::new(),
            media_ua,
            bytes_delivered: 0,
            expected_total: limit,
            initial_offset: 0,
            reconnect_attempts: 0,
            failover: None,
            window: None,
            cur_end: 0,
        }
    }
}

impl<'a> Upstream<'a> {
    /// Decrypts the body with `key_hex`, starting at byte `offset` of the file.
    fn with_key(mut self, key_hex: &str, offset: u64) -> Self {
        use aes::cipher::{KeyIvInit, StreamCipherSeek};
        let key: Vec<u8> = (0..key_hex.len() / 2)
            .filter_map(|i| u8::from_str_radix(&key_hex[i * 2..i * 2 + 2], 16).ok())
            .collect();
        if key.len() == 16 {
            let mut c = Aes128Ctr::new(key.as_slice().into(), &[0u8; 16].into());
            c.seek(offset);
            self.cipher = Some(c);
        }
        self
    }

    fn with_failover(mut self, f: Option<Failover>) -> Self {
        self.failover = f;
        self
    }

    /// Reads in bounded windows up to `end` (inclusive); `first_end` is where
    /// the response already in hand stops.
    fn with_window(mut self, w: Option<Window>, first_end: u64) -> Self {
        self.window = w;
        self.cur_end = first_end;
        self
    }

    /// The Range header for a request from `offset`: open-ended, or the next
    /// window when the body is read in windows.
    fn range_from(&mut self, offset: u64) -> String {
        match self.window {
            Some(w) => {
                let last = offset.saturating_add(w.size - 1).min(w.end);
                self.cur_end = last;
                format!("bytes={offset}-{last}")
            }
            None => format!("bytes={offset}-"),
        }
    }

    /// A ranged GET from `offset`. At offset 0 a 200 is as good as a 206; past
    /// it only a 206 is, since a 200 would restart the file mid-stream.
    fn fetch_from(&mut self, url: &str, ua: Option<&str>, offset: u64) -> Result<reqwest::Response, u16> {
        loop {
            let range = self.range_from(offset);
            let got = self.rt.block_on(async {
                let c = crate::api::media_client().map_err(|_| 0u16)?;
                let mut req = c.get(url).header("Range", range);
                if let Some(ua) = ua {
                    req = req.header("User-Agent", ua);
                }
                match tokio::time::timeout(std::time::Duration::from_secs(20), req.send()).await {
                    Ok(Ok(r)) => {
                        let code = r.status().as_u16();
                        if code == 206 || (code == 200 && offset == 0) {
                            Ok(r)
                        } else {
                            Err(code)
                        }
                    }
                    _ => Err(0),
                }
            });
            // A refused window: the same URL with a smaller one before the
            // URL itself is given up on.
            if got.as_ref().err() == Some(&403) {
                if let Some(w) = self.window.as_mut() {
                    if let Some(next) = gv_shrink(w.size) {
                        w.size = next;
                        continue;
                    }
                }
            }
            return got;
        }
    }

    /// Picks the stream up again at the byte where it stopped: the same URL
    /// first (a dropped connection), then — for YouTube — the same file
    /// through another client (a URL that stopped being served).
    fn reconnect(&mut self) -> bool {
        if self.upstream_url.is_empty() {
            return false;
        }
        let offset = self.initial_offset + self.bytes_delivered;
        while self.reconnect_attempts < 3 {
            self.reconnect_attempts += 1;
            let url = self.upstream_url.clone();
            let ua = self.media_ua.clone();
            match self.fetch_from(&url, ua.as_deref(), offset) {
                Ok(r) => {
                    self.kind = UpstreamKind::Direct(Some(r));
                    return true;
                }
                // Refused: the same URL will not recover, only another one can.
                Err(401) | Err(403) | Err(410) => break,
                Err(_) => {
                    let wait = 300 * self.reconnect_attempts as u64;
                    self.rt.block_on(tokio::time::sleep(std::time::Duration::from_millis(wait)));
                }
            }
        }
        let Some(mut f) = self.failover.take() else { return false };
        let mut resumed = false;
        while f.left > 0 && !resumed {
            f.left -= 1;
            crate::ytm::note_media_failure(&f.client, &format!("stopped at byte {offset}"));
            f.tried.push(f.client.clone());
            let same_as = self.upstream_url.clone();
            let pick = self.rt.block_on(crate::ytm::stream_same_itag(&f.video_id, f.itag, &f.tried, &same_as));
            let Ok(pick) = pick else { break };
            let ua = crate::ytm::media_ua_for(&pick.client);
            if let Ok(r) = self.fetch_from(&pick.url, Some(ua), offset) {
                cache_put(f.cache_key.clone(), format!("{}#mwua={}", pick.url, pick.client));
                self.upstream_url = pick.url.clone();
                self.media_ua = Some(ua.to_string());
                self.kind = UpstreamKind::Direct(Some(r));
                self.reconnect_attempts = 0;
                f.client = pick.client;
                resumed = true;
            } else {
                f.client = pick.client;
            }
        }
        if !resumed {
            note_err(&format!("ytm/{}", f.video_id), format!("the stream stopped at {} and no other client could continue it", human_bytes(offset)));
        }
        self.failover = Some(f);
        resumed
    }
}

fn human_bytes(n: u64) -> String {
    if n >= 1_048_576 {
        format!("{:.1} MB", n as f64 / 1_048_576.0)
    } else {
        format!("{} KB", n / 1024)
    }
}

/// The last thing that went wrong per `service/id`, for `stream_diag`.
static LAST_ERR: Mutex<Option<HashMap<String, String>>> = Mutex::new(None);

fn note_err(key: &str, msg: String) {
    if let Ok(mut g) = LAST_ERR.lock() {
        let m = g.get_or_insert_with(HashMap::new);
        if m.len() > 128 {
            m.clear();
        }
        m.insert(key.to_string(), msg);
    }
}

/// What is known about why a track did not play: the proxy's last error and,
/// for YouTube, every client's answer. Shown under "Details" when playback
/// fails, so a report says more than "Playback failed".
#[tauri::command]
pub fn stream_diag(service: String, id: String) -> String {
    let mut lines: Vec<String> = Vec::new();
    if service == "ytm" {
        lines.extend(crate::ytm::diag_for(&id));
    }
    if let Some(e) = LAST_ERR
        .lock()
        .ok()
        .and_then(|g| g.as_ref().and_then(|m| m.get(&format!("{service}/{id}")).cloned()))
    {
        lines.push(format!("proxy: {e}"));
    }
    lines.join("\n")
}

/// One piece of an HLS rendition: the init section or a segment, with the
/// byte window inside its URL when the playlist addresses sub-ranges
/// (`#EXT-X-BYTERANGE`) and its size once known.
#[derive(Clone, Debug, PartialEq)]
struct HlsPart {
    url: String,
    sub: Option<(u64, u64)>,
    len: Option<u64>,
}

/// An HLS rendition laid out as one file: init section first, then every
/// segment, back to back.
///
/// SoundCloud now serves many tracks as AAC in fragmented MP4 (CMAF) only:
/// `#EXT-X-MAP` names an `init.mp4` and the segments are `.m4s` fragments
/// that mean nothing without it. The old proxy dropped the map and served the
/// fragments with no length and `Accept-Ranges: none`, so those tracks never
/// started ("the service answered, but the file did not play"), and the ones
/// that did could not seek. Init + fragments *is* a valid fragmented MP4, and
/// with every part's size known (a HEAD each, in parallel) the proxy can give
/// the media element what it gives for a plain file: an exact
/// Content-Length, real 206 ranges, a true duration and seeking.
struct HlsFile {
    parts: Vec<HlsPart>,
    /// Sum of the part sizes; `None` when some size could not be learnt.
    total: Option<u64>,
    ctype: &'static str,
    ua: Option<String>,
}

impl HlsFile {
    /// The part holding byte `pos` of the whole file, and the offset in it.
    fn locate(&self, pos: u64) -> (usize, u64) {
        let mut start = 0u64;
        for (i, p) in self.parts.iter().enumerate() {
            let len = p.len.unwrap_or(0);
            if pos < start + len {
                return (i, pos - start);
            }
            start += len;
        }
        (self.parts.len(), 0)
    }
}

/// Identity of a measured HLS file for `pin_ok`: its rendition and size.
fn hls_ident(file: &HlsFile) -> String {
    let first = file.parts.first().map(|p| p.url.split('?').next().unwrap_or("").to_string()).unwrap_or_default();
    // The CDN path names the transcoding; signatures in the query change on
    // every resolve and say nothing about the bytes.
    let rendition = first.rsplit('/').nth(1).unwrap_or("").to_string();
    format!("hls:{}:{}:{rendition}", file.ctype, file.total.map(|t| t.to_string()).unwrap_or_default())
}

/// `KEY=value` / `KEY="value"` out of an HLS attribute list.
fn hls_attr(list: &str, key: &str) -> Option<String> {
    let mut rest = list;
    loop {
        let item = rest.trim_start_matches([',', ' ']);
        let (k, after) = item.split_once('=')?;
        let (v, next) = match after.strip_prefix('"') {
            Some(q) => {
                let end = q.find('"')?;
                (&q[..end], &q[end + 1..])
            }
            None => match after.find(',') {
                Some(i) => (&after[..i], &after[i..]),
                None => (after, ""),
            },
        };
        if k.trim().eq_ignore_ascii_case(key) {
            return Some(v.trim().to_string());
        }
        if next.is_empty() {
            return None;
        }
        rest = next;
    }
}

/// `<length>[@<offset>]`.
fn hls_byterange(v: &str) -> Option<(u64, Option<u64>)> {
    let v = v.trim().trim_matches('"');
    match v.split_once('@') {
        Some((n, o)) => Some((n.trim().parse().ok()?, Some(o.trim().parse().ok()?))),
        None => Some((v.parse().ok()?, None)),
    }
}

/// Parts of a media playlist, in playback order: the init section (once),
/// then the segments. Encrypted renditions are refused — decrypting them is
/// not this proxy's business.
fn hls_parts(playlist: &str, base: &str) -> Result<Vec<HlsPart>, String> {
    let mut parts: Vec<HlsPart> = Vec::new();
    let mut maps: Vec<String> = Vec::new();
    let mut pending: Option<(u64, Option<u64>)> = None;
    // A sub-range without an offset starts where the previous one of the
    // same resource ended.
    let mut next_off: HashMap<String, u64> = HashMap::new();
    let mut place = |url: &str, r: Option<(u64, Option<u64>)>| -> Option<(u64, u64)> {
        let (len, off) = r?;
        let off = off.unwrap_or_else(|| next_off.get(url).copied().unwrap_or(0));
        next_off.insert(url.to_string(), off + len);
        Some((off, len))
    };
    for line in playlist.lines().map(str::trim) {
        if line.is_empty() {
            continue;
        }
        if let Some(a) = line.strip_prefix("#EXT-X-KEY:") {
            let method = hls_attr(a, "METHOD").unwrap_or_default();
            if !method.eq_ignore_ascii_case("NONE") {
                return Err(format!("encrypted HLS ({method})"));
            }
        } else if let Some(a) = line.strip_prefix("#EXT-X-MAP:") {
            let Some(uri) = hls_attr(a, "URI") else { continue };
            let url = resolve_hls_url(base, &uri);
            let r = hls_attr(a, "BYTERANGE").and_then(|v| hls_byterange(&v));
            let key = format!("{url} {r:?}");
            if maps.contains(&key) {
                continue;
            }
            maps.push(key);
            let sub = place(&url, r);
            parts.push(HlsPart { len: sub.map(|s| s.1), url, sub });
        } else if let Some(v) = line.strip_prefix("#EXT-X-BYTERANGE:") {
            pending = hls_byterange(v);
        } else if !line.starts_with('#') {
            let url = resolve_hls_url(base, line);
            let sub = place(&url, pending.take());
            parts.push(HlsPart { len: sub.map(|s| s.1), url, sub });
        }
    }
    Ok(parts)
}

/// The variant of a master playlist to play: the highest bandwidth, or the
/// lowest in data-saver mode.
fn hls_variant(master: &str, base: &str, low: bool) -> Option<String> {
    let mut best: Option<(u64, String)> = None;
    let mut lines = master.lines().map(str::trim);
    while let Some(l) = lines.next() {
        let Some(a) = l.strip_prefix("#EXT-X-STREAM-INF:") else { continue };
        let bw: u64 = hls_attr(a, "BANDWIDTH").and_then(|v| v.parse().ok()).unwrap_or(0);
        let Some(uri) = lines.by_ref().find(|x| !x.is_empty() && !x.starts_with('#')) else { break };
        let better = match &best {
            None => true,
            Some((b, _)) => (low && bw < *b) || (!low && bw > *b),
        };
        if better {
            best = Some((bw, resolve_hls_url(base, uri)));
        }
    }
    best.map(|b| b.1)
}

/// What the joined parts are, by the segments' extension.
fn hls_ctype(parts: &[HlsPart], has_map: bool) -> &'static str {
    let ext = parts
        .last()
        .map(|p| {
            let path = p.url.split(['?', '#']).next().unwrap_or("");
            let name = path.rsplit('/').next().unwrap_or("");
            name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase()).unwrap_or_default()
        })
        .unwrap_or_default();
    match ext.as_str() {
        "mp3" => "audio/mpeg",
        "aac" => "audio/aac",
        "opus" | "ogg" | "oga" => "audio/ogg",
        "ts" => "video/mp2t",
        "m4s" | "mp4" | "m4a" | "cmfa" | "m4f" => "audio/mp4",
        _ if has_map => "audio/mp4",
        _ => "audio/mpeg",
    }
}

/// Size of one part: a one-byte range, whose Content-Range carries it, or a
/// HEAD for a host without ranges.
async fn part_size(c: &reqwest::Client, url: &str, ua: Option<&str>) -> Option<u64> {
    let wait = std::time::Duration::from_secs(5);
    for _ in 0..2 {
        let mut req = c.get(url).header("Range", "bytes=0-0").header("Accept-Encoding", "identity");
        if let Some(ua) = ua {
            req = req.header("User-Agent", ua);
        }
        if let Ok(Ok(r)) = tokio::time::timeout(wait, req.send()).await {
            let header = |k: &str| r.headers().get(k).and_then(|v| v.to_str().ok()).map(str::to_string);
            match r.status().as_u16() {
                206 => {
                    if let Some(n) = header("content-range").as_deref().and_then(content_range_total) {
                        return Some(n);
                    }
                }
                // No ranges here: the whole part came back, and its length with it.
                200 => {
                    if let Some(n) = header("content-length").and_then(|v| v.trim().parse::<u64>().ok()).filter(|n| *n > 0) {
                        return Some(n);
                    }
                }
                _ => {}
            }
        }
        let mut req = c.head(url).header("Accept-Encoding", "identity");
        if let Some(ua) = ua {
            req = req.header("User-Agent", ua);
        }
        if let Ok(Ok(r)) = tokio::time::timeout(wait, req.send()).await {
            if r.status().is_success() {
                let n = r
                    .headers()
                    .get("content-length")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.trim().parse::<u64>().ok());
                if let Some(n) = n.filter(|n| *n > 0) {
                    return Some(n);
                }
            }
        }
    }
    None
}

/// Fills in every unknown part size, twelve at a time. True when all are known.
async fn hls_sizes(parts: &mut [HlsPart], ua: Option<&str>) -> bool {
    let Ok(c) = crate::api::media_client() else { return false };
    let sem = std::sync::Arc::new(tokio::sync::Semaphore::new(12));
    let mut set = tokio::task::JoinSet::new();
    for (i, p) in parts.iter().enumerate().filter(|(_, p)| p.len.is_none()) {
        let (c, url, ua, sem) = (c.clone(), p.url.clone(), ua.map(str::to_string), sem.clone());
        set.spawn(async move {
            let _permit = sem.acquire_owned().await.ok();
            (i, part_size(&c, &url, ua.as_deref()).await)
        });
    }
    while let Some(res) = set.join_next().await {
        if let Ok((i, Some(n))) = res {
            parts[i].len = Some(n);
        }
    }
    parts.iter().all(|p| p.len.is_some())
}

/// The total out of `bytes a-b/N`.
fn content_range_total(cr: &str) -> Option<u64> {
    cr.trim().rsplit_once('/')?.1.trim().parse().ok()
}

/// Reads a playlist (a master one is narrowed to one variant first) into an
/// `HlsFile`, measuring every part.
async fn hls_open(text: String, url: &str, ua: Option<&str>, low: bool) -> Result<HlsFile, String> {
    let (mut text, mut base) = (text, url.to_string());
    if text.contains("#EXT-X-STREAM-INF") {
        let v = hls_variant(&text, &base, low).ok_or("master playlist without variants")?;
        let c = crate::api::client()?;
        let mut req = c.get(&v);
        if let Some(ua) = ua {
            req = req.header("User-Agent", ua);
        }
        let r = req.send().await.map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err(format!("variant playlist: HTTP {}", r.status().as_u16()));
        }
        text = r.text().await.map_err(|e| e.to_string())?;
        base = v;
    }
    let mut parts = hls_parts(&text, &base)?;
    if parts.is_empty() {
        return Err("empty playlist".into());
    }
    let ctype = hls_ctype(&parts, text.contains("#EXT-X-MAP"));
    let sized = hls_sizes(&mut parts, ua).await;
    let total = sized.then(|| parts.iter().map(|p| p.len.unwrap_or(0)).sum::<u64>()).filter(|t| *t > 0);
    Ok(HlsFile { parts, total, ctype, ua: ua.map(str::to_string) })
}

/// Measured HLS files by stream cache key, so a seek or the next request
/// needs no resolve, no playlist and no HEADs.
type HlsCache = HashMap<String, (std::sync::Arc<HlsFile>, std::time::Instant)>;
static HLS_FILES: Mutex<Option<HlsCache>> = Mutex::new(None);
const HLS_TTL: std::time::Duration = std::time::Duration::from_secs(15 * 60);

fn hls_get(key: &str) -> Option<std::sync::Arc<HlsFile>> {
    let mut g = HLS_FILES.lock().ok()?;
    let m = g.get_or_insert_with(HashMap::new);
    let (file, at) = m.get(key)?;
    // Signed part URLs carry their own deadline (`expires=<unix seconds>`).
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let expires = file
        .parts
        .first()
        .and_then(|p| crate::ytm::url_param(&p.url, "expires").or_else(|| crate::ytm::url_param(&p.url, "Expires")))
        .and_then(|v| v.parse::<u64>().ok());
    if at.elapsed() < HLS_TTL && expires.is_none_or(|e| e > now + 60) {
        return Some(file.clone());
    }
    m.remove(key);
    None
}

fn hls_put(key: &str, file: std::sync::Arc<HlsFile>) {
    if let Ok(mut g) = HLS_FILES.lock() {
        let m = g.get_or_insert_with(HashMap::new);
        if m.len() > 32 {
            m.retain(|_, (_, at)| at.elapsed() < HLS_TTL);
            if m.len() > 32 {
                m.clear();
            }
        }
        m.insert(key.to_string(), (file, std::time::Instant::now()));
    }
}

/// Answers a request for a measured HLS file like one for a plain file:
/// exact length, 206 for a range, 416 past the end.
fn serve_hls(
    rt: &tokio::runtime::Runtime,
    file: std::sync::Arc<HlsFile>,
    range: Option<&str>,
    head_only: bool,
    origin: Option<&str>,
    request: tiny_http::Request,
) -> Result<(), String> {
    let mut headers = vec![header("Content-Type", file.ctype), header("Cache-Control", "no-store")];
    headers.extend(cors(origin));
    let Some(total) = file.total else {
        // Some size could not be learnt: the parts back to back with no
        // length, as before — it plays, it just cannot seek.
        headers.push(header("Accept-Ranges", "none"));
        if head_only {
            return request
                .respond(Response::new(StatusCode(200), headers, std::io::empty(), None, None))
                .map_err(|e| e.to_string());
        }
        let body = Upstream::parts(rt, file, 0, 0, None);
        return request
            .respond(Response::new(StatusCode(200), headers, body, None, None))
            .map_err(|e| e.to_string());
    };
    headers.push(header("Accept-Ranges", "bytes"));
    let (start, end, partial) = match parse_range(range, total) {
        RangeSpec::None => (0, total - 1, false),
        RangeSpec::Bytes(s, e) => (s, e, true),
        RangeSpec::Unsatisfiable => {
            let mut resp = Response::from_string("range not satisfiable").with_status_code(StatusCode(416));
            for h in cors(origin) {
                resp = resp.with_header(h);
            }
            if let Some(h) = try_header("Content-Range", &format!("bytes */{total}")) {
                resp = resp.with_header(h);
            }
            return request.respond(resp).map_err(|e| e.to_string());
        }
    };
    if partial {
        if let Some(h) = try_header("Content-Range", &format!("bytes {start}-{end}/{total}")) {
            headers.push(h);
        }
    }
    let len = end - start + 1;
    let status = StatusCode(if partial { 206 } else { 200 });
    if head_only {
        return request
            .respond(Response::new(status, headers, std::io::empty(), Some(len as usize), None))
            .map_err(|e| e.to_string());
    }
    let (idx, at) = file.locate(start);
    let body = Upstream::parts(rt, file, idx, at, Some(len));
    request
        .respond(with_length(Response::new(status, headers, body, Some(len as usize), None), partial))
        .map_err(|e| e.to_string())
}

/// tiny_http sends any body over 32 KB chunked, without Content-Length. For
/// a 206 that is right: Content-Range carries the size, and a stream that
/// ends early still ends cleanly, so the element asks again from there. A 200
/// has nothing else to say how long the file is — WebKitGTK's player, which
/// does not always send a Range, then cannot seek — so it gets the real length.
fn with_length<R: std::io::Read>(resp: Response<R>, partial: bool) -> Response<R> {
    if partial {
        resp
    } else {
        resp.with_chunked_threshold(usize::MAX)
    }
}

/// Measures an HLS stream ahead of time (the prefetch of the next track), so
/// its first request is answered straight from `HLS_FILES`.
async fn hls_prepare(key: &str, url: &str) {
    if hls_get(key).is_some() {
        return;
    }
    let Ok(c) = crate::api::client() else { return };
    let Ok(r) = c.get(url).send().await else { return };
    if !r.status().is_success() {
        return;
    }
    let Ok(text) = r.text().await else { return };
    if let Ok(f) = hls_open(text, url, None, false).await {
        if f.total.is_some() {
            hls_put(key, std::sync::Arc::new(f));
        }
    }
}

fn resolve_hls_url(base: &str, target: &str) -> String {
    let target = target.trim();
    if target.starts_with("http://") || target.starts_with("https://") {
        target.to_string()
    } else if target.starts_with('/') {
        if let Ok(parsed) = reqwest::Url::parse(base) {
            format!("{}://{}{}", parsed.scheme(), parsed.authority(), target)
        } else {
            target.to_string()
        }
    } else if let Some((prefix, _)) = base.rsplit_once('/') {
        format!("{prefix}/{target}")
    } else {
        target.to_string()
    }
}

impl<'a> std::io::Read for Upstream<'a> {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        // Never more than the length the response declared: a host that
        // ignores a range must not push the body past its Content-Length.
        let left = match self.expected_total {
            Some(total) if self.bytes_delivered >= total => return Ok(0),
            Some(total) => total - self.bytes_delivered,
            None => u64::MAX,
        };
        while self.pos >= self.buf.len() {
            match &mut self.kind {
                UpstreamKind::Direct(resp_slot) => {
                    let Some(resp) = resp_slot.as_mut() else {
                        return Ok(0);
                    };
                    let step = match self.rt.block_on(async {
                        tokio::time::timeout(std::time::Duration::from_secs(45), resp.chunk()).await
                    }) {
                        Ok(Ok(Some(chunk))) => Step::Data(chunk.to_vec()),
                        Ok(Ok(None)) => Step::End,
                        // Timeout or network drop
                        _ => Step::Broken,
                    };
                    match step {
                        Step::Data(buf) => {
                            self.buf = buf;
                            if let Some(c) = self.cipher.as_mut() {
                                use aes::cipher::StreamCipher;
                                c.apply_keystream(&mut self.buf);
                            }
                            self.pos = 0;
                            self.reconnect_attempts = 0;
                        }
                        Step::End if self.window.is_some() => {
                            let w = self.window.unwrap_or(Window { end: 0, size: 1 });
                            let at = self.initial_offset + self.bytes_delivered;
                            if at > w.end {
                                self.kind = UpstreamKind::Direct(None);
                                return Ok(0);
                            }
                            if at > self.cur_end {
                                // This window is done: the next one.
                                let url = self.upstream_url.clone();
                                let ua = self.media_ua.clone();
                                match self.fetch_from(&url, ua.as_deref(), at) {
                                    Ok(r) => {
                                        self.kind = UpstreamKind::Direct(Some(r));
                                        continue;
                                    }
                                    // Past the end of a file of unknown size.
                                    Err(416) => {
                                        self.kind = UpstreamKind::Direct(None);
                                        return Ok(0);
                                    }
                                    Err(_) => {}
                                }
                            } else if w.end == u64::MAX {
                                // A short window and no known size: the file is over.
                                self.kind = UpstreamKind::Direct(None);
                                return Ok(0);
                            }
                            // Cut short, or the next window was refused: the
                            // same URL again, then another client.
                            if self.reconnect() {
                                continue;
                            }
                            self.kind = UpstreamKind::Direct(None);
                            return Ok(0);
                        }
                        Step::End => {
                            // Check if stream ended prematurely
                            let premature = match self.expected_total {
                                Some(total) => self.bytes_delivered < total,
                                None => self.bytes_delivered == 0,
                            };
                            if premature && self.reconnect() {
                                continue;
                            }
                            self.kind = UpstreamKind::Direct(None);
                            return Ok(0);
                        }
                        Step::Broken => {
                            if self.reconnect() {
                                continue;
                            }
                            self.kind = UpstreamKind::Direct(None);
                            return Ok(0);
                        }
                    }
                }
                UpstreamKind::Parts { file, idx, at, resp, skip } => {
                    let Some(part) = file.parts.get(*idx) else {
                        return Ok(0);
                    };
                    let plen = part.len;
                    if resp.is_none() {
                        match fetch_part(self.rt, part, *at, self.media_ua.as_deref()) {
                            Ok((r, s)) => {
                                *resp = Some(r);
                                *skip = s;
                            }
                            // A refusal will not change on a retry; anything
                            // else (timeout, 5xx) gets three.
                            Err(code) if !matches!(code, 401 | 403 | 404 | 410) && self.reconnect_attempts < 3 => {
                                self.reconnect_attempts += 1;
                                let wait = 300 * self.reconnect_attempts as u64;
                                self.rt.block_on(tokio::time::sleep(std::time::Duration::from_millis(wait)));
                                continue;
                            }
                            Err(code) => {
                                eprintln!("[meowave] hls: part {} of {} failed (HTTP {code})", *idx + 1, file.parts.len());
                                return Ok(0);
                            }
                        }
                    }
                    let Some(r) = resp.as_mut() else { continue };
                    let step = match self.rt.block_on(async {
                        tokio::time::timeout(std::time::Duration::from_secs(30), r.chunk()).await
                    }) {
                        Ok(Ok(Some(chunk))) => Step::Data(chunk.to_vec()),
                        Ok(Ok(None)) => Step::End,
                        _ => Step::Broken,
                    };
                    let broken = matches!(step, Step::Broken);
                    match step {
                        Step::Data(mut b) => {
                            if *skip > 0 {
                                let d = (*skip).min(b.len() as u64) as usize;
                                b.drain(..d);
                                *skip -= d as u64;
                            }
                            if let Some(len) = plen {
                                let room = len.saturating_sub(*at);
                                if (b.len() as u64) > room {
                                    b.truncate(room as usize);
                                }
                            }
                            if b.is_empty() {
                                continue;
                            }
                            *at += b.len() as u64;
                            self.buf = b;
                            self.pos = 0;
                            self.reconnect_attempts = 0;
                        }
                        Step::End | Step::Broken => {
                            *resp = None;
                            if broken || plen.is_some_and(|l| *at < l) {
                                // Cut off mid-part: pick it up where it stopped.
                                if self.reconnect_attempts < 3 {
                                    self.reconnect_attempts += 1;
                                    continue;
                                }
                                eprintln!("[meowave] hls: part {} of {} kept breaking off", *idx + 1, file.parts.len());
                                return Ok(0);
                            }
                            *idx += 1;
                            *at = 0;
                        }
                    }
                }
            }
        }
        let n = out.len().min(self.buf.len() - self.pos).min(left.min(usize::MAX as u64) as usize);
        out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
        self.pos += n;
        self.bytes_delivered += n as u64;
        Ok(n)
    }
}

/// GET of one HLS part from byte `at` of it. Also returns how many leading
/// bytes to drop: a host that answers a ranged request with the whole part.
fn fetch_part(rt: &tokio::runtime::Runtime, part: &HlsPart, at: u64, ua: Option<&str>) -> Result<(reqwest::Response, u64), u16> {
    rt.block_on(async {
        let c = crate::api::media_client().map_err(|_| 0u16)?;
        // Identity: the sizes were measured on the raw bytes.
        let mut req = c.get(&part.url).header("Accept-Encoding", "identity");
        if let Some(ua) = ua {
            req = req.header("User-Agent", ua);
        }
        let from = match part.sub {
            Some((off, len)) => {
                req = req.header("Range", format!("bytes={}-{}", off + at, off + len.max(1) - 1));
                Some(off + at)
            }
            None if at > 0 => {
                req = req.header("Range", format!("bytes={at}-"));
                Some(at)
            }
            None => None,
        };
        match tokio::time::timeout(std::time::Duration::from_secs(20), req.send()).await {
            Ok(Ok(r)) => match r.status().as_u16() {
                206 => Ok((r, 0)),
                200 => Ok((r, from.unwrap_or(0))),
                code => Err(code),
            },
            _ => Err(0),
        }
    })
}

/// Builds a header, or nothing when the value cannot be one.
///
/// This used to `expect`, and one of its callers passes the upstream's own
/// `Content-Type` — a control character from a hostile or broken service was
/// enough to panic the request thread and drop the connection with no reply.
fn try_header(name: &str, value: &str) -> Option<Header> {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).ok()
}

/// For header names and values we control.
fn header(name: &str, value: &str) -> Header {
    try_header(name, value).unwrap_or_else(|| {
        // Only reachable if a literal in this file is malformed.
        Header::from_bytes(&b"X-Meowave"[..], &b"1"[..]).expect("static header")
    })
}

fn query_param(query: &str, key: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        if k != key {
            return None;
        }
        Some(
            urlencoding::decode(v)
                .map(|s| s.into_owned())
                .unwrap_or_else(|_| v.to_string()),
        )
    })
}

/// Constant-time comparison preventing timing attacks and length truncation bypasses.
fn token_ok(given: &str) -> bool {
    let want = token().as_bytes();
    let got = given.as_bytes();
    if want.len() != got.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&w, &g) in want.iter().zip(got.iter()) {
        diff |= w ^ g;
    }
    diff == 0
}

/// The request must name loopback in `Host`. A page served from a domain that
/// resolves to 127.0.0.1 (DNS rebinding) sends its own host here and fails.
///
/// The port is passed in rather than read from a global: `spawn` can be called
/// more than once in a process (the tests do), and a process-wide OnceLock would
/// leave the second instance validating against the first one's port.
pub(crate) fn host_ok(request: &tiny_http::Request, port: u16) -> bool {
    let Some(host) = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Host"))
        .map(|h| h.value.as_str().to_string())
    else {
        return false;
    };
    let (name, p) = match host.rsplit_once(':') {
        Some((n, p)) => (n, p.parse::<u16>().unwrap_or(0)),
        None => (host.as_str(), 80),
    };
    p == port && matches!(name, "127.0.0.1" | "localhost" | "[::1]")
}

/// CORS for an authenticated caller only.
///
/// `<audio crossOrigin="anonymous">` is mandatory — without it
/// createMediaElementSource yields silence — and the webview then drops any
/// response without these headers. They used to be sent unconditionally, which
/// let any page that guessed the port read the body cross-origin. Now they are
/// added after the token check, so an unauthenticated caller gets a bare 403.
fn cors(resp_origin: Option<&str>) -> Vec<Header> {
    let mut h = vec![
        header("Access-Control-Allow-Origin", resp_origin.unwrap_or("*")),
        header(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges, Content-Type, Authorization, apikey",
        ),
        header("Vary", "Origin"),
    ];
    if resp_origin.is_some() {
        h.push(header("Access-Control-Allow-Credentials", "true"));
    }
    h
}

fn origin_of(request: &tiny_http::Request) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Origin"))
        .map(|h| h.value.as_str().to_string())
        .filter(|o| !o.is_empty() && o != "null")
}

/// Starts the proxy on a free port and returns the port number.
pub fn spawn() -> Result<u16, String> {
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server.server_addr().to_ip().ok_or("no ip addr")?.port();
    let _ = token();

    // One thread per request, not one thread for the whole server.
    //
    // The body is now streamed rather than buffered, which means a response
    // lives for as long as the client keeps reading — and <audio> stops reading
    // the moment its buffer is full, holding the connection open for most of the
    // track. On the old single-threaded loop that blocked everything behind it:
    // a seek, a track change or a second player would simply never be answered.
    //
    // The runtime is multi-threaded and shared, so concurrent streams share its
    // reactor instead of each building one.
    let rt = match tokio::runtime::Builder::new_multi_thread()
        .worker_threads(2)
        .enable_all()
        .build()
    {
        Ok(rt) => std::sync::Arc::new(rt),
        Err(e) => return Err(format!("runtime: {e}")),
    };

    std::thread::spawn(move || {
        // Cap on in-flight requests. One thread per request is the right shape
        // here (each holds a blocking read on its upstream), but unbounded
        // spawning let anything that can reach the port exhaust threads and
        // memory. Over the cap the request is answered 503 on the accept thread
        // rather than queued.
        const MAX_INFLIGHT: usize = 32;
        let inflight = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        loop {
            let request = match server.recv() {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("stream: accept: {e}");
                    continue;
                }
            };
            use std::sync::atomic::Ordering;
            if inflight.load(Ordering::Relaxed) >= MAX_INFLIGHT {
                let mut resp = Response::from_string("too many streams").with_status_code(StatusCode(503));
                for h in cors(None) {
                    resp = resp.with_header(h);
                }
                let _ = request.respond(resp);
                continue;
            }
            inflight.fetch_add(1, Ordering::Relaxed);
            let rt = rt.clone();
            let inflight = inflight.clone();
            std::thread::spawn(move || {
                if let Err(e) = handle(&rt, port, request) {
                    eprintln!("stream: {e}");
                }
                inflight.fetch_sub(1, Ordering::Relaxed);
            });
        }
    });

    Ok(port)
}

fn handle(
    rt: &tokio::runtime::Runtime,
    port: u16,
    request: tiny_http::Request,
) -> Result<(), String> {
    let url = request.url().to_string();
    let origin = origin_of(&request);

    // Cheapest rejection first, and it needs no token: a request that does not
    // name loopback in Host is not coming from our webview.
    if !host_ok(&request, port) {
        return request
            .respond(Response::from_string("forbidden").with_status_code(StatusCode(403)))
            .map_err(|e| e.to_string());
    }

    // No token needed and nothing leaked: used only to tell "proxy is up" from
    // "port is taken by something else".
    if url.starts_with("/health") {
        return request
            .respond(Response::from_string("ok"))
            .map_err(|e| e.to_string());
    }

    let path = url.split('?').next().unwrap_or("");
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");

    // The preflight carries no token — the browser strips the query from it in
    // no case, but it does send it before we can demand anything else, so the
    // token is checked here too and a bad one gets no CORS grant.
    if request.method() == &tiny_http::Method::Options {
        if !query_param(query, "k").is_some_and(|k| token_ok(&k)) {
            return request
                .respond(Response::from_string("forbidden").with_status_code(StatusCode(403)))
                .map_err(|e| e.to_string());
        }
        let mut resp = Response::empty(StatusCode(204))
            .with_header(header(
                "Access-Control-Allow-Headers",
                "Range, Authorization, apikey, Content-Type, Accept, Prefer, X-Client-Info, X-Supabase-Api-Version, Accept-Profile, Content-Profile",
            ))
            .with_header(header(
                "Access-Control-Allow-Methods",
                "GET, HEAD, POST, PUT, DELETE, PATCH, OPTIONS",
            ))
            .with_header(header("Access-Control-Max-Age", "86400"));
        for h in cors(origin.as_deref()) {
            resp = resp.with_header(h);
        }
        return request.respond(resp).map_err(|e| e.to_string());
    }

    if !query_param(query, "k").is_some_and(|k| token_ok(&k)) {
        return request
            .respond(Response::from_string("forbidden").with_status_code(StatusCode(403)))
            .map_err(|e| e.to_string());
    }

    // Supabase relay: /relay/<percent-encoded url>. The webview's network
    // stack fails fast on machines with an IPv6 address but no v6 route
    // ("Load failed" on every sign-in), while reqwest falls back to v4
    // properly. Method, auth headers and body are forwarded; the host is
    // whitelisted so this stays a Supabase relay, not an open proxy.
    if let Some(raw) = path.strip_prefix("/relay/") {
        return serve_relay(rt, raw, query, origin.as_deref(), request);
    }

    // Only GET and HEAD from here on (audio streams and cover images). HEAD used to fall through to GET and got
    // a body it must not have.
    let head_only = request.method() == &tiny_http::Method::Head;
    if request.method() != &tiny_http::Method::Get && !head_only {
        return request
            .respond(Response::from_string("method not allowed").with_status_code(StatusCode(405)))
            .map_err(|e| e.to_string());
    }

    // Parsed as a real parameter: `contains("hq=0")` also matched `xhq=0`.
    // 0 = data saver, 1 = high, 2 = lossless (only Yandex has a real one).
    let hq: u8 = match query_param(query, "hq").as_deref() {
        Some("0") => 0,
        Some("2") => 2,
        _ => 1,
    };
    // Container the caller's webview can decode ("mp4" / "webm" / "best").
    // Only YouTube Music has more than one, and for it the choice is the
    // difference between playing and silence — see ytm::stream.
    let fmt = query_param(query, "fmt").unwrap_or_else(|| "best".to_string());
    // Title, artist and length of a YouTube track, so a refusal can be served
    // from another service (`ytm_alternative`); `alt=0` turns that off.
    let hint = query_param(query, "t").map(|t| Hint {
        t,
        a: query_param(query, "a").unwrap_or_default(),
        d: query_param(query, "d").and_then(|d| d.parse().ok()).unwrap_or(0),
    });
    let alt_ok = query_param(query, "alt").as_deref() != Some("0");

    // Artwork relay: /img/<percent-encoded url>. Covers come from hosts that
    // are frequently blocked outright (ytimg) even when search works, and an
    // <img> that loads cross-origin also taints the canvas the adaptive
    // accent samples. Relaying through here puts the fetch in Rust — where the
    // user's proxy config applies — and makes the image same-origin. Parsed
    // before the /stream/ shape below, since the encoded url contains slashes.
    if let Some(raw) = path.strip_prefix("/img/") {
        return serve_img(rt, raw, head_only, origin.as_deref(), request);
    }

    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    // ["stream", service, id]
    if parts.len() < 3 || parts[0] != "stream" {
        let mut resp = Response::from_string("not found").with_status_code(StatusCode(404));
        for h in cors(origin.as_deref()) {
            resp = resp.with_header(h);
        }
        return request.respond(resp).map_err(|e| e.to_string());
    }
    // The path arrives percent-encoded from the frontend; ids contain
    // characters that must survive the round trip.
    let decode = |s: &str| {
        urlencoding::decode(s)
            .map(|c| c.into_owned())
            .unwrap_or_else(|_| s.to_string())
    };
    let (service, id) = (decode(parts[1]), decode(parts[2]));

    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    let initial_offset = range
        .as_deref()
        .and_then(|r| r.strip_prefix("bytes="))
        .and_then(|r| r.split('-').next())
        .and_then(|s| s.trim().parse::<u64>().ok())
        .unwrap_or(0);

    // Local files never touch the network: read the requested byte range
    // straight off the disk.
    if service == "local" {
        return serve_local(&id, range.as_deref(), head_only, origin.as_deref(), request);
    }

    let cache_key = cache_key_of(&service, &id, hq, &fmt);

    // An HLS rendition measured earlier (the first request, a seek, the
    // prefetch): no resolve, no playlist, no HEADs.
    if let Some(file) = hls_get(&cache_key) {
        if !head_only && !pin_ok(&cache_key, initial_offset, &hls_ident(&file)) {
            return source_changed(origin.as_deref(), request);
        }
        return serve_hls(rt, file, range.as_deref(), head_only, origin.as_deref(), request);
    }
    // The caller's range as numbers; `None` inside for the suffix and
    // multi-range forms, which are forwarded as they came.
    let want = range.as_deref().map(plain_range);

    // Two attempts. A cached stream URL is signed and short-lived: once it
    // expires the service answers 403, and the old code passed that straight to
    // <audio>, which is exactly the intermittent "playback failed" on a track
    // that played fine a few minutes earlier. On a bad status the cache entry is
    // dropped and the URL resolved again from scratch.
    // YouTube gets a third: after a refusal its resolve asks a different
    // client, and that is a genuinely new chance rather than a repeat — and,
    // when every client is refused at the media host, one more from another
    // service (`ytm_alternative`).
    let mut max_attempts: u8 = if service == "ytm" { 3 } else { 2 };
    let mut alt_tried = false;
    let mut attempt = 0u8;
    let (status, ctype, crange, clen, resp, secret, win) = loop {
        attempt += 1;

        let upstream = match cache_get(&cache_key) {
            Some(u) => u,
            None => match rt.block_on(async {
                let alt_hint = if service == "ytm" && alt_ok { hint.as_ref() } else { None };
                // The IP was just bot-checked: go elsewhere first, YouTube after.
                if let Some(h) = alt_hint {
                    if crate::ytm::bot_checked_recently() {
                        if let Ok(u) = ytm_alternative(&id, h, hq).await {
                            return Ok(u);
                        }
                    }
                }
                match resolve_pub(&service, &id, hq, &fmt).await {
                    Ok(u) => Ok(u),
                    Err(e) => match alt_hint {
                        Some(h) => ytm_alternative(&id, h, hq).await.map_err(|e2| format!("{e}; {e2}")),
                        None => Err(e),
                    },
                }
            }) {
                Ok(u) => {
                    cache_put(cache_key.clone(), u.clone());
                    u
                }
                Err(e) => {
                    note_err(&format!("{service}/{id}"), format!("resolve failed: {e}"));
                    let mut resp = Response::from_string(format!("resolve failed: {e}"))
                        .with_status_code(StatusCode(502));
                    for h in cors(origin.as_deref()) {
                        resp = resp.with_header(h);
                    }
                    return request.respond(resp).map_err(|e| e.to_string());
                }
            },
        };

        let secret = Secret::of(&upstream);
        let fetch_url = secret.url.clone();
        let is_hls_url = fetch_url.contains(".m3u8");
        // googlevideo only serves a media stream to a client that looks like
        // one of Google's own players, and only in bounded ranges.
        let is_google = (service == "ytm" && secret.alt.is_none()) || fetch_url.contains("googlevideo.com");
        // (start, caller's end, end of the first window)
        let first = gv_first_window();
        let win: Option<(u64, Option<u64>, u64)> = match (&want, is_google && !is_hls_url) {
            (None, true) => Some((0, None, first - 1)),
            (Some(Some((s, e))), true) => Some((*s, *e, (s + first - 1).min(e.unwrap_or(u64::MAX)))),
            _ => None,
        };
        let sent = rt.block_on(async {
            // media_client, not client: this body is read for as long as the
            // media element keeps reading it, and client()'s total deadline
            // would sever it mid-track.
            let c = crate::api::media_client()?;
            let mut req = c.get(&fetch_url);
            if is_google {
                req = req.header("User-Agent", secret.ua());
            }
            match (win, &range) {
                (Some((s, _, last)), _) => req = req.header("Range", format!("bytes={s}-{last}")),
                (None, Some(r)) if !is_hls_url => req = req.header("Range", r.clone()),
                _ => {}
            }
            // Only the headers are awaited here; the body is streamed below.
            req.send().await.map_err(|e| e.to_string())
        });

        match sent {
            Ok(resp) => {
                let status = resp.status().as_u16();
                // Past the end of the file: an answer, not a refusal — passed
                // on as is, without blaming the client or resolving again.
                if status == 416 {
                    let total = resp
                        .headers()
                        .get("content-range")
                        .and_then(|v| v.to_str().ok())
                        .and_then(content_range_total)
                        .or_else(|| crate::ytm::url_param(&fetch_url, "clen").and_then(|v| v.parse::<u64>().ok()));
                    let mut out = Response::from_string("range not satisfiable").with_status_code(StatusCode(416));
                    for h in cors(origin.as_deref()) {
                        out = out.with_header(h);
                    }
                    if let Some(h) = total.and_then(|n| try_header("Content-Range", &format!("bytes */{n}"))) {
                        out = out.with_header(h);
                    }
                    return request.respond(out).map_err(|e| e.to_string());
                }
                // The first window refused while smaller ranges of the same
                // URL pass: shrink it and ask again, the URL is fine.
                if status == 403 && win.is_some() && gv_shrink(first).is_some() {
                    max_attempts = max_attempts.saturating_add(1);
                    continue;
                }
                if status >= 400 {
                    cache_drop(&cache_key);
                    // A refused googlevideo URL says something about the client
                    // that signed it: remember that, so the next resolve asks
                    // another client first instead of minting the same dud.
                    if let Some(c) = secret.client.as_deref().filter(|_| is_google) {
                        crate::ytm::note_media_failure(c, &format!("HTTP {status}"));
                    }
                    if attempt < max_attempts {
                        continue;
                    }
                    // Every YouTube client refused at the media host: the same
                    // recording from another service beats silence.
                    if service == "ytm" && alt_ok && !alt_tried && secret.alt.is_none() {
                        if let Some(h) = &hint {
                            alt_tried = true;
                            if let Ok(u) = rt.block_on(ytm_alternative(&id, h, hq)) {
                                cache_put(cache_key.clone(), u);
                                max_attempts += 1;
                                continue;
                            }
                        }
                    }
                    note_err(&format!("{service}/{id}"), format!("the media host refused the stream with HTTP {status}"));
                    let mut resp = Response::from_string(format!("upstream rejected stream with HTTP {status}"))
                        .with_status_code(StatusCode(502));
                    for h in cors(origin.as_deref()) {
                        resp = resp.with_header(h);
                    }
                    return request.respond(resp).map_err(|e| e.to_string());
                }
                let ctype = resp
                    .headers()
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or("audio/mpeg")
                    .to_string();
                let crange = resp
                    .headers()
                    .get("content-range")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
                // Content-Length lets tiny_http answer with a real length
                // instead of chunked encoding, which is what makes <audio>
                // show a duration and allow seeking immediately.
                let clen = resp.content_length().map(|v| v as usize);
                break (status, ctype, crange, clen, resp, secret, win);
            }
            Err(e) => {
                if attempt < max_attempts {
                    cache_drop(&cache_key);
                    continue;
                }
                note_err(&format!("{service}/{id}"), format!("the media host did not answer: {e}"));
                let mut resp = Response::from_string(format!("upstream failed: {e}"))
                    .with_status_code(StatusCode(502));
                for h in cors(origin.as_deref()) {
                    resp = resp.with_header(h);
                }
                return request.respond(resp).map_err(|e| e.to_string());
            }
        }
    };

    let client_status = if range.is_none() && status == 206 {
        200
    } else {
        status
    };

    let upstream = secret.url.clone();
    let is_hls = upstream.contains(".m3u8") || ctype.contains("mpegurl");
    if is_hls {
        let text = rt.block_on(resp.text()).unwrap_or_default();
        let is_google = service == "ytm" || upstream.contains("googlevideo.com");
        let ua = is_google.then(|| secret.ua().to_string());
        match rt.block_on(hls_open(text, &upstream, ua.as_deref(), hq == 0)) {
            Ok(file) => {
                let file = std::sync::Arc::new(file);
                if file.total.is_some() {
                    hls_put(&cache_key, file.clone());
                }
                if !head_only && !pin_ok(&cache_key, initial_offset, &hls_ident(&file)) {
                    return source_changed(origin.as_deref(), request);
                }
                return serve_hls(rt, file, range.as_deref(), head_only, origin.as_deref(), request);
            }
            Err(e) => {
                cache_drop(&cache_key);
                note_err(&format!("{service}/{id}"), format!("HLS: {e}"));
                let mut resp = Response::from_string(format!("hls: {e}")).with_status_code(StatusCode(502));
                for h in cors(origin.as_deref()) {
                    resp = resp.with_header(h);
                }
                return request.respond(resp).map_err(|e| e.to_string());
            }
        }
    }

    let is_google = (service == "ytm" && secret.alt.is_none()) || upstream.contains("googlevideo.com");
    let mut normalized = ctype;
    if let Some(c) = secret.ctype() {
        // An encrypted file is served as octet-stream; the codec from the
        // file info is the truth.
        normalized = c.to_string();
    } else if normalized == "application/octet-stream" || normalized == "text/plain" || normalized == "binary/octet-stream" {
        if is_google {
            normalized = if fmt == "mp4" || upstream.contains("mime=audio%2Fmp4") { "audio/mp4" } else { "audio/webm" }.to_string();
        } else {
            normalized = "audio/mpeg".to_string();
        }
    }
    let ua = is_google.then(|| secret.ua().to_string());
    // The file this answer would come from must be the file the player has
    // been reading (see `pin_ok`).
    {
        let total = crange
            .as_deref()
            .and_then(content_range_total)
            .or_else(|| crate::ytm::url_param(&upstream, "clen").and_then(|v| v.parse::<u64>().ok()))
            .or_else(|| if status == 200 { clen.map(|c| c as u64) } else { None });
        let ident = file_ident(&service, &upstream, secret.alt.as_deref(), secret.codec.as_deref(), total);
        if !head_only && !pin_ok(&cache_key, initial_offset, &ident) {
            return source_changed(origin.as_deref(), request);
        }
    }
    let (body, final_status, final_clen, final_crange) = match win {
        // googlevideo, read in windows: the answer to the caller is built from
        // the file's real size, not from the first window's headers.
        Some((s, e, first_end)) => {
            let total = crange
                .as_deref()
                .and_then(content_range_total)
                .or_else(|| crate::ytm::url_param(&upstream, "clen").and_then(|v| v.parse::<u64>().ok()))
                .or_else(|| if status == 200 { clen.map(|c| c as u64) } else { None });
            match total {
                Some(n) if s >= n => {
                    let mut resp = Response::from_string("range not satisfiable").with_status_code(StatusCode(416));
                    for h in cors(origin.as_deref()) {
                        resp = resp.with_header(h);
                    }
                    if let Some(h) = try_header("Content-Range", &format!("bytes */{n}")) {
                        resp = resp.with_header(h);
                    }
                    return request.respond(resp).map_err(|e| e.to_string());
                }
                Some(n) => {
                    let end = e.unwrap_or(n - 1).min(n - 1);
                    let len = end - s + 1;
                    // A host that ignored the range sent the whole file in one go.
                    let w = (status == 206).then_some(Window { end, size: gv_window() });
                    let body = Upstream::new(rt, Some(resp), upstream.clone(), ua.clone(), Some(len), s).with_window(w, first_end);
                    let crange = range.is_some().then(|| format!("bytes {s}-{end}/{n}"));
                    (body, if range.is_some() { 206 } else { 200 }, Some(len as usize), crange)
                }
                None => {
                    // No size anywhere: windows until the host says the file is over.
                    let w = (status == 206).then_some(Window { end: u64::MAX, size: gv_window() });
                    let body = Upstream::new(rt, Some(resp), upstream.clone(), ua.clone(), None, s).with_window(w, first_end);
                    (body, 200, None, None)
                }
            }
        }
        None => {
            // Where the upstream body starts in the file: the keystream has to be
            // seeked to exactly that byte.
            let body_start = crange
                .as_deref()
                .and_then(|r| r.trim().strip_prefix("bytes "))
                .and_then(|r| r.split('-').next())
                .and_then(|n| n.trim().parse::<u64>().ok())
                .unwrap_or(if status == 206 { initial_offset } else { 0 });
            let mut body = Upstream::new(rt, Some(resp), upstream.clone(), ua.clone(), clen.map(|l| l as u64), body_start);
            if let Some(k) = &secret.key {
                body = body.with_key(k, body_start);
            }
            let crange = if range.is_some() { crange } else { None };
            (body, client_status, clen, crange)
        }
    };
    // YouTube: how to continue the same file through another client when this
    // URL stops being served mid-track.
    let video_id = if service == "ytm" && secret.alt.is_none() { Some(id.clone()) } else { secret.vid.clone() };
    let mut body = body;
    if is_google {
        let itag = crate::ytm::url_param(&upstream, "itag").and_then(|v| v.parse::<u64>().ok());
        if let (Some(itag), Some(client), Some(video_id)) = (itag, secret.client.clone(), video_id) {
            body = body.with_failover(Some(Failover {
                video_id,
                itag,
                tried: vec![client.clone()],
                client,
                cache_key: cache_key.clone(),
                left: 2,
            }));
        }
    }

    let mut headers = vec![
        try_header("Content-Type", &normalized).unwrap_or_else(|| header("Content-Type", "audio/mpeg")),
        header("Accept-Ranges", if final_clen.is_some() || !is_google { "bytes" } else { "none" }),
        header("Cache-Control", "no-store"),
    ];
    headers.extend(cors(origin.as_deref()));
    if let Some(cr) = &final_crange {
        if let Some(h) = try_header("Content-Range", cr) {
            headers.push(h);
        }
    }

    if head_only {
        let response = Response::new(StatusCode(final_status), headers, std::io::empty(), final_clen, None);
        return request.respond(response).map_err(|e| e.to_string());
    }

    let response = Response::new(StatusCode(final_status), headers, body, final_clen, None);
    // The windowed YouTube body knows its exact length (it is cut at it).
    let response = if win.is_some() { with_length(response, final_status == 206) } else { response };
    request.respond(response).map_err(|e| e.to_string())
}

/// `bytes=S-` / `bytes=S-E` as numbers; the suffix and multi-range forms are
/// `None`.
fn plain_range(r: &str) -> Option<(u64, Option<u64>)> {
    let spec = r.trim().strip_prefix("bytes=")?.trim();
    if spec.contains(',') {
        return None;
    }
    let (a, b) = spec.split_once('-')?;
    let s = a.trim().parse::<u64>().ok()?;
    let e = match b.trim() {
        "" => None,
        v => Some(v.parse::<u64>().ok()?),
    };
    if e.is_some_and(|e| e < s) {
        return None;
    }
    Some((s, e))
}

/// Serves a byte range of a local file. Seeking in a two-hour FLAC has to work
/// without loading the whole thing, so the range is parsed and only that slice
/// is read.
fn serve_local(
    id: &str,
    range: Option<&str>,
    head_only: bool,
    origin: Option<&str>,
    request: tiny_http::Request,
) -> Result<(), String> {
    use std::io::{Read, Seek, SeekFrom};

    let fail = |request: tiny_http::Request, code: u16, msg: &str, extra: Option<Header>| {
        let mut resp = Response::from_string(msg.to_string()).with_status_code(StatusCode(code));
        for h in cors(origin) {
            resp = resp.with_header(h);
        }
        if let Some(h) = extra {
            resp = resp.with_header(h);
        }
        request.respond(resp).map_err(|e| e.to_string())
    };

    let Some(path) = crate::local::path_of(id) else {
        return fail(request, 404, "unknown local track", None);
    };

    let mut file = match std::fs::File::open(&path) {
        Ok(f) => f,
        Err(e) => return fail(request, 404, &format!("cannot open file: {e}"), None),
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);

    // An empty file has no satisfiable range at all.
    if total == 0 {
        return fail(request, 416, "empty file", None);
    }

    let parsed = match parse_range(range, total) {
        RangeSpec::None => None,
        RangeSpec::Bytes(start, end) => Some((start, end)),
        RangeSpec::Unsatisfiable => {
            return fail(
                request,
                416,
                "range not satisfiable",
                try_header("Content-Range", &format!("bytes */{total}")),
            );
        }
    };

    let (start, end) = parsed.unwrap_or((0, total - 1));
    let len = end - start + 1;

    if file.seek(SeekFrom::Start(start)).is_err() {
        return fail(request, 500, "seek failed", None);
    }

    let partial = parsed.is_some();
    let mut headers = vec![
        header("Content-Type", crate::local::mime_of(&path)),
        header("Accept-Ranges", "bytes"),
    ];
    headers.extend(cors(origin));
    if partial {
        if let Some(h) = try_header("Content-Range", &format!("bytes {start}-{end}/{total}")) {
            headers.push(h);
        }
    }

    let status = StatusCode(if partial { 206 } else { 200 });
    if head_only {
        return request
            .respond(Response::new(
                status,
                headers,
                std::io::empty(),
                Some(len as usize),
                None,
            ))
            .map_err(|e| e.to_string());
    }

    // Streamed, not buffered. This used to be `vec![0u8; len]` + read_exact,
    // which meant a request without Range — exactly what <audio> sends first —
    // pulled an entire two-hour FLAC into memory before answering.
    request
        .respond(Response::new(
            status,
            headers,
            file.take(len),
            Some(len as usize),
            None,
        ))
        .map_err(|e| e.to_string())
}

enum RangeSpec {
    None,
    Bytes(u64, u64),
    Unsatisfiable,
}

/// Parses a single byte range against a known total size.
///
/// Handles the three forms RFC 7233 defines, including the suffix form the old
/// code got wrong: `bytes=-500` parsed its empty start as 0 and its 500 as an
/// end, returning the *first* 501 bytes instead of the last 500. A multi-range
/// request is treated as absent — legal, and better than the previous behaviour
/// of answering 206 with the whole file and a fabricated Content-Range.
fn parse_range(range: Option<&str>, total: u64) -> RangeSpec {
    let Some(spec) = range.map(str::trim).and_then(|r| r.strip_prefix("bytes=")) else {
        return RangeSpec::None;
    };
    let spec = spec.trim();
    if spec.contains(',') {
        return RangeSpec::None;
    }
    let Some((a, b)) = spec.split_once('-') else {
        return RangeSpec::None;
    };
    let (a, b) = (a.trim(), b.trim());

    if a.is_empty() {
        // Suffix: the last N bytes.
        let Ok(n) = b.parse::<u64>() else {
            return RangeSpec::None;
        };
        if n == 0 {
            return RangeSpec::Unsatisfiable;
        }
        let n = n.min(total);
        return RangeSpec::Bytes(total - n, total - 1);
    }

    let Ok(start) = a.parse::<u64>() else {
        return RangeSpec::None;
    };
    if start >= total {
        return RangeSpec::Unsatisfiable;
    }
    let end = if b.is_empty() {
        total - 1
    } else {
        match b.parse::<u64>() {
            Ok(v) => v.min(total - 1),
            Err(_) => return RangeSpec::None,
        }
    };
    if start > end {
        return RangeSpec::Unsatisfiable;
    }
    RangeSpec::Bytes(start, end)
}

fn cache_key_of(service: &str, id: &str, hq: u8, fmt: &str) -> String {
    let q = match hq {
        0 => "lq",
        2 => "ll",
        _ => "hq",
    };
    format!("{service}/{id}/{q}{fmt}")
}

/// What a resolved URL carries besides the address, in its fragment (which
/// is never sent anywhere): the decryption key and codec of a Yandex lossless
/// file, and which YouTube client minted a googlevideo URL.
struct Secret {
    url: String,
    key: Option<String>,
    codec: Option<String>,
    client: Option<String>,
    /// Set when a YouTube track is served from another service (`ym`, `sc`).
    alt: Option<String>,
    /// The YouTube video behind a googlevideo URL that another service's
    /// resolve found (Deezer, a SoundCloud preview): what failover asks for.
    vid: Option<String>,
}

impl Secret {
    fn of(raw: &str) -> Self {
        let (url, frag) = match raw.split_once('#') {
            Some((u, f)) if f.starts_with("mw") => (u.to_string(), f),
            _ => (raw.to_string(), ""),
        };
        let mut s = Secret { url, key: None, codec: None, client: None, alt: None, vid: None };
        for kv in frag.split('&') {
            match kv.split_once('=') {
                Some(("mwk", v)) if !v.is_empty() => s.key = Some(v.to_string()),
                Some(("mwc", v)) if !v.is_empty() => s.codec = Some(v.to_string()),
                Some(("mwua", v)) if !v.is_empty() => s.client = Some(v.to_string()),
                Some(("mwalt", v)) if !v.is_empty() => s.alt = Some(v.to_string()),
                Some(("mwvid", v)) if !v.is_empty() => s.vid = Some(v.to_string()),
                _ => {}
            }
        }
        s
    }
    fn ua(&self) -> &'static str {
        crate::ytm::media_ua_for(self.client.as_deref().unwrap_or("ANDROID"))
    }
    fn ctype(&self) -> Option<&'static str> {
        Some(match self.codec.as_deref()? {
            "flac" => "audio/flac",
            "flac-mp4" | "aac-mp4" | "he-aac-mp4" => "audio/mp4",
            "mp3" => "audio/mpeg",
            "aac" | "he-aac" => "audio/aac",
            _ => return None,
        })
    }
}

/// YouTube tracks currently served from another service: video id → where.
static ALT: Mutex<Option<HashMap<String, serde_json::Value>>> = Mutex::new(None);

fn note_alt(video_id: &str, v: serde_json::Value) {
    if let Ok(mut g) = ALT.lock() {
        let m = g.get_or_insert_with(HashMap::new);
        if m.len() > 256 {
            m.clear();
        }
        m.insert(video_id.to_string(), v);
    }
}

/// Where a YouTube track is really playing from, if YouTube refused it and
/// the proxy found the same recording elsewhere. `None` for a normal stream.
#[tauri::command]
pub fn stream_alt(id: String) -> Option<serde_json::Value> {
    ALT.lock().ok().and_then(|g| g.as_ref().and_then(|m| m.get(&id).cloned()))
}

/// What the frontend knows about a track, sent with the stream request so a
/// refusal can be answered with the same song from somewhere else.
pub(crate) struct Hint {
    pub t: String,
    pub a: String,
    pub d: u32,
}

fn with_frag(url: String, kv: &str) -> String {
    if url.contains("#mw") {
        format!("{url}&{kv}")
    } else {
        format!("{url}#{kv}")
    }
}

/// The same recording from another service, for a YouTube track that YouTube
/// will not serve (its bot check on VPN and shared IPs refuses every client).
/// Strict matching only (`matching::best`): another song is worse than an
/// honest error. Yandex first when connected — it streams in the quality the
/// user picked — then SoundCloud.
pub(crate) async fn ytm_alternative(video_id: &str, h: &Hint, hq: u8) -> Result<String, String> {
    if h.t.trim().is_empty() {
        return Err("no title to look for".into());
    }
    let q = format!("{} {}", h.a, h.t);
    if let Ok(Some(tok)) = crate::tokens::read_token("ym") {
        if !tok.trim().is_empty() {
            if let Ok(hits) = crate::api::ym_search(&tok, &q).await {
                if let Some(m) = crate::matching::best(&hits, &h.t, &h.a, h.d) {
                    let lossless = if hq == 2 { crate::api::ym_lossless_url(&tok, &m.id).await.ok() } else { None };
                    let url = match lossless {
                        Some(u) => Ok(u),
                        None => crate::api::ym_stream_url(&tok, &m.id, hq > 0).await,
                    };
                    if let Ok(u) = url {
                        note_alt(video_id, serde_json::json!({"s": "ym", "id": m.id, "t": m.t, "a": m.a}));
                        return Ok(with_frag(u, "mwalt=ym"));
                    }
                }
            }
        }
    }
    if let Ok(hits) = crate::api::sc_search("", &q).await {
        if let Some(m) = crate::matching::best(&hits, &h.t, &h.a, h.d) {
            if let Ok(u) = crate::api::sc_stream_url("", &m.id).await {
                note_alt(video_id, serde_json::json!({"s": "sc", "id": m.id, "t": m.t, "a": m.a}));
                return Ok(with_frag(u, "mwalt=sc"));
            }
        }
    }
    Err("the same track was not found on Yandex Music or SoundCloud".into())
}

pub(crate) async fn resolve_pub(service: &str, id: &str, hq: u8, fmt: &str) -> Result<String, String> {
    // Only Yandex needs credentials; sc/ytm resolve anonymously — and they
    // must not touch the keychain, which on a desktop with no Secret Service
    // errors instead of reporting "no entry" (see api::api_search).
    let token = if crate::tokens::TOKENLESS_SERVICES.contains(&service) {
        String::new()
    } else {
        crate::tokens::read_token(service)?.unwrap_or_default()
    };
    match service {
        "ym" if token.is_empty() => Err("Yandex Music is not connected".into()),
        "ym" if hq == 2 => match crate::api::ym_lossless_url(&token, id).await {
            Ok(u) => Ok(u),
            Err(e) => {
                // No subscription, a rotated key, a region without lossless:
                // the 320 kbps file still plays.
                eprintln!("[meowave] lossless for ym/{id} unavailable, falling back: {e}");
                crate::api::ym_stream_url(&token, id, true).await
            }
        },
        "ym" => crate::api::ym_stream_url(&token, id, hq > 0).await,
        "sc" => crate::api::sc_stream_url(&token, id).await,
        "ytm" => crate::ytm::stream(id, hq > 0, fmt)
            .await
            .map(|p| format!("{}#mwua={}", p.url, p.client)),
        "dz" => crate::dz::stream_url(id, hq, fmt).await,
        other => Err(format!("unknown service: {other}")),
    }
}

/// Resolves the next track's stream while the current one is still playing,
/// so the switch does not wait for a search + player round trip. The URL
/// lands in the same short-lived cache a real request reads.
#[tauri::command]
pub async fn stream_prefetch(service: String, id: String, hq: Option<u8>, fmt: Option<String>) -> Result<bool, String> {
    if service == "local" || service == "sp" {
        return Ok(false);
    }
    // Behind a bot check every client refuses again; the real request will be
    // answered from another service (`ytm_alternative`), so do not hammer
    // YouTube ahead of time and make the IP's standing worse.
    if service == "ytm" && crate::ytm::bot_checked_recently() {
        return Ok(false);
    }
    let hq = hq.unwrap_or(1).min(2);
    let fmt = fmt.unwrap_or_else(|| "best".into());
    let key = cache_key_of(&service, &id, hq, &fmt);
    if cache_get(&key).is_some() {
        return Ok(true);
    }
    let u = resolve_pub(&service, &id, hq, &fmt).await?;
    cache_put(key.clone(), u.clone());
    // An HLS stream is measured now too, so the switch needs no HEADs.
    let url = Secret::of(&u).url;
    if url.contains(".m3u8") {
        hls_prepare(&key, &url).await;
    }
    Ok(true)
}

/// Hosts whose artwork may be relayed. A suffix match on label boundaries —
/// an open image relay would otherwise be one more local service worth
/// attacking, token or no token.
const IMG_HOSTS: &[&str] = &[
    "ytimg.com",
    "ggpht.com",
    "googleusercontent.com",
    "googlevideo.com",
    "youtube.com",
    "sndcdn.com",
    "soundcloud.com",
    "scdn.co",
    "spotify.com",
    "spotifycdn.com",
    "unsplash.com",
    "yandex.net",
    "yandex.ru",
    "last.fm",
    "lastfm.freetls.fastly.net",
    "fastly.net",
    "supabase.co",
    "supabase.in",
    "mzstatic.com",
    "apple.com",
    "githubusercontent.com",
    "discordapp.com",
    "discord.com",
    "discord.net",
    "dzcdn.net",
    "deezer.com",
    "bcbits.com",
    "bandcamp.com",
    "gravatar.com",
    "imgur.com",
    "vk.com",
    "userapi.com",
    "cloudinary.com",
    "genius.com",
    "images.genius.com",
    "assets.genius.com",
    "itunes.apple.com",
    "discogs.com",
    "musixmatch.com",
];

fn serve_img(
    rt: &tokio::runtime::Runtime,
    raw: &str,
    head_only: bool,
    origin: Option<&str>,
    request: tiny_http::Request,
) -> Result<(), String> {
    let fail = |request: tiny_http::Request, code: u16, msg: &str| {
        let mut resp = Response::from_string(msg.to_string()).with_status_code(StatusCode(code));
        for h in cors(origin) {
            resp = resp.with_header(h);
        }
        request.respond(resp).map_err(|e| e.to_string())
    };

    let mut url = urlencoding::decode(raw)
        .map(|c| c.into_owned())
        .unwrap_or_else(|_| raw.to_string());
    if url.starts_with("//") {
        url = format!("https:{url}");
    }
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return fail(request, 400, "https urls only");
    }
    let parsed = match reqwest::Url::parse(&url) {
        Ok(u) => u,
        Err(_) => return fail(request, 400, "bad url"),
    };
    let host = parsed.host_str().unwrap_or("");
    if !IMG_HOSTS
        .iter()
        .any(|h| crate::proxy::host_matches(host, h))
    {
        return fail(request, 403, "host not allowed");
    }

    let sent = rt.block_on(async {
        // Cover art is a body read like any other; the total deadline on
        // client() could sever a large image on a slow link.
        let c = crate::api::media_client()?;
        c.get(&url)
            .header("User-Agent", crate::api::UA)
            .send()
            .await
            .map_err(|e| e.to_string())
    });
    let resp = match sent {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            let s = r.status();
            let _ = r;
            return fail(request, if s.as_u16() == 404 { 404 } else { 502 }, "upstream error");
        }
        Err(e) => return fail(request, 502, &format!("fetch failed: {e}")),
    };

    let ctype = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let clen = resp.content_length().map(|v| v as usize);

    let mut headers = vec![
        try_header("Content-Type", &ctype).unwrap_or_else(|| header("Content-Type", "image/jpeg")),
        // Covers are immutable content-addressed-ish; the webview can keep them.
        header("Cache-Control", "public, max-age=604800"),
    ];
    headers.extend(cors(origin));

    // The two branches have different reader types; erase them behind a
    // trait object so one `response` binding serves both.
    let response: Response<Box<dyn std::io::Read>> = if head_only {
        Response::new(
            StatusCode(200),
            headers,
            Box::new(std::io::empty()),
            clen,
            None,
        )
    } else {
        let body = Upstream::new(rt, Some(resp), String::new(), None, clen.map(|v| v as u64), 0);
        Response::new(StatusCode(200), headers, Box::new(body), clen, None)
    };
    request.respond(response).map_err(|e| e.to_string())
}

/// Supabase relay: forwards method, auth headers and body to the one allowed
/// host family. The response is streamed back verbatim with our CORS headers,
/// so supabase-js sees an ordinary same-origin reply.
fn serve_relay(
    rt: &tokio::runtime::Runtime,
    raw: &str,
    _query: &str,
    origin: Option<&str>,
    mut request: tiny_http::Request,
) -> Result<(), String> {
    let fail = |request: tiny_http::Request, code: u16, msg: &str| {
        let mut resp = Response::from_string(msg.to_string()).with_status_code(StatusCode(code));
        for h in cors(origin) {
            resp = resp.with_header(h);
        }
        request.respond(resp).map_err(|e| e.to_string())
    };

    let url = urlencoding::decode(raw)
        .map(|c| c.into_owned())
        .unwrap_or_else(|_| raw.to_string());
    if !url.starts_with("https://") {
        return fail(request, 400, "https urls only");
    }
    let parsed = match reqwest::Url::parse(&url) {
        Ok(u) => u,
        Err(_) => return fail(request, 400, "bad url"),
    };
    // `query` is only ever the relay's own access token (`?k=…`), and it was
    // already checked by the caller. The target's own query string rides inside
    // the percent-encoded path segment, where `Url::parse` decodes it exactly
    // once. Re-appending anything from here would percent-encode values that
    // are already encoded — `%20` becoming `%2520` — and PostgREST-encoded
    // filters would silently stop matching.
    let host = parsed.host_str().unwrap_or("");
    // Only the project's own Supabase endpoints: REST, auth, storage, functions.
    if !(host.ends_with(".supabase.co")
        || host.ends_with(".supabase.in")
        || host == "supabase.co")
    {
        return fail(request, 403, "host not allowed");
    }

    let method = reqwest::Method::from_bytes(request.method().as_str().as_bytes())
        .unwrap_or(reqwest::Method::GET);

    // Forward the auth-relevant request headers only.
    let keep = [
        "authorization",
        "apikey",
        "content-type",
        "accept",
        "prefer",
        "x-client-info",
        "x-supabase-api-version",
        "accept-profile",
        "content-profile",
    ];
    let mut headers = Vec::new();
    for h in request.headers() {
        let name = h.field.as_str().to_ascii_lowercase();
        if keep.contains(&name.as_str()) {
            headers.push((name, h.value.as_str().to_string()));
        }
    }

    let mut body = Vec::new();
    if method != reqwest::Method::GET && method != reqwest::Method::HEAD {
        use std::io::Read;
        let mut reader = request.as_reader().take(4 * 1024 * 1024 + 1);
        let _ = reader.read_to_end(&mut body);
        if body.len() > 4 * 1024 * 1024 {
            return fail(request, 413, "body too large");
        }
    }

    let sent = rt.block_on(async move {
        // Streamed back to the webview, so the same no-total-deadline client
        // as the audio path (see api::media_client).
        let c = crate::api::media_client()?;
        let mut req = c.request(method.clone(), parsed);
        for (n, v) in &headers {
            req = req.header(n.as_str(), v.as_str());
        }
        if !body.is_empty() && method != reqwest::Method::GET && method != reqwest::Method::HEAD {
            req = req.body(body);
        }
        req.send().await.map_err(|e| e.to_string())
    });
    let resp = match sent {
        Ok(r) => r,
        Err(e) => return fail(request, 502, &format!("upstream failed: {e}")),
    };

    let status = resp.status();
    let ctype = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let clen = resp.content_length();

    let mut out_headers = vec![
        try_header("Content-Type", &ctype)
            .unwrap_or_else(|| header("Content-Type", "application/json")),
    ];
    for h in cors(origin) {
        out_headers.push(h);
    }

    let body = Upstream::new(rt, Some(resp), String::new(), None, clen, 0);
    let reader: Box<dyn std::io::Read> = if request.method() == &tiny_http::Method::Head {
        Box::new(std::io::empty())
    } else {
        Box::new(body)
    };
    let out = Response::new(StatusCode(status.as_u16()), out_headers, reader, clen.map(|v| v as usize), None);
    request.respond(out).map_err(|e| e.to_string())
}

#[cfg(test)]
mod range_tests {
    use super::{
        content_range_total, hls_attr, hls_ctype, hls_parts, hls_variant, parse_range, plain_range, token, token_ok, HlsFile, HlsPart,
        RangeSpec,
    };

    fn bytes(r: &str, total: u64) -> (u64, u64) {
        match parse_range(Some(r), total) {
            RangeSpec::Bytes(a, b) => (a, b),
            _ => panic!("{r} did not parse as a range"),
        }
    }

    #[test]
    fn parses_the_three_forms() {
        assert_eq!(bytes("bytes=0-99", 1000), (0, 99));
        assert_eq!(bytes("bytes=100-", 1000), (100, 999));
        // The suffix form: the last 500 bytes, not the first 501.
        assert_eq!(bytes("bytes=-500", 1000), (500, 999));
        // An end past EOF is clamped rather than rejected.
        assert_eq!(bytes("bytes=900-5000", 1000), (900, 999));
        // A suffix longer than the file is the whole file.
        assert_eq!(bytes("bytes=-5000", 1000), (0, 999));
    }

    #[test]
    fn rejects_and_ignores() {
        assert!(matches!(
            parse_range(Some("bytes=1000-"), 1000),
            RangeSpec::Unsatisfiable
        ));
        assert!(matches!(
            parse_range(Some("bytes=500-100"), 1000),
            RangeSpec::Unsatisfiable
        ));
        // Multi-range is answered as a full body, not as a bogus 206.
        assert!(matches!(
            parse_range(Some("bytes=0-99,200-299"), 1000),
            RangeSpec::None
        ));
        assert!(matches!(
            parse_range(Some("items=0-1"), 1000),
            RangeSpec::None
        ));
        assert!(matches!(parse_range(None, 1000), RangeSpec::None));
    }

    fn urls(parts: &[HlsPart]) -> Vec<&str> {
        parts.iter().map(|p| p.url.as_str()).collect()
    }

    #[test]
    fn hls_playlist_yields_segments_in_order() {
        // The old SoundCloud shape: MP3 segments, tags carrying no address.
        let playlist = "#EXTM3U\n\
                        #EXT-X-VERSION:3\n\
                        #EXT-X-TARGETDURATION:10\n\
                        #EXTINF:9.009,\n\
                        seg0.ts\n\
                        #EXTINF:9.009,\n\
                        /media/seg1.ts\n\
                        #EXTINF:5.5,\n\
                        https://cdn.example/abs/seg2.ts\n\
                        #EXT-X-ENDLIST\n";
        let parts = hls_parts(playlist, "https://cdn.example/hls/track/media.m3u8").unwrap();
        assert_eq!(
            urls(&parts),
            vec![
                "https://cdn.example/hls/track/seg0.ts",
                "https://cdn.example/media/seg1.ts",
                "https://cdn.example/abs/seg2.ts",
            ]
        );
        assert!(parts.iter().all(|p| p.len.is_none() && p.sub.is_none()));
        assert!(hls_parts("", "https://x/y/m.m3u8").unwrap().is_empty());
    }

    #[test]
    fn hls_fmp4_keeps_the_init_section_first() {
        // SoundCloud's AAC renditions today: CMAF fragments that mean nothing
        // without the init section named by #EXT-X-MAP. Dropping it was the
        // "service answered, file did not play" failure.
        let playlist = "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:10\n#EXT-X-PLAYLIST-TYPE:VOD\n\
                        #EXT-X-MAP:URI=\"https://m.example/aac_160k/u/init.mp4?expires=9&Policy=a,b\"\n\
                        #EXTINF:10.0078,\nhttps://m.example/aac_160k/u/data000.m4s?expires=9\n\
                        #EXTINF:10.0078,\ndata001.m4s?expires=9\n#EXT-X-ENDLIST\n";
        let parts = hls_parts(playlist, "https://m.example/aac_160k/u/playlist.m3u8").unwrap();
        assert_eq!(
            urls(&parts),
            vec![
                "https://m.example/aac_160k/u/init.mp4?expires=9&Policy=a,b",
                "https://m.example/aac_160k/u/data000.m4s?expires=9",
                "https://m.example/aac_160k/u/data001.m4s?expires=9",
            ]
        );
        assert_eq!(hls_ctype(&parts, true), "audio/mp4");
        // A repeated map (after a discontinuity) is not inserted twice.
        let twice = format!("{playlist}#EXT-X-MAP:URI=\"https://m.example/aac_160k/u/init.mp4?expires=9&Policy=a,b\"\n");
        assert_eq!(hls_parts(&twice, "https://m.example/p.m3u8").unwrap().len(), 3);
    }

    #[test]
    fn hls_byteranges_and_keys() {
        let playlist = "#EXTM3U\n#EXT-X-MAP:URI=\"all.mp4\",BYTERANGE=\"700@0\"\n\
                        #EXT-X-BYTERANGE:1000@700\n#EXTINF:4,\nall.mp4\n\
                        #EXT-X-BYTERANGE:500\n#EXTINF:2,\nall.mp4\n";
        let parts = hls_parts(playlist, "https://h/x/p.m3u8").unwrap();
        assert_eq!(parts.iter().map(|p| p.sub).collect::<Vec<_>>(), vec![Some((0, 700)), Some((700, 1000)), Some((1700, 500))]);
        assert_eq!(parts.iter().map(|p| p.len).collect::<Vec<_>>(), vec![Some(700), Some(1000), Some(500)]);
        assert!(hls_parts("#EXT-X-KEY:METHOD=AES-128,URI=\"k\"\nseg.ts\n", "https://h/p.m3u8").is_err());
        assert!(hls_parts("#EXT-X-KEY:METHOD=NONE\nseg.ts\n", "https://h/p.m3u8").is_ok());
        assert_eq!(hls_attr("METHOD=SAMPLE-AES,URI=\"a,b\",IV=0x1", "IV").as_deref(), Some("0x1"));
        assert_eq!(hls_attr("URI=\"a,b\",IV=0x1", "URI").as_deref(), Some("a,b"));
    }

    #[test]
    fn hls_master_picks_by_bandwidth() {
        let m = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=64000,CODECS=\"mp4a.40.2\"\nlow/p.m3u8\n\
                 #EXT-X-STREAM-INF:BANDWIDTH=160000,CODECS=\"mp4a.40.2\"\nhigh/p.m3u8\n";
        assert_eq!(hls_variant(m, "https://h/a/master.m3u8", false).as_deref(), Some("https://h/a/high/p.m3u8"));
        assert_eq!(hls_variant(m, "https://h/a/master.m3u8", true).as_deref(), Some("https://h/a/low/p.m3u8"));
        assert!(hls_variant("#EXTM3U\n", "https://h/m.m3u8", false).is_none());
    }

    #[test]
    fn hls_file_locates_bytes() {
        let part = |n| HlsPart { url: String::new(), sub: None, len: Some(n) };
        let f = HlsFile { parts: vec![part(100), part(50), part(10)], total: Some(160), ctype: "audio/mp4", ua: None };
        assert_eq!(f.locate(0), (0, 0));
        assert_eq!(f.locate(99), (0, 99));
        assert_eq!(f.locate(100), (1, 0));
        assert_eq!(f.locate(155), (2, 5));
        assert_eq!(f.locate(160), (3, 0));
    }

    #[test]
    fn plain_ranges_and_totals() {
        assert_eq!(plain_range("bytes=0-"), Some((0, None)));
        assert_eq!(plain_range("bytes=100-199"), Some((100, Some(199))));
        assert_eq!(plain_range("bytes=-500"), None);
        assert_eq!(plain_range("bytes=0-1,5-6"), None);
        assert_eq!(plain_range("bytes=9-3"), None);
        assert_eq!(content_range_total("bytes 0-524287/3456789"), Some(3_456_789));
        assert_eq!(content_range_total("bytes 0-1/*"), None);
    }

    #[test]
    fn hls_range_spec_bounded_test() {
        // `parse_range` as the local-file path actually uses it: the total is
        // the real size on disk, so the clamp points below are real bounds and
        // not an estimate.
        let total = 640_000u64;
        match parse_range(Some("bytes=160000-319999"), total) {
            RangeSpec::Bytes(start, end) => {
                assert_eq!(start, 160_000);
                assert_eq!(end, 319_999);
                assert_eq!(end - start + 1, 160_000);
            }
            _ => panic!("expected RangeSpec::Bytes"),
        }
        match parse_range(Some("bytes=-160000"), total) {
            RangeSpec::Bytes(start, end) => {
                assert_eq!(start, 480_000);
                assert_eq!(end, 639_999);
            }
            _ => panic!("expected RangeSpec::Bytes for suffix"),
        }
    }

    #[test]
    fn test_token_ok() {
        let t = token();
        assert!(token_ok(t));
        assert!(!token_ok(""));
        assert!(!token_ok(&format!("{t}1")));
        assert!(!token_ok(&format!("1{t}")));
        assert!(!token_ok(&format!("{}{}", t, "a".repeat(256))));
    }

    /// End to end against the real YouTube: search, then pull each result
    /// through this proxy exactly as <audio> does (open-ended range, then a
    /// seek into the middle), and report bytes and timing. Files land in
    /// /tmp/mw_live_<id> for ffprobe.
    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn live_ytm_proxy() {
        let port = super::spawn().expect("proxy");
        let tok = super::token();
        let q = std::env::var("MW_Q").unwrap_or_else(|_| "кино звезда по имени солнце".into());
        let tracks = crate::ytm::search(&q).await.expect("search");
        let c = reqwest::Client::new();
        for tr in tracks.iter().take(std::env::var("MW_N").ok().and_then(|v| v.parse().ok()).unwrap_or(4)) {
            let url = format!(
                "http://127.0.0.1:{port}/stream/ytm/{}?k={tok}&hq=1&fmt=best&t={}&a={}&d={}",
                tr.id,
                urlencoding::encode(&tr.t),
                urlencoding::encode(&tr.a),
                tr.d
            );
            let t0 = std::time::Instant::now();
            let r = c.get(&url).header("Range", "bytes=0-").send().await;
            match r {
                Err(e) => println!("{} {:?}: ERR {e}", tr.id, tr.t),
                Ok(r) => {
                    let st = r.status().as_u16();
                    let ct = r.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                    let cl = r.headers().get("content-length").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                    let first = t0.elapsed();
                    let body = r.bytes().await.map(|b| b.to_vec()).unwrap_or_default();
                    let _ = std::fs::write(format!("/tmp/mw_live_{}", tr.id), &body);
                    println!(
                        "{} {:?} [{}s]: HTTP {st} {ct} len={cl} got={} first={:?} total={:?}",
                        tr.id, tr.t, tr.d, body.len(), first, t0.elapsed()
                    );
                    if let Ok(total) = cl.parse::<u64>() {
                        let mid = total / 2;
                        let r2 = c.get(&url).header("Range", format!("bytes={mid}-")).send().await;
                        if let Ok(r2) = r2 {
                            let st2 = r2.status().as_u16();
                            let n2 = r2.bytes().await.map(|b| b.len()).unwrap_or(0);
                            println!("   seek {mid}-: HTTP {st2} got={n2} (want {})", total - mid);
                        }
                    }
                }
            }
            println!("   alt: {:?}", super::stream_alt(tr.id.clone()));
            println!("   diag: {}", super::stream_diag("ytm".into(), tr.id.clone()).replace('\n', " | "));
        }
    }
}


/// The proxy end to end against fake upstreams on loopback: a googlevideo
/// that refuses open-ended and oversized ranges, and a SoundCloud-style HLS
/// rendition (init section + fragments). Offline; runs with `cargo test`.
#[cfg(test)]
mod upstream_tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    fn byte(i: u64) -> u8 {
        (i % 251) as u8
    }

    fn range_of(req: &tiny_http::Request) -> Option<String> {
        req.headers()
            .iter()
            .find(|h| h.field.equiv("Range"))
            .map(|h| h.value.as_str().to_string())
    }

    /// Serves `/gv?clen=N` like googlevideo (bounded ranges only) and an HLS
    /// rendition under `/hls/`. Returns the port and a playlist-fetch counter.
    fn fake(gv_len: u64, parts: Vec<Vec<u8>>) -> (u16, Arc<AtomicUsize>) {
        let server = Arc::new(tiny_http::Server::http("127.0.0.1:0").unwrap());
        let port = server.server_addr().to_ip().unwrap().port();
        let playlists = Arc::new(AtomicUsize::new(0));
        let pl = playlists.clone();
        let parts = Arc::new(parts);
        std::thread::spawn(move || loop {
            let Ok(req) = server.recv() else { break };
            let (pl, parts) = (pl.clone(), parts.clone());
            std::thread::spawn(move || answer(req, gv_len, &pl, &parts));
        });
        (port, playlists)
    }

    fn answer(req: tiny_http::Request, gv_len: u64, pl: &AtomicUsize, parts: &[Vec<u8>]) {
        let path = req.url().split('?').next().unwrap_or("").to_string();
        let range = range_of(&req).and_then(|r| super::plain_range(&r));
        let hdr = |k: &str, v: &str| tiny_http::Header::from_bytes(k.as_bytes(), v.as_bytes()).unwrap();
        if path == "/gv" {
            // Open-ended, missing or larger than 3 MiB (or `max=`): refused.
            let max = crate::ytm::url_param(req.url(), "max").and_then(|v| v.parse::<u64>().ok()).unwrap_or(3 * 1024 * 1024);
            let Some((s, Some(e))) = range else {
                let _ = req.respond(tiny_http::Response::from_string("no").with_status_code(403));
                return;
            };
            if s >= gv_len {
                let resp = tiny_http::Response::from_string("")
                    .with_status_code(416)
                    .with_header(hdr("Content-Range", &format!("bytes */{gv_len}")));
                let _ = req.respond(resp);
                return;
            }
            if e - s >= max {
                let _ = req.respond(tiny_http::Response::from_string("no").with_status_code(403));
                return;
            }
            let e = e.min(gv_len - 1);
            let body: Vec<u8> = (s..=e).map(byte).collect();
            let resp = tiny_http::Response::from_data(body)
                .with_status_code(206)
                .with_header(hdr("Content-Range", &format!("bytes {s}-{e}/{gv_len}")))
                .with_header(hdr("Content-Type", "audio/webm"));
            let _ = req.respond(resp);
            return;
        }
        if path == "/hls/p.m3u8" {
            pl.fetch_add(1, Ordering::SeqCst);
            let mut text = String::from("#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:10\n#EXT-X-MAP:URI=\"init.mp4?expires=99999999999\"\n");
            for i in 1..parts.len() {
                text.push_str(&format!("#EXTINF:10.0,\ndata{:03}.m4s?expires=99999999999\n", i - 1));
            }
            text.push_str("#EXT-X-ENDLIST\n");
            let _ = req.respond(tiny_http::Response::from_string(text));
            return;
        }
        let idx = if path == "/hls/init.mp4" {
            Some(0)
        } else {
            path.strip_prefix("/hls/data")
                .and_then(|p| p.strip_suffix(".m4s"))
                .and_then(|n| n.parse::<usize>().ok())
                .map(|n| n + 1)
        };
        let Some(data) = idx.and_then(|i| parts.get(i)).cloned() else {
            let _ = req.respond(tiny_http::Response::from_string("404").with_status_code(404));
            return;
        };
        let total = data.len() as u64;
        if req.method() == &tiny_http::Method::Head {
            let _ = req.respond(tiny_http::Response::new(200.into(), vec![], std::io::empty(), Some(total as usize), None));
            return;
        }
        match range {
            Some((s, e)) => {
                let e = e.unwrap_or(total - 1).min(total - 1);
                let resp = tiny_http::Response::from_data(data[s as usize..=e as usize].to_vec())
                    .with_status_code(206)
                    .with_header(hdr("Content-Range", &format!("bytes {s}-{e}/{total}")));
                let _ = req.respond(resp);
            }
            None => {
                let _ = req.respond(tiny_http::Response::from_data(data));
            }
        }
    }

    fn get(url: &str, range: Option<&str>) -> (u16, Vec<(String, String)>, Vec<u8>) {
        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let c = reqwest::Client::builder().no_proxy().build().unwrap();
            let mut req = c.get(url);
            if let Some(r) = range {
                req = req.header("Range", r);
            }
            let r = req.send().await.unwrap();
            let st = r.status().as_u16();
            let hs = r
                .headers()
                .iter()
                .map(|(k, v)| (k.as_str().to_ascii_lowercase(), v.to_str().unwrap_or("").to_string()))
                .collect();
            (st, hs, r.bytes().await.unwrap().to_vec())
        })
    }

    fn h<'a>(hs: &'a [(String, String)], k: &str) -> Option<&'a str> {
        hs.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str())
    }

    #[test]
    fn googlevideo_is_read_in_bounded_windows() {
        let n: u64 = 5 * 1024 * 1024 + 12345;
        let (up, _) = fake(n, vec![vec![0]]);
        let port = super::spawn().unwrap();
        let tok = super::token();
        let key = super::cache_key_of("ytm", "fakevid1", 1, "best");
        super::cache_put(key, format!("http://127.0.0.1:{up}/gv?clen={n}&itag=251#mwua=ANDROID_VR"));
        let url = format!("http://127.0.0.1:{port}/stream/ytm/fakevid1?k={tok}&hq=1&fmt=best&alt=0");

        // What <audio> sends first: an open-ended range. The fake refuses
        // those outright, exactly like googlevideo did.
        let (st, hs, body) = get(&url, Some("bytes=0-"));
        assert_eq!(st, 206);
        assert_eq!(h(&hs, "content-range"), Some(format!("bytes 0-{}/{n}", n - 1).as_str()));
        assert_eq!(body.len() as u64, n);
        assert!(body.iter().enumerate().all(|(i, b)| *b == byte(i as u64)));

        // A seek into the middle.
        let mid = n / 2 + 7;
        let (st, hs, body) = get(&url, Some(&format!("bytes={mid}-")));
        assert_eq!(st, 206);
        assert_eq!(h(&hs, "content-range"), Some(format!("bytes {mid}-{}/{n}", n - 1).as_str()));
        assert_eq!(body.len() as u64, n - mid);
        assert!(body.iter().enumerate().all(|(i, b)| *b == byte(mid + i as u64)));

        // A bounded range, and no range at all.
        let (st, _, body) = get(&url, Some("bytes=100-199"));
        assert_eq!((st, body.len()), (206, 100));
        assert_eq!(body[0], byte(100));
        let (st, hs, body) = get(&url, None);
        assert_eq!(st, 200);
        assert_eq!(h(&hs, "content-length"), Some(n.to_string().as_str()));
        assert_eq!(body.len() as u64, n);

        // Past the end.
        let (st, hs, _) = get(&url, Some(&format!("bytes={n}-")));
        assert_eq!(st, 416);
        assert_eq!(h(&hs, "content-range"), Some(format!("bytes */{n}").as_str()));
    }

    /// From some connections a 2 KB range passes and a large one is a 403
    /// (the self-test's "win=0KB"). The proxy shrinks its window instead of
    /// giving the URL up.
    #[test]
    fn a_refused_window_is_asked_again_smaller() {
        let n: u64 = 1024 * 1024 + 4321;
        let (up, _) = fake(n, vec![vec![0]]);
        let port = super::spawn().unwrap();
        let tok = super::token();
        let key = super::cache_key_of("ytm", "fakevid2", 1, "best");
        let max = 200 * 1024;
        super::cache_put(key, format!("http://127.0.0.1:{up}/gv?clen={n}&max={max}&itag=251#mwua=ANDROID_VR"));
        let url = format!("http://127.0.0.1:{port}/stream/ytm/fakevid2?k={tok}&hq=1&fmt=best&alt=0");
        let (st, _, body) = get(&url, Some("bytes=0-"));
        assert_eq!(st, 206);
        assert_eq!(body.len() as u64, n);
        assert!(body.iter().enumerate().all(|(i, b)| *b == byte(i as u64)));
        assert!(super::gv_window() < max, "the smaller window is kept for the next track");
        let (st, _, body) = get(&url, Some(&format!("bytes={}-", n / 2)));
        assert_eq!(st, 206);
        assert_eq!(body.len() as u64, n - n / 2);
    }

    #[test]
    fn hls_is_served_as_one_seekable_file() {
        let sizes = [700usize, 30_000, 25_000, 31_337, 9_000];
        let mut parts = Vec::new();
        let mut i = 0u64;
        for n in sizes {
            parts.push((0..n).map(|_| {
                i += 1;
                byte(i * 7)
            }).collect::<Vec<u8>>());
        }
        let whole: Vec<u8> = parts.concat();
        let total = whole.len() as u64;
        let (up, playlists) = fake(1, parts);
        let port = super::spawn().unwrap();
        let tok = super::token();
        let key = super::cache_key_of("sc", "fakehls1", 1, "best");
        super::cache_put(key, format!("http://127.0.0.1:{up}/hls/p.m3u8"));
        let url = format!("http://127.0.0.1:{port}/stream/sc/fakehls1?k={tok}&hq=1&fmt=best");

        let (st, hs, body) = get(&url, Some("bytes=0-"));
        assert_eq!(st, 206);
        assert_eq!(h(&hs, "content-type"), Some("audio/mp4"));
        assert_eq!(h(&hs, "accept-ranges"), Some("bytes"));
        assert_eq!(h(&hs, "content-range"), Some(format!("bytes 0-{}/{total}", total - 1).as_str()));
        assert_eq!(body, whole, "init section + every fragment, in order");

        // A range across a part boundary, then one inside the last part.
        let (st, _, body) = get(&url, Some("bytes=29000-62000"));
        assert_eq!(st, 206);
        assert_eq!(body, whole[29000..=62000].to_vec());
        let (st, _, body) = get(&url, Some(&format!("bytes={}-", total - 100)));
        assert_eq!(st, 206);
        assert_eq!(body, whole[(total - 100) as usize..].to_vec());
        let (st, hs, body) = get(&url, None);
        assert_eq!(st, 200);
        assert_eq!(h(&hs, "content-length"), Some(total.to_string().as_str()));
        assert_eq!(body.len() as u64, total);
        let (st, _, _) = get(&url, Some(&format!("bytes={total}-")));
        assert_eq!(st, 416);

        // Measured once: the seeks above came from the cache.
        assert_eq!(playlists.load(Ordering::SeqCst), 1);
    }
}

#[cfg(test)]
mod live_sc {
    /// The real SoundCloud through the proxy (needs the network):
    /// `MW_SC=<track id> cargo test live_sc -- --ignored --nocapture`.
    /// Bodies land in /tmp/sc_live_<n>.bin for ffprobe.
    #[test]
    #[ignore]
    fn live_sc_proxy() {
        let id = std::env::var("MW_SC").unwrap_or_else(|_| "2152309329".into());
        let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
        let t0 = std::time::Instant::now();
        let u = rt.block_on(crate::api::sc_stream_url("", &id));
        println!("resolve {:?}: {:?}", t0.elapsed(), u.as_ref().map(|u| u.split('?').next().unwrap_or("").to_string()));
        let port = super::spawn().unwrap();
        let tok = super::token();
        for (i, r) in ["bytes=0-", "bytes=1000000-", "bytes=0-"].iter().enumerate() {
            let t0 = std::time::Instant::now();
            let out = std::process::Command::new("curl")
                .args(["-s", "-D", "-", "-o", &format!("/tmp/sc_live_{i}.bin"), "-w", "%{http_code} %{size_download}", "-H"])
                .arg(format!("Range: {r}"))
                .arg(format!("http://127.0.0.1:{port}/stream/sc/{id}?k={tok}&hq=1&fmt=best"))
                .output()
                .unwrap();
            let txt = String::from_utf8_lossy(&out.stdout).to_string();
            let heads: Vec<&str> = txt.lines().filter(|l| l.starts_with("Content-") || l.starts_with("HTTP/")).collect();
            println!("{r}: {:?} in {:?} {}", heads, t0.elapsed(), txt.lines().last().unwrap_or(""));
        }
    }
}

#[cfg(test)]
mod pin_tests {
    use super::{file_ident, pin_ok};

    #[test]
    fn a_mid_file_request_is_served_only_from_the_pinned_file() {
        let k = "ytm/pin-test/hqwebm";
        let gv = |host: &str, clen: u32, lmt: u32, extra: &str| {
            file_ident("ytm", &format!("https://{host}.googlevideo.com/videoplayback?itag=251&clen={clen}&lmt={lmt}{extra}"), None, None, None)
        };
        let a = gv("r1", 100, 1, "&expire=5");
        let same = gv("r9", 100, 1, "&expire=77&ip=1.2.3.4");
        let other = gv("r2", 120, 2, "");
        let drc = gv("r3", 100, 1, "&xtags=drc%3D1");
        assert_eq!(a, same);
        assert_ne!(a, other);
        assert_ne!(a, drc);
        assert!(pin_ok(k, 0, &a));
        assert!(pin_ok(k, 5000, &same));
        assert!(!pin_ok(k, 5000, &other));
        assert!(!pin_ok(k, 5000, &drc));
        // the same recording from another service: not in the middle of a file
        let alt = file_ident("ytm", "https://s3.yandex.net/get-mp3/x.mp3", Some("ym"), None, Some(7_000_000));
        assert!(!pin_ok(k, 5000, &alt));
        // a fresh load from the start may switch, and the new file is the pin
        assert!(pin_ok(k, 0, &alt));
        assert!(pin_ok(k, 5000, &alt));
        assert!(!pin_ok(k, 9000, &a));
    }
}
