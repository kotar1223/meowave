//! The bytes of one track, read from the app's own stream proxy.
//!
//! The proxy already does everything a service needs (resolving, googlevideo
//! windows, failover, HLS assembly, decryption), so the engine is simply one
//! more HTTP client of it — like the `<audio>` element was. What it adds is a
//! buffer that downloads the whole file ahead of the decoder: a connection
//! that hiccups for a few seconds no longer reaches the speakers.
//!
//! Storage is sparse, in pages: a seek past what has arrived restarts the
//! download there, the pages already in hand stay, and the gaps are filled
//! once the end is reached. Memory is capped; the pages farthest behind the
//! reader go first, so an hour-long lossless mix still fits.

use std::collections::HashMap;
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

const PAGE: u64 = 256 * 1024;
/// Bytes kept in memory per track.
const CAP: u64 = 160 * 1024 * 1024;
/// A read this far past where the download is restarts it at the read:
/// closer than that, waiting for the bytes to arrive is quicker.
const JUMP: u64 = 768 * 1024;
/// No byte for this long, with the decoder waiting: the stream is dead.
const STALL: Duration = Duration::from_secs(20);

#[derive(Debug, Clone, PartialEq)]
pub enum SrcErr {
    /// The proxy's 409: the file under this URL is not the one being read.
    Changed,
    /// The proxy (or the service behind it) refused, with its own words.
    Http(u16, String),
    /// No answer, or the connection kept dropping.
    Net(String),
}

impl SrcErr {
    pub fn text(&self) -> String {
        match self {
            SrcErr::Changed => "source changed".into(),
            SrcErr::Http(c, t) if t.is_empty() => format!("HTTP {c}"),
            SrcErr::Http(c, t) => format!("HTTP {c}: {t}"),
            SrcErr::Net(t) => t.clone(),
        }
    }
}

struct State {
    pages: HashMap<u64, Vec<u8>>,
    used: HashMap<u64, u64>,
    held: u64,
    total: Option<u64>,
    ctype: String,
    /// Where the reader is (eviction and how far ahead to download).
    read_pos: u64,
    /// The download's next byte, and whether a download is running.
    dl_pos: u64,
    dl_live: bool,
    restart: Option<u64>,
    err: Option<SrcErr>,
    /// Where the body ended when the length was never announced.
    eof_at: Option<u64>,
    stop: bool,
    tick: u64,
    /// The first answer arrived (length and type known).
    opened: bool,
}

struct Shared {
    st: Mutex<State>,
    cv: Condvar,
}

/// One reader over the shared buffer. Cheap to clone: each clone has its own
/// position, all of them share the bytes and the one download.
pub struct HttpSource {
    sh: Arc<Shared>,
    pos: u64,
    /// What `is_seekable` answers. MP4 is probed as a stream (see decode.rs)
    /// and switched to seekable once the demuxer is set up.
    seekable: Arc<AtomicBool>,
}

impl Clone for HttpSource {
    fn clone(&self) -> Self {
        Self { sh: self.sh.clone(), pos: self.pos, seekable: self.seekable.clone() }
    }
}

impl HttpSource {
    /// Starts downloading `url` and returns once the first answer is in (or
    /// the request failed): by then the length and content type are known.
    pub fn open(url: &str) -> Result<Self, SrcErr> {
        let sh = Arc::new(Shared {
            st: Mutex::new(State {
                pages: HashMap::new(),
                used: HashMap::new(),
                held: 0,
                total: None,
                ctype: String::new(),
                read_pos: 0,
                dl_pos: 0,
                dl_live: false,
                restart: None,
                err: None,
                eof_at: None,
                stop: false,
                tick: 0,
                opened: false,
            }),
            cv: Condvar::new(),
        });
        let (sh2, url2) = (sh.clone(), url.to_string());
        std::thread::Builder::new()
            .name("mw-audio-net".into())
            .spawn(move || download(url2, sh2))
            .map_err(|e| SrcErr::Net(e.to_string()))?;
        let t0 = Instant::now();
        let mut st = sh.st.lock().unwrap();
        while !st.opened && st.err.is_none() {
            if t0.elapsed() > Duration::from_secs(45) {
                st.stop = true;
                return Err(SrcErr::Net("the stream did not answer".into()));
            }
            st = sh.cv.wait_timeout(st, Duration::from_millis(200)).unwrap().0;
        }
        if let Some(e) = st.err.clone() {
            st.stop = true;
            sh.cv.notify_all();
            return Err(e);
        }
        drop(st);
        Ok(Self { sh, pos: 0, seekable: Arc::new(AtomicBool::new(true)) })
    }

