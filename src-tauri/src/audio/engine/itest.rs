//! The whole pipeline against ffmpeg, with a simulated device: a Range
//! server like the app's proxy → demux/decode → resample → chain → ring →
//! the real output callback, paced in real time. They need local files and
//! ffmpeg, so they are ignored by default:
//!
//! ```text
//! MW_ITEST_DIR=/tmp cargo test itest -- --ignored --nocapture --test-threads 1
//! ```
//! with `yt140.m4a` (YouTube's fragmented AAC), `t_end.m4a` (moov at the
//! end), `t.mp3`, `t48.flac`, `t.ogg` and `yt251.webm` in that folder.

use super::*;
use crate::audio::output::{fill, CbState, DevInfo};
use realfft::RealFftPlanner;
use rtrb::RingBuffer;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::atomic::AtomicBool;

fn dir() -> String {
    std::env::var("MW_ITEST_DIR").unwrap_or_else(|_| "/tmp".into())
}

/// A file over HTTP/1.1 with Range support (keep-alive, any number of
/// requests), optionally capping each answer like a CDN window.
fn serve(path: &str, ctype: &'static str, window: Option<usize>) -> String {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = l.local_addr().unwrap().port();
    let data = Arc::new(std::fs::read(path).unwrap());
    std::thread::spawn(move || {
        for s in l.incoming() {
            let Ok(mut s) = s else { continue };
            let data = data.clone();
            std::thread::spawn(move || {
                let mut r = BufReader::new(s.try_clone().unwrap());
                loop {
                    let mut line = String::new();
                    if r.read_line(&mut line).unwrap_or(0) == 0 {
                        return;
                    }
                    let mut range = None;
                    loop {
                        let mut h = String::new();
                        if r.read_line(&mut h).unwrap_or(0) == 0 {
                            return;
                        }
                        let h = h.trim_end().to_ascii_lowercase();
                        if h.is_empty() {
                            break;
                        }
                        if let Some(v) = h.strip_prefix("range: bytes=") {
                            let (a, b) = v.split_once('-').unwrap();
                            let a: usize = a.parse().unwrap();
                            let b = if b.is_empty() { data.len() - 1 } else { b.parse::<usize>().unwrap() };
                            range = Some((a, b.min(data.len() - 1)));
                        }
                    }
                    let (code, a, mut b) = match range {
                        Some((a, b)) => (206, a, b),
                        None => (200, 0, data.len() - 1),
                    };
                    if a >= data.len() {
                        let _ = s.write_all(format!("HTTP/1.1 416 X\r\nContent-Range: bytes */{}\r\nContent-Length: 0\r\n\r\n", data.len()).as_bytes());
                        continue;
                    }
                    if let (Some(w), 206) = (window, code) {
                        b = b.min(a + w - 1);
                    }
                    let cr = if code == 206 { format!("Content-Range: bytes {a}-{b}/{}\r\n", data.len()) } else { String::new() };
                    let head = format!(
                        "HTTP/1.1 {code} X\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nAccept-Ranges: bytes\r\n{cr}\r\n",
                        b + 1 - a
                    );
                    if s.write_all(head.as_bytes()).is_err() || s.write_all(&data[a..=b]).is_err() {
                        return;
                    }
                }
            });
        }
    });
    format!("http://127.0.0.1:{port}/a")
}

