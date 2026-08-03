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
//!   GET /stream/<service>/<track_id>?hq=1
//!   GET /health

use std::collections::HashMap;
use std::sync::Mutex;

use tiny_http::{Header, Response, Server, StatusCode};

/// Short-lived cache of resolved URLs. Without it every seek fires another
/// download-info round trip at the service.
static CACHE: Mutex<Option<HashMap<String, (String, std::time::Instant)>>> = Mutex::new(None);
const CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(240);

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

fn header(name: &str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("valid header")
}

/// Starts the proxy on a free port and returns the port number.
pub fn spawn() -> Result<u16, String> {
    let server = Server::http("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or("no ip addr")?
        .port();

    std::thread::spawn(move || {
        let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
            Ok(rt) => rt,
            Err(e) => {
                eprintln!("stream: runtime: {e}");
                return;
            }
        };
        for request in server.incoming_requests() {
            if let Err(e) = handle(&rt, request) {
                eprintln!("stream: {e}");
            }
        }
    });

    Ok(port)
}

fn handle(rt: &tokio::runtime::Runtime, request: tiny_http::Request) -> Result<(), String> {
    let url = request.url().to_string();

    if url.starts_with("/health") {
        return request
            .respond(Response::from_string("ok").with_header(header("Access-Control-Allow-Origin", "*")))
            .map_err(|e| e.to_string());
    }

    // <audio crossOrigin="anonymous"> is mandatory: without it
    // createMediaElementSource yields silence. But the webview then treats the
    // stream as a CORS fetch and drops every response that lacks these
    // headers — which is why playback died even though the proxy served bytes.
    if request.method() == &tiny_http::Method::Options {
        return request
            .respond(
                Response::empty(StatusCode(204))
                    .with_header(header("Access-Control-Allow-Origin", "*"))
                    .with_header(header("Access-Control-Allow-Headers", "Range"))
                    .with_header(header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS"))
                    .with_header(header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")),
            )
            .map_err(|e| e.to_string());
    }

    let path = url.split('?').next().unwrap_or("");
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or("");
    let hq = !query.contains("hq=0");

    let parts: Vec<&str> = path.trim_start_matches('/').split('/').collect();
    // ["stream", service, id]
    if parts.len() < 3 || parts[0] != "stream" {
        return request
            .respond(Response::from_string("not found").with_status_code(StatusCode(404)))
            .map_err(|e| e.to_string());
    }
    let (service, id) = (parts[1].to_string(), parts[2].to_string());

    let range = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    // Local files never touch the network: read the requested byte range
    // straight off the disk.
    if service == "local" {
        return serve_local(&id, range.as_deref(), request);
    }

    let cache_key = format!("{service}/{id}/{}", if hq { "hq" } else { "lq" });
    let upstream = match cache_get(&cache_key) {
        Some(u) => u,
        None => {
            let resolved = rt.block_on(resolve(&service, &id, hq));
            match resolved {
                Ok(u) => {
                    cache_put(cache_key, u.clone());
                    u
                }
                Err(e) => {
                    return request
                        .respond(
                            Response::from_string(format!("resolve failed: {e}"))
                                .with_status_code(StatusCode(502)),
                        )
                        .map_err(|e| e.to_string())
                }
            }
        }
    };

    let fetched = rt.block_on(async {
        let c = crate::api::client()?;
        let mut req = c.get(&upstream);
        // googlevideo only serves a media stream to a client that looks like
        // one of Google's own players and always asks for a byte range.
        if service == "ytm" {
            req = req.header("User-Agent", crate::ytm::VR_UA);
            if range.is_none() {
                req = req.header("Range", "bytes=0-");
            }
        }
        if let Some(r) = &range {
            req = req.header("Range", r.clone());
        }
        let resp = req.send().await.map_err(|e| e.to_string())?;
        let status = resp.status().as_u16();
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
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok::<_, String>((status, ctype, crange, bytes))
    });

    let (status, ctype, crange, bytes) = match fetched {
        Ok(v) => v,
        Err(e) => {
            return request
                .respond(
                    Response::from_string(format!("upstream failed: {e}"))
                        .with_status_code(StatusCode(502)),
                )
                .map_err(|e| e.to_string())
        }
    };

    let len = bytes.len();
    let mut headers = vec![
        header("Content-Type", &ctype),
        header("Accept-Ranges", "bytes"),
        header("Cache-Control", "no-store"),
        header("Access-Control-Allow-Origin", "*"),
        header(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges",
        ),
    ];
    if let Some(cr) = &crange {
        headers.push(header("Content-Range", cr));
    }

    let response = Response::new(
        StatusCode(status),
        headers,
        std::io::Cursor::new(bytes.to_vec()),
        Some(len),
        None,
    );
    request.respond(response).map_err(|e| e.to_string())
}

/// Serves a byte range of a local file. Seeking in a two-hour FLAC has to work
/// without loading the whole thing, so the range is parsed and only that slice
/// is read.
fn serve_local(id: &str, range: Option<&str>, request: tiny_http::Request) -> Result<(), String> {
    use std::io::{Read, Seek, SeekFrom};

    let Some(path) = crate::local::path_of(id) else {
        return request
            .respond(Response::from_string("unknown local track").with_status_code(StatusCode(404)))
            .map_err(|e| e.to_string());
    };

    let mut file = match std::fs::File::open(&path) {
        Ok(f) => f,
        Err(e) => {
            return request
                .respond(
                    Response::from_string(format!("cannot open file: {e}"))
                        .with_status_code(StatusCode(404)),
                )
                .map_err(|e| e.to_string())
        }
    };
    let total = file.metadata().map(|m| m.len()).unwrap_or(0);

    // "bytes=START-" or "bytes=START-END"
    let (start, end) = match range.and_then(|r| r.trim().strip_prefix("bytes=")).map(|spec| {
        let (a, b) = spec.split_once('-').unwrap_or((spec, ""));
        let start: u64 = a.trim().parse().unwrap_or(0);
        let end: u64 = b.trim().parse().unwrap_or(total.saturating_sub(1));
        (start.min(total), end.min(total.saturating_sub(1)))
    }) {
        Some(v) => v,
        None => (0, total.saturating_sub(1)),
    };

    let len = end.saturating_sub(start) + 1;
    let mut buf = vec![0u8; len as usize];
    if file.seek(SeekFrom::Start(start)).is_err() || file.read_exact(&mut buf).is_err() {
        return request
            .respond(Response::from_string("read failed").with_status_code(StatusCode(500)))
            .map_err(|e| e.to_string());
    }

    let partial = range.is_some();
    let mut headers = vec![
        header("Content-Type", crate::local::mime_of(&path)),
        header("Accept-Ranges", "bytes"),
        header("Access-Control-Allow-Origin", "*"),
        header(
            "Access-Control-Expose-Headers",
            "Content-Range, Content-Length, Accept-Ranges",
        ),
    ];
    if partial {
        headers.push(header(
            "Content-Range",
            &format!("bytes {start}-{end}/{total}"),
        ));
    }

    let blen = buf.len();
    request
        .respond(Response::new(
            StatusCode(if partial { 206 } else { 200 }),
            headers,
            std::io::Cursor::new(buf),
            Some(blen),
            None,
        ))
        .map_err(|e| e.to_string())
}

async fn resolve(service: &str, id: &str, hq: bool) -> Result<String, String> {
    // Only Yandex needs credentials; sc/ytm resolve anonymously.
    let token = crate::tokens::read_token(service)?.unwrap_or_default();
    match service {
        "ym" if token.is_empty() => Err("Yandex Music is not connected".into()),
        "ym" => crate::api::ym_stream_url(&token, id, hq).await,
        "sc" => crate::api::sc_stream_url(&token, id).await,
        "ytm" => crate::ytm::stream(id, hq).await.map(|p| p.url),
        other => Err(format!("unknown service: {other}")),
    }
}
