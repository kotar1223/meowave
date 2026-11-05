//! Network probe for the stream proxy (developer tool, never run in CI).
//!
//! `MW_PROBE="sc:Linkin Park Numb;ytm:Daft Punk One More Time" cargo test --lib stream_probe -- --ignored --nocapture`
//!
//! Each entry is `<service>:<search query>` or `<service>#<id>`. The probe
//! starts the real proxy, finds the track, then reads it the way a media
//! element does — an open `bytes=0-` request for the start, a seek to the
//! middle, then the rest — and writes the bytes to `MW_PROBE_DIR`
//! (default `/tmp/mwprobe`). `ffmpeg -v error -i <file> -f null -` on the
//! result shows whether the joined file decodes cleanly end to end.

use std::io::Read;

type Resp = (u16, Vec<(String, String)>, Box<dyn Read + Send>);

fn get(port: u16, path: &str, range: Option<&str>) -> Result<Resp, String> {
    ureq_like(port, path, range)
}

/// A tiny HTTP/1.1 GET over a raw socket (no extra dev dependency); handles
/// chunked and Content-Length bodies.
fn ureq_like(port: u16, path: &str, range: Option<&str>) -> Result<Resp, String> {
    use std::io::{BufRead, BufReader, Write};
    let mut s = std::net::TcpStream::connect(("127.0.0.1", port)).map_err(|e| e.to_string())?;
    s.set_read_timeout(Some(std::time::Duration::from_secs(90))).ok();
    let mut head = format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n");
    if let Some(r) = range {
        head.push_str(&format!("Range: {r}\r\n"));
    }
    head.push_str("\r\n");
    s.write_all(head.as_bytes()).map_err(|e| e.to_string())?;
    let mut rd = BufReader::new(s);
    let mut line = String::new();
    rd.read_line(&mut line).map_err(|e| e.to_string())?;
    let status: u16 = line.split_whitespace().nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
    let mut headers = Vec::new();
    loop {
        line.clear();
        rd.read_line(&mut line).map_err(|e| e.to_string())?;
        let l = line.trim_end();
        if l.is_empty() {
            break;
        }
        if let Some((k, v)) = l.split_once(':') {
            headers.push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
        }
    }
    let chunked = headers.iter().any(|(k, v)| k == "transfer-encoding" && v.contains("chunked"));
    let body: Box<dyn Read + Send> = if chunked { Box::new(Chunked { r: rd, left: 0, done: false }) } else { Box::new(rd) };
    Ok((status, headers, body))
}

struct Chunked<R: std::io::BufRead> {
    r: R,
    left: usize,
    done: bool,
}
impl<R: std::io::BufRead> Read for Chunked<R> {
    fn read(&mut self, out: &mut [u8]) -> std::io::Result<usize> {
        if self.done {
            return Ok(0);
        }
        if self.left == 0 {
            let mut l = String::new();
            self.r.read_line(&mut l)?;
            if l.trim().is_empty() {
                l.clear();
                self.r.read_line(&mut l)?;
            }
            let n = usize::from_str_radix(l.trim().split(';').next().unwrap_or("0"), 16).unwrap_or(0);
            if n == 0 {
                self.done = true;
                return Ok(0);
            }
            self.left = n;
        }
        let k = out.len().min(self.left);
        let got = self.r.read(&mut out[..k])?;
        self.left -= got;
        if got == 0 {
            self.done = true;
        }
        Ok(got)
    }
}

fn hdr<'a>(h: &'a [(String, String)], k: &str) -> Option<&'a str> {
    h.iter().find(|(a, _)| a == k).map(|(_, v)| v.as_str())
}