    pub fn len(&self) -> Option<u64> {
        let st = self.sh.st.lock().unwrap();
        st.total.or(st.eof_at)
    }

    pub fn content_type(&self) -> String {
        self.sh.st.lock().unwrap().ctype.clone()
    }

    /// Another reader over the same bytes, at the start, with its own
    /// answer to `is_seekable`.
    pub fn reader(&self, seekable: bool) -> HttpSource {
        Self { sh: self.sh.clone(), pos: 0, seekable: Arc::new(AtomicBool::new(seekable)) }
    }

    /// Where the last read of any reader ended.
    pub fn read_pos(&self) -> u64 {
        self.sh.st.lock().unwrap().read_pos
    }

    pub fn seekable_flag(&self) -> Arc<AtomicBool> {
        self.seekable.clone()
    }

    /// Bytes downloaded ahead of `pos` without a gap, for the "buffered" bar.
    pub fn ahead_of(&self, pos: u64) -> u64 {
        let st = self.sh.st.lock().unwrap();
        let mut at = pos;
        loop {
            let pi = at / PAGE;
            match st.pages.get(&pi) {
                Some(p) if (at - pi * PAGE) < p.len() as u64 => {
                    at = pi * PAGE + p.len() as u64;
                    if (p.len() as u64) < PAGE {
                        break;
                    }
                }
                _ => break,
            }
        }
        at - pos
    }

    /// Stops the download; the bytes go with the last reader.
    pub fn close(&self) {
        let mut st = self.sh.st.lock().unwrap();
        st.stop = true;
        self.sh.cv.notify_all();
    }

    /// `n` bytes from `at`, without moving this reader.
    pub fn peek_at(&mut self, at: u64, n: usize) -> io::Result<Vec<u8>> {
        let keep = self.pos;
        self.pos = at;
        let mut out = vec![0u8; n];
        let mut got = 0;
        while got < n {
            let k = self.read(&mut out[got..])?;
            if k == 0 {
                break;
            }
            got += k;
        }
        out.truncate(got);
        self.pos = keep;
        Ok(out)
    }
}

impl Read for HttpSource {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if buf.is_empty() {
            return Ok(0);
        }
        let mut st = self.sh.st.lock().unwrap();
        st.read_pos = self.pos;
        let mut waited_since: Option<Instant> = None;
        loop {
            if let Some(end) = st.total.or(st.eof_at) {
                if self.pos >= end {
                    return Ok(0);
                }
            }
            let pi = self.pos / PAGE;
            let off = (self.pos - pi * PAGE) as usize;
            if let Some(p) = st.pages.get(&pi) {
                if p.len() > off {
                    let n = buf.len().min(p.len() - off);
                    buf[..n].copy_from_slice(&p[off..off + n]);
                    self.pos += n as u64;
                    st.tick += 1;
                    let t = st.tick;
                    st.used.insert(pi, t);
                    st.read_pos = self.pos;
                    // The downloader may be waiting for the reader to move on.
                    self.sh.cv.notify_all();
                    return Ok(n);
                }
            }
            if let Some(e) = &st.err {
                let kind = if *e == SrcErr::Changed { io::ErrorKind::InvalidData } else { io::ErrorKind::ConnectionAborted };
                return Err(io::Error::new(kind, e.text()));
            }
            if st.stop {
                return Err(io::Error::new(io::ErrorKind::Interrupted, "closed"));
            }
            // Not here yet: make sure the download is heading this way.
            let near = st.dl_live && st.dl_pos <= self.pos && self.pos < st.dl_pos + JUMP && st.restart.is_none();
            if !near {
                let want = pi * PAGE;
                if st.restart != Some(want) {
                    st.restart = Some(want);
                    self.sh.cv.notify_all();
                }
            }
            let since = *waited_since.get_or_insert_with(Instant::now);
            if since.elapsed() > STALL {
                return Err(io::Error::new(io::ErrorKind::TimedOut, "the stream stopped sending data"));
            }
            st = self.sh.cv.wait_timeout(st, Duration::from_millis(250)).unwrap().0;
        }
    }
}

impl Seek for HttpSource {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let len = self.len();
        let next = match to {
            SeekFrom::Start(p) => p as i128,
            SeekFrom::Current(d) => self.pos as i128 + d as i128,
            SeekFrom::End(d) => match len {
                Some(n) => n as i128 + d as i128,
                None => return Err(io::Error::new(io::ErrorKind::Unsupported, "length unknown")),
            },
        };
        if next < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        self.pos = next as u64;
        Ok(self.pos)
    }
}