fn ffmpeg_ref(path: &str, sr: u32) -> Vec<f32> {
    let out = Command::new("ffmpeg")
        .args(["-v", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", &sr.to_string(), "-"])
        .output()
        .expect("ffmpeg");
    out.stdout.as_chunks::<4>().0.iter().map(|b| f32::from_le_bytes(*b)).collect()
}

fn mono(x: &[f32]) -> Vec<f32> {
    x.as_chunks::<2>().0.iter().map(|f| (f[0] + f[1]) * 0.5).collect()
}

/// The lag (frames) at which `x` best matches `y`: x[i] ≈ y[i + lag].
fn best_lag(x: &[f32], y: &[f32]) -> i64 {
    let n = (x.len() + y.len()).next_power_of_two();
    let mut p = RealFftPlanner::<f64>::new();
    let f = p.plan_fft_forward(n);
    let inv = p.plan_fft_inverse(n);
    let mut a: Vec<f64> = x.iter().map(|v| *v as f64).collect();
    a.resize(n, 0.0);
    let mut b: Vec<f64> = y.iter().map(|v| *v as f64).collect();
    b.resize(n, 0.0);
    let mut fa = f.make_output_vec();
    let mut fb = f.make_output_vec();
    f.process(&mut a, &mut fa).unwrap();
    f.process(&mut b, &mut fb).unwrap();
    let mut prod: Vec<_> = fa.iter().zip(&fb).map(|(p, q)| p.conj() * q).collect();
    let mut c = vec![0.0; n];
    inv.process(&mut prod, &mut c).unwrap();
    let (mut best, mut bv) = (0usize, f64::MIN);
    for (i, v) in c.iter().enumerate() {
        if *v > bv {
            bv = *v;
            best = i;
        }
    }
    if best > n / 2 {
        best as i64 - n as i64
    } else {
        best as i64
    }
}

/// SNR (dB) of stereo `x` against `y` from frame `at`.
fn snr(x: &[f32], y: &[f32], at: i64) -> f64 {
    let (mut e, mut p) = (0.0f64, 0.0f64);
    for (i, v) in x.iter().enumerate() {
        let j = at * 2 + i as i64;
        if j < 0 || j as usize >= y.len() {
            continue;
        }
        let r = y[j as usize] as f64;
        e += (*v as f64 - r).powi(2);
        p += r * r;
    }
    10.0 * (p / e.max(1e-30)).log10()
}

struct Rig {
    tx: Sender<Cmd>,
    hub: Arc<Hub>,
    out: Arc<Out>,
    got: Arc<Mutex<Vec<f32>>>,
    notes: Receiver<Note>,
    stop: Arc<AtomicBool>,
    sr: u32,
}

impl Drop for Rig {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}

fn rig(sr: u32) -> Rig {
    let out = Arc::new(Out::default());
    out.sr.store(sr, Ordering::Relaxed);
    let (tx, rx) = channel();
    let (ntx, nrx) = channel();
    let hub = new_hub(out.clone(), ntx);
    let r = Render::new(rx, tx.clone(), hub.clone());
    std::thread::spawn(move || r.run());
    let (prod, cons) = RingBuffer::<f32>::new(sr as usize);
    let cons = Arc::new(Mutex::new(cons));
    let info = DevInfo { sr, channels: 2, name: "test".into(), format: "f32".into() };
    tx.send(Cmd::Dev(DevMsg::Ready(info, prod, cons.clone()))).unwrap();
    tx.send(Cmd::Set(Box::new(Set { vol: Some(1.0), ..Default::default() }))).unwrap();
    let got = Arc::new(Mutex::new(Vec::new()));
    let stop = Arc::new(AtomicBool::new(false));
    {
        let (out, got, stop) = (out.clone(), got.clone(), stop.clone());
        std::thread::spawn(move || {
            let mut st = CbState::new();
            let n = sr as usize / 100;
            let mut buf = vec![0.0f32; n * 2];
            let t0 = Instant::now();
            let mut k = 0u32;
            while !stop.load(Ordering::Relaxed) {
                let z = cpal::StreamInstant::from_nanos(0);
                let info = cpal::OutputCallbackInfo::new(cpal::OutputStreamTimestamp { callback: z, playback: z });
                fill::<f32>(&mut buf, 2, sr, &out, &cons, &mut st, 0.0, &info);
                got.lock().unwrap().extend_from_slice(&buf);
                k += 1;
                if let Some(d) = (t0 + Duration::from_millis(10) * k).checked_duration_since(Instant::now()) {
                    std::thread::sleep(d);
                }
            }
        });
    }
    Rig { tx, hub, out, got, notes: nrx, stop, sr }
}

impl Rig {
    fn open(&self, url: &str, at: f64) {
        self.out.want.store(true, Ordering::Release);
        let pcm = spawn_decoder(self.hub.clone(), url.to_string(), None, 1, at);
        self.tx.send(Cmd::Open { gen: 1, pcm, at, play: true }).unwrap();
    }

    /// Notes until `pred` matches one (or the time runs out).
    fn wait_note(&self, secs: f64, pred: impl Fn(&Note) -> bool) -> Option<Note> {
        let t0 = Instant::now();
        while t0.elapsed().as_secs_f64() < secs {
            if let Ok(n) = self.notes.recv_timeout(Duration::from_millis(50)) {
                if let Note::Error { msg, kind, .. } = &n {
                    eprintln!("engine error: {kind} {msg}");
                }
                if pred(&n) {
                    return Some(n);
                }
            }
        }
        None
    }

    fn take(&self) -> Vec<f32> {
        std::mem::take(&mut *self.got.lock().unwrap())
    }

    /// Plays `secs`, then checks the last second against the reference: the
    /// audio must match and `position()` must name the second it is.
    /// Returns (position reported, media time of the capture's end per the audio, SNR).
    fn check_tail(&self, reference: &[f32], secs: f64, near: f64, what: &str) -> (f64, f64, f64) {
        std::thread::sleep(Duration::from_secs_f64(secs));
        let pos = self.hub.position();
        let got = self.take();
        let sr = self.sr as usize;
        assert!(got.len() >= sr * 2, "{what}: no audio captured");
        if let Ok(d) = std::env::var("MW_ITEST_DUMP") {
            let name = what.replace(' ', "_");
            let b: Vec<u8> = got.iter().flat_map(|v| v.to_le_bytes()).collect();
            let _ = std::fs::write(format!("{d}/{name}.raw"), b);
        }
        let tail = &got[got.len() - sr * 2..];
        // Search ±3 s around where the position says we are.
        let from = ((near - 3.0).max(0.0) * sr as f64) as usize;
        let to = (((near + 4.0) * sr as f64) as usize).min(reference.len() / 2);
        let lag = best_lag(&mono(tail), &mono(&reference[from * 2..to * 2])) + from as i64;
        let s = snr(tail, reference, lag);
        let end = (lag as f64 + sr as f64) / sr as f64;
        eprintln!("{what}: position {pos:.4} s, audio says {end:.4} s, SNR {s:.1} dB, underruns {}", self.out.underruns.load(Ordering::Relaxed));
        (pos, end, s)
    }
}

fn case(file: &str, ctype: &'static str, dev_sr: u32, min_snr: f64, window: Option<usize>) {
    let path = format!("{}/{file}", dir());
    if !std::path::Path::new(&path).exists() {
        eprintln!("skip: {path} is missing");
        return;
    }
    let reference = ffmpeg_ref(&path, dev_sr);
    let url = serve(&path, ctype, window);
    let r = rig(dev_sr);
    r.open(&url, 0.0);
    let meta = r.wait_note(10.0, |n| matches!(n, Note::Meta { .. }));
    assert!(meta.is_some(), "{file}: no meta");
    if let Some(Note::Meta { dur, sr, codec, .. }) = &meta {
        eprintln!("{file}: {codec} {sr} Hz, {dur:?} s → device {dev_sr} Hz");
    }
    assert!(r.wait_note(10.0, |n| matches!(n, Note::Playing { .. })).is_some(), "{file}: never played");
    // 1. From the start.
    let (pos, end, s) = r.check_tail(&reference, 4.0, 4.0, &format!("{file} start"));
    assert!(s > min_snr, "{file}: start SNR {s:.1}");
    assert!((pos - end).abs() < 0.08, "{file}: position {pos} vs audio {end}");
    // 2. A seek far ahead.
    r.tx.send(Cmd::Seek { gen: 1, t: 100.0 }).unwrap();
    assert!(r.wait_note(10.0, |n| matches!(n, Note::Seeked { .. })).is_some(), "{file}: seek not done");
    let _ = r.take();
    let (pos, end, s) = r.check_tail(&reference, 2.5, 102.5, &format!("{file} seek 100"));
    assert!(s > min_snr, "{file}: SNR after the seek {s:.1}");
    assert!((pos - end).abs() < 0.08, "{file}: after the seek, position {pos} vs audio {end}");
    // 3. Back, behind what was played.
    r.tx.send(Cmd::Seek { gen: 1, t: 20.25 }).unwrap();
    assert!(r.wait_note(10.0, |n| matches!(n, Note::Seeked { .. })).is_some());
    let _ = r.take();
    let (pos, end, s) = r.check_tail(&reference, 2.0, 22.25, &format!("{file} seek 20.25"));
    assert!(s > min_snr && (pos - end).abs() < 0.08, "{file}: back seek: SNR {s:.1}, position {pos} vs {end}");
    // 4. Pause: the position holds, and the audio resumes where it stopped.
    r.out.ramp_ms.store(12, Ordering::Relaxed);
    r.out.want.store(false, Ordering::Release);
    std::thread::sleep(Duration::from_millis(300));
    let p1 = r.hub.position();
    std::thread::sleep(Duration::from_millis(700));
    let p2 = r.hub.position();
    assert!((p2 - p1).abs() < 0.002, "{file}: paused position moved {p1} → {p2}");
    let _ = r.take();
    r.out.want.store(true, Ordering::Release);
    r.tx.send(Cmd::Play).unwrap();
    let (_, end, s) = r.check_tail(&reference, 1.5, p2 + 1.5, &format!("{file} resume"));
    assert!(s > min_snr && (end - (p2 + 1.5)).abs() < 0.1, "{file}: resume: SNR {s:.1}, {end} vs {}", p2 + 1.5);
}

#[test]
#[ignore]
fn itest_youtube_fragmented_aac() {
    case("yt140.m4a", "audio/mp4", 44100, 70.0, None);
}

#[test]
#[ignore]
fn itest_youtube_aac_in_64k_windows() {
    // The proxy's view of YouTube: every answer cut to 64 KB.
    case("yt140.m4a", "audio/mp4", 48000, 50.0, Some(65536));
}

#[test]
#[ignore]
fn itest_moov_at_the_end() {
    case("t_end.m4a", "audio/mp4", 44100, 70.0, None);
}

#[test]
#[ignore]
fn itest_mp3() {
    case("t.mp3", "audio/mpeg", 44100, 60.0, None);
}

#[test]
#[ignore]
fn itest_flac_48k_on_44k() {
    case("t48.flac", "audio/flac", 44100, 50.0, None);
}

#[test]
#[ignore]
fn itest_vorbis() {
    case("t.ogg", "audio/ogg", 48000, 50.0, None);
}

#[test]
#[ignore]
fn itest_opus_is_handed_back() {
    let path = format!("{}/yt251.webm", dir());
    if !std::path::Path::new(&path).exists() {
        return;
    }
    let url = serve(&path, "audio/webm", None);
    let r = rig(48000);
    r.open(&url, 0.0);
    let n = r.wait_note(10.0, |n| matches!(n, Note::Error { .. }));
    match n {
        Some(Note::Error { kind, .. }) => assert_eq!(kind, "unsupported"),
        _ => panic!("opus should be refused"),
    }
}

#[test]
#[ignore]
fn itest_speed_moves_the_clock() {
    let path = format!("{}/yt140.m4a", dir());
    if !std::path::Path::new(&path).exists() {
        return;
    }
    let url = serve(&path, "audio/mp4", None);
    let r = rig(48000);
    r.tx.send(Cmd::Rate(1.25)).unwrap();
    r.open(&url, 10.0);
    assert!(r.wait_note(10.0, |n| matches!(n, Note::Playing { .. })).is_some());
    std::thread::sleep(Duration::from_millis(500));
    let p1 = r.hub.position();
    std::thread::sleep(Duration::from_secs(2));
    let p2 = r.hub.position();
    eprintln!("1.25×: {p1:.3} → {p2:.3}");
    assert!(((p2 - p1) / 2.0 - 1.25).abs() < 0.03, "{p1} → {p2}");
}

/// Debug aid: the decoder alone, seeking to `MW_DUMP_AT`, its output to
/// `MW_DUMP_OUT` (f32le stereo, the first chunk's time printed).
#[test]
#[ignore]
fn itest_dump_decode() {
    let Ok(file) = std::env::var("MW_DUMP_FILE") else { return };
    let at: f64 = std::env::var("MW_DUMP_AT").ok().and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let url = serve(&file, "audio/mp4", None);
    let pcm = Arc::new(Pcm::default());
    let p2 = pcm.clone();
    std::thread::spawn(move || decode::run(HttpSource::open(&url), 0.0, p2, Box::new(|_| {})));
    // Let it start, then seek like the player does.
    std::thread::sleep(Duration::from_millis(500));
    pcm.seek(at);
    let mut outb: Vec<u8> = Vec::new();
    let mut first = None;
    let t0 = Instant::now();
    let mut frames = 0usize;
    while frames < 44100 * 5 && t0.elapsed() < Duration::from_secs(20) {
        let mut st = pcm.st.lock().unwrap();
        if let Some(c) = st.q.pop_front() {
            st.frames -= c.data.len() / 2;
            pcm.cv.notify_all();
            drop(st);
            if first.is_none() {
                first = Some(c.pos);
            }
            frames += c.data.len() / 2;
            for v in &c.data {
                outb.extend_from_slice(&v.to_le_bytes());
            }
        } else {
            drop(st);
            std::thread::sleep(Duration::from_millis(5));
        }
    }
    eprintln!("first chunk at {first:?}, {frames} frames");
    std::fs::write(std::env::var("MW_DUMP_OUT").unwrap(), outb).unwrap();
}

/// Debug aid: symphonia straight from a local file (no HTTP), seeking to
/// `MW_DUMP_AT`; same output as `itest_dump_decode`.
#[test]
#[ignore]
fn itest_dump_symphonia_file() {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo};
    use symphonia::core::io::{MediaSourceStream, MediaSourceStreamOptions};
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;
    use symphonia::core::units::Time;
    let Ok(file) = std::env::var("MW_DUMP_FILE") else { return };
    let at: f64 = std::env::var("MW_DUMP_AT").ok().and_then(|v| v.parse().ok()).unwrap_or(0.0);
    let gapless = std::env::var("MW_GAPLESS").is_ok();
    let len: f64 = std::env::var("MW_DUMP_LEN").ok().and_then(|v| v.parse().ok()).unwrap_or(5.0);
    let f = std::fs::File::open(&file).unwrap();
    let mss = MediaSourceStream::new(Box::new(f), MediaSourceStreamOptions::default());
    let fo = FormatOptions { enable_gapless: gapless, ..Default::default() };
    let mut r = symphonia::default::get_probe().format(&Hint::new(), mss, &fo, &MetadataOptions::default()).unwrap().format;
    let tr = r.default_track().unwrap().clone();
    let mut d = symphonia::default::get_codecs().make(&tr.codec_params, &DecoderOptions::default()).unwrap();
    let st = r.seek(SeekMode::Accurate, SeekTo::Time { time: Time::from(at), track_id: Some(tr.id) }).unwrap();
    eprintln!("seeked {st:?}");
    d.reset();
    let mut outb = Vec::new();
    let mut n = 0;
    let mut first = None;
    while (n as f64) < 44100.0 * len {
        let Ok(p) = r.next_packet() else { break };
        if first.is_none() {
            first = Some(p.ts());
        }
        let a = d.decode(&p).unwrap();
        let mut sb = SampleBuffer::<f32>::new(a.capacity() as u64, *a.spec());
        sb.copy_interleaved_ref(a);
        n += sb.samples().len() / 2;
        for v in sb.samples() {
            outb.extend_from_slice(&v.to_le_bytes());
        }
    }
    eprintln!("first packet ts {first:?}");
    std::fs::write(std::env::var("MW_DUMP_OUT").unwrap(), outb).unwrap();
}
