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
struct Upstream<'a> {
    // Borrowed from the per-request thread's Arc, which outlives the response.
    rt: &'a tokio::runtime::Runtime,
    resp: Option<reqwest::Response>,
    buf: Vec<u8>,
    pos: usize,
}

impl<'a> std::io::Read for Upstream<'a> {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        while self.pos >= self.buf.len() {
            let Some(resp) = self.resp.as_mut() else {
                return Ok(0);
            };
            match self.rt.block_on(resp.chunk()) {
                Ok(Some(chunk)) => {
                    self.buf = chunk.to_vec();
                    self.pos = 0;
                }
                // End of body: further reads report EOF rather than blocking.
                Ok(None) => {
                    self.resp = None;
                    return Ok(0);
                }
                Err(e) => {
                    self.resp = None;
                    return Err(std::io::Error::other(e.to_string()));
                }
            }
        }
        let n = out.len().min(self.buf.len() - self.pos);
        out[..n].copy_from_slice(&self.buf[self.pos..self.pos + n]);
        self.pos += n;
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

/// Length-independent compare, so a wrong token cannot be recovered byte by
/// byte from response timing.
fn token_ok(given: &str) -> bool {
    let want = token().as_bytes();
    let got = given.as_bytes();
    let mut diff = (want.len() ^ got.len()) as u8;
    for (i, w) in want.iter().enumerate() {
        diff |= w ^ got.get(i).copied().unwrap_or(0);
    }
    diff == 0
}

/// The request must name loopback in `Host`. A page served from a domain that
/// resolves to 127.0.0.1 (DNS rebinding) sends its own host here and fails.
///
/// The port is passed in rather than read from a global: `spawn` can be called
/// more than once in a process (the tests do), and a process-wide OnceLock would
/// leave the second instance validating against the first one's port.
fn host_ok(request: &tiny_http::Request, port: u16) -> bool {
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
                let _ = request.respond(
                    Response::from_string("too many streams").with_status_code(StatusCode(503)),
                );
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
    let hq = query_param(query, "hq").as_deref() != Some("0");
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

    // Local files never touch the network: read the requested byte range
    // straight off the disk.
    if service == "local" {
        return serve_local(&id, range.as_deref(), head_only, origin.as_deref(), request);
    }

    let cache_key = format!("{service}/{id}/{}{fmt}", if hq { "hq" } else { "lq" });

    // Two attempts. A cached stream URL is signed and short-lived: once it
    // expires the service answers 403, and the old code passed that straight to
    // <audio>, which is exactly the intermittent "playback failed" on a track
    // that played fine a few minutes earlier. On a bad status the cache entry is
    // dropped and the URL resolved again from scratch.
    let mut attempt = 0u8;
    let (status, ctype, crange, clen, resp) = loop {
        attempt += 1;

        let upstream = match cache_get(&cache_key) {
            Some(u) => u,
            None => match rt.block_on(resolve(&service, &id, hq, &fmt)) {
                Ok(u) => {
                    cache_put(cache_key.clone(), u.clone());
                    u
                }
                Err(e) => {
                    let mut resp = Response::from_string(format!("resolve failed: {e}"))
                        .with_status_code(StatusCode(502));
                    for h in cors(origin.as_deref()) {
                        resp = resp.with_header(h);
                    }
                    return request.respond(resp).map_err(|e| e.to_string());
                }
            },
        };

        let sent = rt.block_on(async {
            // media_client, not client: this body is read for as long as the
            // media element keeps reading it, and client()'s total deadline
            // would sever it mid-track.
            let c = crate::api::media_client()?;
            let mut req = c.get(&upstream);
            // googlevideo only serves a media stream to a client that looks like
            // one of Google's own players and always asks for a byte range.
            if service == "ytm" {
                req = req.header("User-Agent", crate::ytm::MEDIA_UA);
                if range.is_none() {
                    req = req.header("Range", "bytes=0-");
                }
            }
            if let Some(r) = &range {
                req = req.header("Range", r.clone());
            }
            // Only the headers are awaited here; the body is streamed below.
            req.send().await.map_err(|e| e.to_string())
        });

        match sent {
            Ok(resp) => {
                let status = resp.status().as_u16();
                if status >= 400 && attempt == 1 {
                    cache_drop(&cache_key);
                    continue;
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
                break (status, ctype, crange, clen, resp);
            }
            Err(e) => {
                if attempt == 1 {
                    cache_drop(&cache_key);
                    continue;
                }
                let mut resp = Response::from_string(format!("upstream failed: {e}"))
                    .with_status_code(StatusCode(502));
                for h in cors(origin.as_deref()) {
                    resp = resp.with_header(h);
                }
                return request.respond(resp).map_err(|e| e.to_string());
            }
        }
    };

    let mut headers = vec![
        // The upstream's own value: not trusted enough to panic on, so an
        // unusable one falls back to a sane default instead.
        try_header("Content-Type", &ctype)
            .unwrap_or_else(|| header("Content-Type", "audio/mpeg")),
        header("Accept-Ranges", "bytes"),
        header("Cache-Control", "no-store"),
    ];
    headers.extend(cors(origin.as_deref()));
    if let Some(cr) = &crange {
        if let Some(h) = try_header("Content-Range", cr) {
            headers.push(h);
        }
    }

    if head_only {
        let response = Response::new(StatusCode(status), headers, std::io::empty(), clen, None);
        return request.respond(response).map_err(|e| e.to_string());
    }

    let body = Upstream {
        rt,
        resp: Some(resp),
        buf: Vec::new(),
        pos: 0,
    };

    let response = Response::new(StatusCode(status), headers, body, clen, None);
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

async fn resolve(service: &str, id: &str, hq: bool, fmt: &str) -> Result<String, String> {
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
        "ym" => crate::api::ym_stream_url(&token, id, hq).await,
        "sc" => crate::api::sc_stream_url(&token, id).await,
        "ytm" => crate::ytm::stream(id, hq, fmt).await.map(|p| p.url),
        other => Err(format!("unknown service: {other}")),
    }
}

/// Hosts whose artwork may be relayed. A suffix match on label boundaries —
/// an open image relay would otherwise be one more local service worth
/// attacking, token or no token.
const IMG_HOSTS: &[&str] = &[
    "ytimg.com",
    "ggpht.com",
    "googleusercontent.com",
    "sndcdn.com",
    "yandex.net",
    "yandex.ru",
    "last.fm",
    "lastfm.freetls.fastly.net",
    "supabase.co",
    "supabase.in",
];

fn serve_img(
    rt: &tokio::runtime::Runtime,
    raw: &str,
    head_only: bool,
    origin: Option<&str>,
    request: tiny_http::Request,
) -> Result<(), String> {    let fail = |request: tiny_http::Request, code: u16, msg: &str| {
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
        let body = Upstream {
            rt,
            resp: Some(resp),
            buf: Vec::new(),
            pos: 0,
        };
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
        let mut req = c.request(method.clone(), &url);
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

    let body = Upstream {
        rt,
        resp: Some(resp),
        buf: Vec::new(),
        pos: 0,
    };
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
    use super::{parse_range, RangeSpec};

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
}