impl symphonia::core::io::MediaSource for HttpSource {
    fn is_seekable(&self) -> bool {
        self.seekable.load(Ordering::Relaxed) && self.len().is_some()
    }
    fn byte_len(&self) -> Option<u64> {
        self.len()
    }
}

/// A fragmented MP4 entered at a fragment: the header (ftyp + moov) and then
/// the file from `from` on. The demuxer sees a complete file that starts at
/// that fragment, so a seek costs one request instead of reading every
/// fragment before it.
pub struct Spliced {
    inner: HttpSource,
    head: Arc<Vec<u8>>,
    from: u64,
    pos: u64,
}

impl Spliced {
    pub fn new(inner: HttpSource, head: Arc<Vec<u8>>, from: u64) -> Self {
        Self { inner, head, from, pos: 0 }
    }
    fn vlen(&self) -> Option<u64> {
        self.inner.len().map(|n| self.head.len() as u64 + n.saturating_sub(self.from))
    }
}

impl Read for Spliced {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let h = self.head.len() as u64;
        if self.pos < h {
            let n = buf.len().min((h - self.pos) as usize);
            buf[..n].copy_from_slice(&self.head[self.pos as usize..self.pos as usize + n]);
            self.pos += n as u64;
            return Ok(n);
        }
        self.inner.pos = self.from + (self.pos - h);
        let n = self.inner.read(buf)?;
        self.pos += n as u64;
        Ok(n)
    }
}

impl Seek for Spliced {
    fn seek(&mut self, to: SeekFrom) -> io::Result<u64> {
        let next = match to {
            SeekFrom::Start(p) => p as i128,
            SeekFrom::Current(d) => self.pos as i128 + d as i128,
            SeekFrom::End(d) => match self.vlen() {
                Some(n) => n as i128 + d as i128,
                None => return Err(io::Error::new(io::ErrorKind::Unsupported, "length unknown")),
            },
        };
        if next < 0 {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "seek before start"));
        }
        self.pos = next as u64;
        Ok(self.pos)
    }
}

impl symphonia::core::io::MediaSource for Spliced {
    fn is_seekable(&self) -> bool {
        // A spliced file is only ever read forwards: a seek splices anew.
        false
    }
    fn byte_len(&self) -> Option<u64> {
        self.vlen()
    }
}

/// `bytes a-b/total` → total.
fn range_total(v: &str) -> Option<u64> {
    v.rsplit('/').next()?.trim().parse().ok()
}

/// The next byte worth downloading from `at`: past every page already whole.
fn next_missing(st: &State, mut at: u64) -> u64 {
    loop {
        let pi = at / PAGE;
        match st.pages.get(&pi) {
            Some(p) if p.len() as u64 == PAGE => at = (pi + 1) * PAGE,
            Some(p) if at < pi * PAGE + p.len() as u64 => at = pi * PAGE + p.len() as u64,
            _ => return at,
        }
    }
}

/// The first gap in the file (pages never fetched or evicted), if any.
fn first_gap(st: &State) -> Option<u64> {
    let end = st.total?;
    let at = next_missing(st, 0);
    (at < end).then_some(at)
}

fn evict(st: &mut State) {
    while st.held > CAP {
        let rp = st.read_pos / PAGE;
        // Behind the reader first, oldest use first; then the farthest ahead.
        let victim = st
            .pages
            .keys()
            .copied()
            .filter(|k| *k + 2 < rp)
            .min_by_key(|k| st.used.get(k).copied().unwrap_or(0))
            .or_else(|| st.pages.keys().copied().filter(|k| *k > rp + 2).max());
        let Some(v) = victim else { break };
        if let Some(p) = st.pages.remove(&v) {
            st.held -= p.len() as u64;
        }
        st.used.remove(&v);
    }
}

/// Writes `data` at `at` into the pages. Returns the next byte and false
/// when the rest is better fetched by a new request: the download ran into a
/// page that is already whole, or `at` cannot be placed (inside a page whose
/// start was never fetched).
fn put(st: &mut State, mut at: u64, mut data: &[u8]) -> (u64, bool) {
    while !data.is_empty() {
        let pi = at / PAGE;
        let off = (at - pi * PAGE) as usize;
        let have = st.pages.get(&pi).map(|p| p.len()).unwrap_or(0);
        if have < off {
            if have == 0 {
                st.pages.remove(&pi);
            }
            return (pi * PAGE + have as u64, false);
        }
        let n = (PAGE as usize - off).min(data.len());
        if have >= off + n {
            // Already in hand.
            at += n as u64;
            data = &data[n..];
            if have == PAGE as usize {
                return (at, false);
            }
            continue;
        }
        let skip = have - off;
        let page = st.pages.entry(pi).or_insert_with(|| Vec::with_capacity(PAGE as usize));
        page.extend_from_slice(&data[skip..n]);
        st.held += (n - skip) as u64;
        at += n as u64;
        data = &data[n..];
    }
    (at, true)
}