#[test]
#[ignore]
fn stream_probe() {
    let spec = std::env::var("MW_PROBE").unwrap_or_default();
    let dir = std::env::var("MW_PROBE_DIR").unwrap_or_else(|_| "/tmp/mwprobe".into());
    let fmt = std::env::var("MW_PROBE_FMT").unwrap_or_else(|_| "webm".into());
    std::fs::create_dir_all(&dir).ok();
    let port = crate::stream::spawn().expect("proxy");
    let k = crate::stream::token();
    let rt = tokio::runtime::Runtime::new().unwrap();
    for item in spec.split(';').map(str::trim).filter(|s| !s.is_empty()) {
        let (svc, id, want_d, label) = if let Some((svc, id)) = item.split_once('#') {
            (svc.to_string(), id.to_string(), 0u32, id.to_string())
        } else {
            let (svc, q) = item.split_once(':').expect("svc:query");
            let found = rt.block_on(async {
                match svc {
                    "sc" => crate::api::sc_search("", q).await,
                    "ytm" => crate::ytm::search(q).await,
                    "dz" => crate::dz::search(q).await,
                    _ => Err("svc".into()),
                }
            });
            let Ok(list) = found else {
                println!("PROBE {item}: search failed {:?}", found.err());
                continue;
            };
            let Some(t) = list.into_iter().next() else {
                println!("PROBE {item}: nothing found");
                continue;
            };
            (svc.to_string(), t.id.clone(), t.d, format!("{} - {}", t.a, t.t))
        };
        let path = format!(
            "/stream/{svc}/{}?k={k}&hq=1&fmt={fmt}",
            urlencoding::encode(&id)
        );
        let t0 = std::time::Instant::now();
        // 1. open request, read the first 256 KB (what <audio> does before it seeks)
        let (st, h, mut body) = match get(port, &path, Some("bytes=0-")) {
            Ok(x) => x,
            Err(e) => {
                println!("PROBE {svc}/{id} [{label}]: connect {e}");
                continue;
            }
        };
        let ctype = hdr(&h, "content-type").unwrap_or("").to_string();
        let crange = hdr(&h, "content-range").unwrap_or("").to_string();
        let total: Option<u64> = crange.rsplit_once('/').and_then(|(_, n)| n.parse().ok()).or_else(|| hdr(&h, "content-length").and_then(|v| v.parse().ok()));
        let mut head = vec![0u8; 256 * 1024];
        let mut got = 0usize;
        while got < head.len() {
            match body.read(&mut head[got..]) {
                Ok(0) => break,
                Ok(n) => got += n,
                Err(_) => break,
            }
        }
        head.truncate(got);
        drop(body);
        println!(
            "PROBE {svc}/{id} [{label}] d={want_d}s status={st} type={ctype} range={crange} total={total:?} first={}KB in {}ms",
            got / 1024,
            t0.elapsed().as_millis()
        );
        if st >= 400 || got == 0 {
            let mut msg = String::new();
            let _ = std::io::Cursor::new(head).read_to_string(&mut msg);
            println!("   error body: {}", msg.chars().take(300).collect::<String>());
            continue;
        }
        let Some(total) = total else {
            println!("   no total size: reading on");
            continue;
        };
        // 2. the whole file in one ranged read from where the head stopped
        let t1 = std::time::Instant::now();
        let mut all = head.clone();
        let mut from = all.len() as u64;
        let mut rounds = 0;
        while from < total && rounds < 6 {
            rounds += 1;
            let r = format!("bytes={from}-");
            let Ok((st2, h2, mut b2)) = get(port, &path, Some(&r)) else { break };
            let mut chunk = Vec::new();
            let _ = b2.read_to_end(&mut chunk);
            println!(
                "   range {r}: status={st2} range={} got={}KB",
                hdr(&h2, "content-range").unwrap_or("-"),
                chunk.len() / 1024
            );
            if chunk.is_empty() {
                break;
            }
            all.extend_from_slice(&chunk);
            from = all.len() as u64;
        }
        println!(
            "   whole: {} of {total} bytes{} in {}ms",
            all.len(),
            if (all.len() as u64) == total { " (complete)" } else { " (SHORT)" },
            t1.elapsed().as_millis()
        );
        // 3. a seek to 60 % must return exactly the same bytes
        let mid = total * 6 / 10;
        if let Ok((st3, _, mut b3)) = get(port, &path, Some(&format!("bytes={mid}-{}", mid + 65535))) {
            let mut s = Vec::new();
            let _ = b3.read_to_end(&mut s);
            let same = all.get(mid as usize..mid as usize + s.len()).is_some_and(|x| x == s.as_slice());
            println!("   seek 60%: status={st3} got={}B identical={same}", s.len());
        }
        let ext = if ctype.contains("webm") { "webm" } else if ctype.contains("mp4") { "m4a" } else if ctype.contains("ogg") { "ogg" } else { "mp3" };
        let file = format!("{dir}/{svc}_{}.{ext}", id.replace(['/', ':'], "_"));
        std::fs::write(&file, &all).ok();
        println!("   saved {file}");
    }
}
