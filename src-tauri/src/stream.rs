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

/// Pipes an upstream response body straight to the client.
///
/// The previous code called `resp.bytes()` and only then answered, so nothing
/// reached `<audio>` until the entire track had been downloaded — a whole FLAC
/// held in RAM and several seconds of silence before playback started. Reading
/// chunk by chunk means the first bytes leave the proxy as soon as they arrive.
enum UpstreamKind {
    Direct(Option<reqwest::Response>),
    Hls {
        segments: Vec<String>,
        seg_idx: usize,
        current_resp: Option<reqwest::Response>,
    },
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
        }
    }

    fn hls(
        rt: &'a tokio::runtime::Runtime,
        segments: Vec<String>,
        start_seg: usize,
        upstream_url: String,
        media_ua: Option<String>,
        initial_offset: u64,
        expected_total: Option<u64>,
    ) -> Self {
        Self {
            rt,
            cipher: None,
            kind: UpstreamKind::Hls {
                segments,
                seg_idx: start_seg,
                current_resp: None,
            },
            buf: Vec::new(),
            pos: 0,
            upstream_url,
            media_ua,
            bytes_delivered: 0,
            expected_total,
            initial_offset,
            reconnect_attempts: 0,
            failover: None,
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

    /// A ranged GET from `offset`. At offset 0 a 200 is as good as a 206; past
    /// it only a 206 is, since a 200 would restart the file mid-stream.
    fn fetch_from(&self, url: &str, ua: Option<&str>, offset: u64) -> Result<reqwest::Response, u16> {
        self.rt.block_on(async {
            let c = crate::api::media_client().map_err(|_| 0u16)?;
            let mut req = c.get(url).header("Range", format!("bytes={offset}-"));
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
        })
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
            match self.fetch_from(&url, self.media_ua.as_deref(), offset) {
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
            let pick = self.rt.block_on(crate::ytm::stream_same_itag(&f.video_id, f.itag, &f.tried));
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

/// Segment URLs of a media playlist, in order. `#EXTINF` and the other tags
/// carry no address, so they are dropped and only the bare lines are resolved
/// against the playlist they came from. Split out from `handle` because this is
/// the part with the real failure modes — a tag parsed as a segment, or a
/// relative one resolved against the master playlist instead of the variant —
/// and it is worth being able to pin down without a network round-trip.
fn hls_segments(playlist: &str, base: &str) -> Vec<String> {
    playlist
        .lines()
        .map(str::trim)
        .filter(|l| !l.starts_with('#') && !l.is_empty())
        .map(|l| resolve_hls_url(base, l))
        .collect()
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
                UpstreamKind::Hls { segments, seg_idx, current_resp } => {
                    if *seg_idx >= segments.len() {
                        return Ok(0);
                    }
                    if current_resp.is_none() {
                        let seg_url = segments[*seg_idx].clone();
                        let res = self.rt.block_on(async {
                            let c = crate::api::media_client().ok()?;
                            let mut req = c.get(&seg_url);
                            if let Some(ua) = &self.media_ua {
                                req = req.header("User-Agent", ua);
                            }
                            req.send().await.ok()
                        });
                        match res {
                            Some(r) if r.status().is_success() => {
                                *current_resp = Some(r);
                            }
                            _ => {
                                // Skip failing segment and try next
                                *seg_idx += 1;
                                continue;
                            }
                        }
                    }
                    let Some(resp) = current_resp.as_mut() else {
                        *seg_idx += 1;
                        continue;
                    };
                    let chunk_res = self.rt.block_on(async {
                        tokio::time::timeout(std::time::Duration::from_secs(10), resp.chunk()).await
                    });
                    match chunk_res {
                        Ok(Ok(Some(chunk))) => {
                            self.buf = chunk.to_vec();
                            self.pos = 0;
                        }
                        _ => {
                            // Segment finished or stalled: advance to next segment
                            *current_resp = None;
                            *seg_idx += 1;
                        }
                    }
                }
            }
        }
        let n = out.len().min(self.buf.len() - self.pos);
        out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
        self.pos += n;
        self.bytes_delivered += n as u64;
        Ok(n)
    }
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

    // Two attempts. A cached stream URL is signed and short-lived: once it
    // expires the service answers 403, and the old code passed that straight to
    // <audio>, which is exactly the intermittent "playback failed" on a track
    // that played fine a few minutes earlier. On a bad status the cache entry is
    // dropped and the URL resolved again from scratch.
    // YouTube gets a third: after a refusal its resolve asks a different
    // client, and that is a genuinely new chance rather than a repeat.
    let max_attempts: u8 = if service == "ytm" { 3 } else { 2 };
    let mut attempt = 0u8;
    let (status, ctype, crange, clen, resp, secret) = loop {
        attempt += 1;

        let upstream = match cache_get(&cache_key) {
            Some(u) => u,
            None => match rt.block_on(resolve_pub(&service, &id, hq, &fmt)) {
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
        let sent = rt.block_on(async {
            // media_client, not client: this body is read for as long as the
            // media element keeps reading it, and client()'s total deadline
            // would sever it mid-track.
            let c = crate::api::media_client()?;
            let mut req = c.get(&fetch_url);
            // googlevideo only serves a media stream to a client that looks like
            // one of Google's own players and always asks for a byte range.
            let is_google = service == "ytm" || fetch_url.contains("googlevideo.com");
            if is_google {
                req = req.header("User-Agent", secret.ua());
                if range.is_none() {
                    req = req.header("Range", "bytes=0-");
                }
            }
            if let Some(r) = &range {
                if !fetch_url.contains(".m3u8") {
                    req = req.header("Range", r.clone());
                }
            }
            // Only the headers are awaited here; the body is streamed below.
            req.send().await.map_err(|e| e.to_string())
        });

        match sent {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status >= 400 {
                    cache_drop(&cache_key);
                    // A refused googlevideo URL says something about the client
                    // that signed it: remember that, so the next resolve asks
                    // another client first instead of minting the same dud.
                    if service == "ytm" {
                        if let Some(c) = &secret.client {
                            crate::ytm::note_media_failure(c, &format!("HTTP {status}"));
                        }
                    }
                    if attempt < max_attempts {
                        continue;
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
                break (status, ctype, crange, clen, resp, secret);
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
    let (body, final_status, final_clen, final_crange, final_ctype, advertises_ranges) = if is_hls {
        let m3u8_text = rt.block_on(resp.text()).unwrap_or_default();
        let mut target_m3u8 = m3u8_text.clone();
        let mut final_url = upstream.clone();
        if m3u8_text.contains("#EXT-X-STREAM-INF") {
            // Master playlist: resolve variant playlist
            if let Some(sub) = m3u8_text
                .lines()
                .map(str::trim)
                .find(|l| !l.starts_with('#') && !l.is_empty())
            {
                let sub_url = resolve_hls_url(&upstream, sub);
                final_url = sub_url.clone();
                if let Some(text) = rt.block_on(async {
                    let c = crate::api::media_client().ok()?;
                    c.get(&sub_url).send().await.ok()?.text().await.ok()
                }) {
                    target_m3u8 = text;
                }
            }
        }
        let segments = hls_segments(&target_m3u8, &final_url);

        let is_google = service == "ytm" || upstream.contains("googlevideo.com");
        let body = Upstream::hls(
            rt,
            segments,
            0,
            final_url,
            if is_google {
                Some(secret.ua().to_string())
            } else {
                None
            },
            0,
            None,
        );

        // No Content-Length and no Content-Range, deliberately.
        //
        // The body is the live concatenation of the playlist's segments, and
        // the playlist only ever states their *durations*. Turning seconds into
        // bytes needs a bitrate, and no bitrate is right: 128 kbps is the
        // nominal constant, not the truth for any given stream, and MPEG-TS
        // adds its own overhead on top. A guessed length is not merely
        // imprecise, it is a lie the media element acts on — WebKitGTK either
        // waits for bytes that will never arrive (no `ended`, so no auto-advance
        // to the next track) or cuts the stream at the invented boundary and
        // drops the rest of the song. No length at all is honest and costs
        // nothing: the element reads the real duration out of the transport
        // stream's own PIDs.
        //
        // For the same reason `Accept-Ranges: none` goes out below. A seek we
        // cannot satisfy byte-accurately is better answered by streaming the
        // whole thing than by a 206 whose offsets are fiction.
        (body, 200u16, None, None, "audio/mpeg".to_string(), false)
    } else {
        let is_google = service == "ytm" || upstream.contains("googlevideo.com");
        let mut normalized = ctype;
        if let Some(c) = secret.ctype() {
            // An encrypted file is served as octet-stream; the codec from the
            // file info is the truth.
            normalized = c.to_string();
        } else if normalized == "application/octet-stream" || normalized == "text/plain" || normalized == "binary/octet-stream" {
            if is_google {
                normalized = if fmt == "mp4" { "audio/mp4" } else { "audio/webm" }.to_string();
            } else {
                normalized = "audio/mpeg".to_string();
            }
        }
        // Where the upstream body starts in the file: the keystream has to be
        // seeked to exactly that byte.
        let body_start = crange
            .as_deref()
            .and_then(|r| r.trim().strip_prefix("bytes "))
            .and_then(|r| r.split('-').next())
            .and_then(|n| n.trim().parse::<u64>().ok())
            .unwrap_or(if status == 206 { initial_offset } else { 0 });
        let mut body = Upstream::new(
            rt,
            Some(resp),
            upstream.clone(),
            if is_google {
                Some(secret.ua().to_string())
            } else {
                None
            },
            clen.map(|l| l as u64),
            body_start,
        );
        if let Some(k) = &secret.key {
            body = body.with_key(k, body_start);
        }
        if service == "ytm" {
            let itag = crate::ytm::url_param(&upstream, "itag").and_then(|v| v.parse::<u64>().ok());
            if let (Some(itag), Some(client)) = (itag, secret.client.clone()) {
                body = body.with_failover(Some(Failover {
                    video_id: id.clone(),
                    itag,
                    tried: vec![client.clone()],
                    client,
                    cache_key: cache_key.clone(),
                    left: 2,
                }));
            }
        }
        (body, client_status, clen, crange, normalized, true)
    };

    let mut headers = vec![
        try_header("Content-Type", &final_ctype)
            .unwrap_or_else(|| header("Content-Type", "audio/mpeg")),
        header(
            "Accept-Ranges",
            if advertises_ranges { "bytes" } else { "none" },
        ),
        header("Cache-Control", "no-store"),
    ];
    headers.extend(cors(origin.as_deref()));
    // Only send Content-Range if the client specifically issued a range request
    if range.is_some() {
        if let Some(cr) = &final_crange {
            if let Some(h) = try_header("Content-Range", cr) {
                headers.push(h);
            }
        }
    }

    if head_only {
        let response = Response::new(StatusCode(final_status), headers, std::io::empty(), final_clen, None);
        return request.respond(response).map_err(|e| e.to_string());
    }

    let response = Response::new(StatusCode(final_status), headers, body, final_clen, None);
    request.respond(response).map_err(|e| e.to_string())
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
}

impl Secret {
    fn of(raw: &str) -> Self {
        let (url, frag) = match raw.split_once('#') {
            Some((u, f)) if f.starts_with("mw") => (u.to_string(), f),
            _ => (raw.to_string(), ""),
        };
        let mut s = Secret { url, key: None, codec: None, client: None };
        for kv in frag.split('&') {
            match kv.split_once('=') {
                Some(("mwk", v)) if !v.is_empty() => s.key = Some(v.to_string()),
                Some(("mwc", v)) if !v.is_empty() => s.codec = Some(v.to_string()),
                Some(("mwua", v)) if !v.is_empty() => s.client = Some(v.to_string()),
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
    let hq = hq.unwrap_or(1).min(2);
    let fmt = fmt.unwrap_or_else(|| "best".into());
    let key = cache_key_of(&service, &id, hq, &fmt);
    if cache_get(&key).is_some() {
        return Ok(true);
    }
    let u = resolve_pub(&service, &id, hq, &fmt).await?;
    cache_put(key, u);
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
    use super::{hls_segments, parse_range, token, token_ok, RangeSpec};

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

    #[test]
    fn hls_playlist_yields_segments_in_order() {
        // The shape SoundCloud hands back for an HLS-only track: a media
        // playlist, not a master one, with tags carrying no address.
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
        assert_eq!(
            hls_segments(playlist, "https://cdn.example/hls/track/media.m3u8"),
            vec![
                "https://cdn.example/hls/track/seg0.ts",
                "https://cdn.example/media/seg1.ts",
                "https://cdn.example/abs/seg2.ts",
            ]
        );
        // A master playlist has no segments of its own; its variant lines are
        // picked out before this ever runs, so an empty result is correct.
        assert!(hls_segments("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv.m3u8\n", "https://x/y/m.m3u8").len() == 1);
        assert!(hls_segments("", "https://x/y/m.m3u8").is_empty());
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
}