fn download(url: String, sh: Arc<Shared>) {
    let rt = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(r) => r,
        Err(e) => {
            let mut st = sh.st.lock().unwrap();
            st.err = Some(SrcErr::Net(e.to_string()));
            sh.cv.notify_all();
            return;
        }
    };
    // Loopback only: never through the user's proxy settings.
    let client = match reqwest::Client::builder()
        .no_proxy()
        .connect_timeout(Duration::from_secs(5))
        .pool_max_idle_per_host(2)
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let mut st = sh.st.lock().unwrap();
            st.err = Some(SrcErr::Net(e.to_string()));
            sh.cv.notify_all();
            return;
        }
    };
    rt.block_on(async move {
        let mut at: u64 = 0;
        let mut fails = 0u32;
        'outer: loop {
            // Where to read next, or wait for a reason to.
            {
                let mut st = sh.st.lock().unwrap();
                loop {
                    if st.stop || st.err.is_some() {
                        st.dl_live = false;
                        return;
                    }
                    if let Some(r) = st.restart.take() {
                        at = r;
                    }
                    at = next_missing(&st, at);
                    let end = st.total.or(st.eof_at);
                    if end.is_some_and(|e| at >= e) {
                        // The end is in hand: fill what was skipped.
                        match first_gap(&st) {
                            Some(g) if st.held + PAGE <= CAP => {
                                at = g;
                            }
                            _ => {
                                st.dl_live = false;
                                st = sh.cv.wait_timeout(st, Duration::from_millis(500)).unwrap().0;
                                continue;
                            }
                        }
                    }
                    // Far enough ahead of the reader: memory is better spent later.
                    if at > st.read_pos + CAP / 2 {
                        st.dl_live = false;
                        st = sh.cv.wait_timeout(st, Duration::from_millis(300)).unwrap().0;
                        continue;
                    }
                    st.dl_pos = at;
                    st.dl_live = true;
                    break;
                }
            }
            let req = client.get(&url).header("Range", format!("bytes={at}-"));
            let resp = match tokio::time::timeout(Duration::from_secs(30), req.send()).await {
                Ok(Ok(r)) => r,
                Ok(Err(e)) => {
                    fails += 1;
                    if fails > 4 {
                        let mut st = sh.st.lock().unwrap();
                        st.err = Some(SrcErr::Net(format!("the stream proxy did not answer: {e}")));
                        sh.cv.notify_all();
                        return;
                    }
                    tokio::time::sleep(Duration::from_millis(300 * fails as u64)).await;
                    continue;
                }
                Err(_) => {
                    fails += 1;
                    if fails > 3 {
                        let mut st = sh.st.lock().unwrap();
                        st.err = Some(SrcErr::Net("the stream did not answer in 30 s".into()));
                        sh.cv.notify_all();
                        return;
                    }
                    continue;
                }
            };
            let code = resp.status().as_u16();
            if code == 409 {
                let mut st = sh.st.lock().unwrap();
                st.err = Some(SrcErr::Changed);
                sh.cv.notify_all();
                return;
            }
            if code == 416 {
                let mut st = sh.st.lock().unwrap();
                let total = resp.headers().get("content-range").and_then(|v| v.to_str().ok()).and_then(range_total);
                if st.total.is_none() {
                    st.total = total.or(Some(at));
                }
                st.opened = true;
                sh.cv.notify_all();
                continue;
            }
            if code >= 400 {
                let text: String = tokio::time::timeout(Duration::from_secs(5), resp.text())
                    .await
                    .ok()
                    .and_then(|r| r.ok())
                    .unwrap_or_default()
                    .chars()
                    .take(400)
                    .collect();
                // The proxy retries the service itself; a 5xx here is its verdict.
                let mut st = sh.st.lock().unwrap();
                st.err = Some(SrcErr::Http(code, text.trim().to_string()));
                sh.cv.notify_all();
                return;
            }
            // A 200 to a ranged request starts at byte 0.
            let mut skip = if code == 200 { at } else { 0 };
            {
                let mut st = sh.st.lock().unwrap();
                let ct = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
                if !ct.is_empty() {
                    st.ctype = ct;
                }
                let total = if code == 206 {
                    resp.headers().get("content-range").and_then(|v| v.to_str().ok()).and_then(range_total)
                } else {
                    resp.content_length()
                };
                if total.is_some() {
                    st.total = total;
                }
                st.opened = true;
                sh.cv.notify_all();
            }
            let mut resp = resp;
            let mut quiet = Instant::now();
            loop {
                match tokio::time::timeout(Duration::from_millis(250), resp.chunk()).await {
                    Ok(Ok(Some(bytes))) => {
                        fails = 0;
                        quiet = Instant::now();
                        let mut data: &[u8] = &bytes;
                        if skip > 0 {
                            let k = (skip as usize).min(data.len());
                            data = &data[k..];
                            skip -= k as u64;
                            if data.is_empty() {
                                continue;
                            }
                        }
                        let mut st = sh.st.lock().unwrap();
                        let (next, fresh) = put(&mut st, at, data);
                        at = next;
                        st.dl_pos = at;
                        evict(&mut st);
                        sh.cv.notify_all();
                        if st.stop {
                            return;
                        }
                        // Asked elsewhere, or ran into bytes already here.
                        if st.restart.is_some() || !fresh {
                            continue 'outer;
                        }
                        if at > st.read_pos + CAP / 2 {
                            continue 'outer;
                        }
                    }
                    Ok(Ok(None)) => {
                        let total = sh.st.lock().unwrap().total;
                        match total {
                            Some(t) if at < t => {
                                // Ended early: pick it up again from here.
                                fails += 1;
                                if fails > 6 {
                                    let mut st = sh.st.lock().unwrap();
                                    st.err = Some(SrcErr::Net(format!("the stream kept breaking off at {at} bytes")));
                                    sh.cv.notify_all();
                                    return;
                                }
                                tokio::time::sleep(Duration::from_millis(200 * fails as u64)).await;
                            }
                            Some(_) => {}
                            None => {
                                sh.st.lock().unwrap().eof_at = Some(at);
                                sh.cv.notify_all();
                            }
                        }
                        continue 'outer;
                    }
                    Ok(Err(_)) => {
                        fails += 1;
                        if fails > 6 {
                            let mut st = sh.st.lock().unwrap();
                            st.err = Some(SrcErr::Net("the connection to the stream kept dropping".into()));
                            sh.cv.notify_all();
                            return;
                        }
                        tokio::time::sleep(Duration::from_millis(200 * fails as u64)).await;
                        continue 'outer;
                    }
                    Err(_) => {
                        let st = sh.st.lock().unwrap();
                        if st.stop {
                            return;
                        }
                        if st.restart.is_some() {
                            continue 'outer;
                        }
                        drop(st);
                        if quiet.elapsed() > STALL {
                            // Silent connection: a fresh request, the proxy
                            // re-resolves if the service URL died.
                            fails += 1;
                            if fails > 3 {
                                let mut st = sh.st.lock().unwrap();
                                st.err = Some(SrcErr::Net("the stream stopped sending data".into()));
                                sh.cv.notify_all();
                                return;
                            }
                            continue 'outer;
                        }
                    }
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn st() -> State {
        State {
            pages: HashMap::new(),
            used: HashMap::new(),
            held: 0,
            total: Some(PAGE * 3 + 10),
            ctype: String::new(),
            read_pos: 0,
            dl_pos: 0,
            dl_live: false,
            restart: None,
            err: None,
            eof_at: None,
            stop: false,
            tick: 0,
            opened: true,
        }
    }

    #[test]
    fn pages_fill_and_gaps_are_found() {
        let mut s = st();
        let data = vec![7u8; (PAGE + 100) as usize];
        let (at, fresh) = put(&mut s, 0, &data);
        assert!(fresh);
        assert_eq!(at, PAGE + 100);
        assert_eq!(next_missing(&s, 0), PAGE + 100);
        // A later region, then the gap between is the first one found.
        let (_, _) = put(&mut s, PAGE * 3, &[1u8; 10]);
        assert_eq!(first_gap(&s), Some(PAGE + 100));
        // Re-sending bytes already in hand is skipped, not duplicated.
        let held = s.held;
        let (_, fresh) = put(&mut s, 0, &data[..PAGE as usize]);
        assert!(!fresh || s.held == held);
        assert_eq!(s.held, held);
    }

    #[test]
    fn content_range_total() {
        assert_eq!(range_total("bytes 0-99/12345"), Some(12345));
        assert_eq!(range_total("bytes */500"), Some(500));
        assert_eq!(range_total("bytes 0-99/*"), None);
    }
}
