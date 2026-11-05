//! One track's decoder thread: bytes from the source, PCM into a queue the
//! render thread drains.
//!
//! The queue runs about twelve seconds ahead of playback, so the decoder
//! idles most of the time. A seek empties it and bumps its epoch: anything
//! decoded for the old position is dropped instead of reaching the speakers.

use super::mp4::{self, Frags};
use super::source::{HttpSource, Spliced, SrcErr};
use std::collections::VecDeque;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;
use symphonia::core::audio::{SampleBuffer, SignalSpec};
use symphonia::core::codecs::{Decoder, DecoderOptions, CODEC_TYPE_AAC, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymErr;
use symphonia::core::formats::{FormatOptions, FormatReader, SeekMode, SeekTo};
use symphonia::core::io::{MediaSource, MediaSourceStream, MediaSourceStreamOptions};
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use symphonia::core::units::{Time, TimeBase};

/// Seconds of PCM decoded ahead of the render thread.
const AHEAD: f64 = 12.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    /// A container or codec this engine does not decode (the web engine may).
    Unsupported,
    /// The stream could not be fetched, or stopped arriving.
    Network,
    /// The proxy's 409: the URL now serves a different file.
    Changed,
    /// The bytes arrived but do not decode.
    Decode,
}

impl Kind {
    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Unsupported => "unsupported",
            Kind::Network => "network",
            Kind::Changed => "changed",
            Kind::Decode => "decode",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Meta {
    pub sr: u32,
    pub dur: Option<f64>,
    pub codec: String,
    pub channels: usize,
}

pub struct Chunk {
    /// Media time of the first frame, seconds.
    pub pos: f64,
    pub sr: u32,
    /// Stereo, interleaved.
    pub data: Vec<f32>,
}

#[derive(Default)]
pub struct PcmState {
    pub q: VecDeque<Chunk>,
    pub frames: usize,
    pub epoch: u64,
    pub seek: Option<f64>,
    pub eof: bool,
    pub err: Option<(Kind, String)>,
    pub meta: Option<Meta>,
    pub stop: bool,
    /// Seconds downloaded ahead of the decoder, for the "buffered" bar.
    pub buffered_to: f64,
}

#[derive(Default)]
pub struct Pcm {
    pub st: Mutex<PcmState>,
    pub cv: Condvar,
}

impl Pcm {
    /// Asks for `t`: the queue empties now, the decoder catches up.
    pub fn seek(&self, t: f64) -> u64 {
        let mut st = self.st.lock().unwrap();
        st.epoch += 1;
        st.seek = Some(t.max(0.0));
        st.q.clear();
        st.frames = 0;
        st.eof = false;
        self.cv.notify_all();
        st.epoch
    }

    pub fn stop(&self) {
        let mut st = self.st.lock().unwrap();
        st.stop = true;
        st.q.clear();
        st.frames = 0;
        self.cv.notify_all();
    }
}

fn hint_for(ctype: &str, head: &[u8]) -> Hint {
    let mut h = Hint::new();
    let c = ctype.to_ascii_lowercase();
    let ext = if head.len() >= 8 && &head[4..8] == b"ftyp" {
        Some("m4a")
    } else if head.starts_with(b"fLaC") {
        Some("flac")
    } else if head.starts_with(b"OggS") {
        Some("ogg")
    } else if head.starts_with(b"RIFF") {
        Some("wav")
    } else if head.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        Some("webm")
    } else if head.starts_with(b"ID3") || (head.len() > 1 && head[0] == 0xFF && head[1] & 0xE0 == 0xE0 && head[1] & 0x06 != 0) {
        Some("mp3")
    } else if head.len() > 1 && head[0] == 0xFF && head[1] & 0xF6 == 0xF0 {
        Some("aac")
    } else if c.contains("mpeg") {
        Some("mp3")
    } else if c.contains("mp4") || c.contains("m4a") {
        Some("m4a")
    } else if c.contains("flac") {
        Some("flac")
    } else if c.contains("ogg") {
        Some("ogg")
    } else if c.contains("webm") {
        Some("webm")
    } else if c.contains("wav") {
        Some("wav")
    } else if c.contains("aac") {
        Some("aac")
    } else {
        None
    };
    if let Some(e) = ext {
        h.with_extension(e);
    }
    if !c.is_empty() {
        h.mime_type(&c);
    }
    h
}

fn src_kind(e: &SrcErr) -> Kind {
    match e {
        SrcErr::Changed => Kind::Changed,
        _ => Kind::Network,
    }
}

/// symphonia's error, sorted into what the player can act on.
fn sym_kind(e: &SymErr) -> (Kind, String) {
    match e {
        SymErr::IoError(io) => {
            let t = io.to_string();
            if io.kind() == std::io::ErrorKind::InvalidData && t.contains("source changed") {
                (Kind::Changed, t)
            } else if io.kind() == std::io::ErrorKind::UnexpectedEof {
                (Kind::Decode, "the file ended early".into())
            } else {
                (Kind::Network, t)
            }
        }
        SymErr::Unsupported(w) => (Kind::Unsupported, (*w).to_string()),
        SymErr::DecodeError(w) => (Kind::Decode, (*w).to_string()),
        SymErr::LimitError(w) => (Kind::Decode, (*w).to_string()),
        SymErr::SeekError(_) => (Kind::Decode, e.to_string()),
        SymErr::ResetRequired => (Kind::Decode, "reset required".into()),
    }
}

fn is_eof(e: &SymErr) -> bool {
    matches!(e, SymErr::IoError(io) if io.kind() == std::io::ErrorKind::UnexpectedEof)
}

fn is_closed(e: &SymErr) -> bool {
    matches!(e, SymErr::IoError(io) if io.kind() == std::io::ErrorKind::Interrupted)
}

/// HE-AAC (SBR/PS) decodes as its half-rate core here — muffled. Better to
/// say "unsupported" and let the web engine play it.
fn he_aac(params: &symphonia::core::codecs::CodecParameters) -> bool {
    if params.codec != CODEC_TYPE_AAC {
        return false;
    }
    if let Some(x) = params.extra_data.as_deref() {
        if !x.is_empty() {
            let aot = x[0] >> 3;
            if aot == 5 || aot == 29 {
                return true;
            }
        }
    }
    params.sample_rate.is_some_and(|r| r <= 24000)
}

fn codec_name(params: &symphonia::core::codecs::CodecParameters) -> String {
    symphonia::default::get_codecs()
        .get_codec(params.codec)
        .map(|d| d.short_name.to_string())
        .unwrap_or_else(|| format!("{:?}", params.codec))
}

struct Demux {
    src: HttpSource,
    frags: Option<Frags>,
    head: Option<Arc<Vec<u8>>>,
    hint_head: Vec<u8>,
    ctype: String,
    reader: Box<dyn FormatReader>,
    decoder: Box<dyn Decoder>,
    track: u32,
    tb: Option<TimeBase>,
    sr: u32,
    /// Added to packet times: a spliced fragment starts its clock at 0.
    offset: f64,
    mode: SeekMode,
    sbuf: Option<SampleBuffer<f32>>,
    channels: usize,
    bad: u32,
}

fn probe(src: Box<dyn MediaSource>, hint: &Hint) -> Result<Box<dyn FormatReader>, SymErr> {
    let mss = MediaSourceStream::new(src, MediaSourceStreamOptions::default());
    let fo = FormatOptions { enable_gapless: true, ..Default::default() };
    let pr = symphonia::default::get_probe().format(hint, mss, &fo, &MetadataOptions::default())?;
    Ok(pr.format)
}

impl Demux {
    fn open(src: HttpSource) -> Result<(Demux, Meta), (Kind, String)> {
        let mut s2 = src.reader(true);
        let head = s2.peek_at(0, 16).map_err(|e| (Kind::Network, e.to_string()))?;
        let ctype = src.content_type();
        let is_mp4 = head.len() >= 8 && &head[4..8] == b"ftyp";
        let mut frags = None;
        let mut as_stream = false;
        if is_mp4 {
            let layout = mp4::scan(&mut s2).map_err(|e| (Kind::Network, e.to_string()))?;
            as_stream = layout.moov_first;
            frags = layout.frags;
        }
        let hint = hint_for(&ctype, &head);
        let reader_src = src.reader(!as_stream);
        let flag = reader_src.seekable_flag();
        let reader = probe(Box::new(reader_src), &hint).map_err(|e| sym_kind(&e))?;
        // Fragmented files stay unseekable: seeks splice in at a fragment.
        if as_stream && frags.is_none() {
            flag.store(true, Ordering::Relaxed);
        }
        let track = reader
            .tracks()
            .iter()
            .find(|t| t.codec_params.codec != CODEC_TYPE_NULL && t.codec_params.sample_rate.is_some())
            .ok_or((Kind::Unsupported, "no audio track".to_string()))?
            .clone();
        let params = track.codec_params.clone();
        if he_aac(&params) {
            return Err((Kind::Unsupported, "HE-AAC".into()));
        }
        let decoder = symphonia::default::get_codecs()
            .make(&params, &DecoderOptions::default())
            .map_err(|e| sym_kind(&e))?;
        let sr = params.sample_rate.unwrap_or(44100);
        let dur = match (params.n_frames, &frags) {
            (Some(n), _) if n > 0 => Some(n as f64 / sr as f64),
            (_, Some(f)) => Some(f.dur),
            _ => None,
        };
        let head_bytes = match &frags {
            Some(f) => Some(Arc::new(s2.peek_at(0, f.head_len as usize).map_err(|e| (Kind::Network, e.to_string()))?)),
            None => None,
        };
        let mode = if hint_is(&hint, &head, "mp3") { SeekMode::Coarse } else { SeekMode::Accurate };
        let meta = Meta {
            sr,
            dur,
            codec: codec_name(&params),
            channels: params.channels.map(|c| c.count()).unwrap_or(2),
        };
        Ok((
            Demux {
                src,
                frags,
                head: head_bytes,
                hint_head: head,
                ctype,
                reader,
                decoder,
                track: track.id,
                tb: params.time_base,
                sr,
                offset: 0.0,
                mode,
                sbuf: None,
                channels: meta.channels,
                bad: 0,
            },
            meta,
        ))
    }

    /// Positions the reader so that the next packets cover `t`. Returns the
    /// time decoding will start from (frames before `t` are dropped later).
    fn seek(&mut self, t: f64) -> Result<(), (Kind, String)> {
        if let (Some(fr), Some(head)) = (&self.frags, &self.head) {
            let i = fr.at(t);
            let frag = fr.list[i].clone();
            let sp = Spliced::new(self.src.reader(false), head.clone(), frag.off);
            let hint = hint_for(&self.ctype, &self.hint_head);
            self.reader = probe(Box::new(sp), &hint).map_err(|e| sym_kind(&e))?;
            if let Some(tr) = self.reader.tracks().iter().find(|t| t.codec_params.codec != CODEC_TYPE_NULL) {
                self.track = tr.id;
            }
            self.offset = frag.t;
            self.decoder.reset();
            return Ok(());
        }
        let r = self.reader.seek(self.mode, SeekTo::Time { time: Time::from(t), track_id: Some(self.track) });
        self.decoder.reset();
        match r {
            Ok(_) => Ok(()),
            Err(SymErr::SeekError(_)) => {
                // Past the end, or a file that cannot seek: start over and
                // let the frame dropping walk forward.
                Err((Kind::Decode, "seek failed".into()))
            }
            Err(e) => Err(sym_kind(&e)),
        }
    }

    /// The next decoded packet as (time of first frame, stereo frames).
    /// `Ok(None)` at the end of the stream.
    fn next(&mut self) -> Result<Option<(f64, u32, Vec<f32>)>, SymErr> {
        loop {
            let packet = match self.reader.next_packet() {
                Ok(p) => p,
                Err(SymErr::ResetRequired) => {
                    self.decoder.reset();
                    continue;
                }
                Err(e) if is_eof(&e) => return Ok(None),
                Err(e) => return Err(e),
            };
            if packet.track_id() != self.track {
                continue;
            }
            let t = match self.tb {
                Some(tb) => {
                    let tm = tb.calc_time(packet.ts());
                    tm.seconds as f64 + tm.frac
                }
                None => packet.ts() as f64 / self.sr as f64,
            } + self.offset;
            let decoded = match self.decoder.decode(&packet) {
                Ok(d) => d,
                Err(SymErr::DecodeError(w)) => {
                    self.bad += 1;
                    if self.bad > 50 {
                        return Err(SymErr::DecodeError(w));
                    }
                    continue;
                }
                Err(SymErr::ResetRequired) => {
                    self.decoder.reset();
                    continue;
                }
                Err(e) => return Err(e),
            };
            self.bad = 0;
            let spec: SignalSpec = *decoded.spec();
            let frames = decoded.frames();
            if frames == 0 {
                continue;
            }
            let need = decoded.capacity() as u64;
            let ok = self.sbuf.as_ref().is_some_and(|b| b.capacity() as u64 >= need * spec.channels.count() as u64 && self.channels == spec.channels.count());
            if !ok {
                self.channels = spec.channels.count();
                self.sbuf = Some(SampleBuffer::new(need, spec));
            }
            let sb = self.sbuf.as_mut().unwrap();
            sb.copy_interleaved_ref(decoded);
            let out = to_stereo(sb.samples(), self.channels);
            return Ok(Some((t, spec.rate, out)));
        }
    }
}

fn hint_is(_h: &Hint, head: &[u8], what: &str) -> bool {
    match what {
        "mp3" => head.starts_with(b"ID3") || (head.len() > 1 && head[0] == 0xFF && head[1] & 0xE0 == 0xE0 && head[1] & 0x06 != 0),
        _ => false,
    }
}

/// Any channel layout down to stereo (Web Audio's speaker down-mix for 5.1).
pub fn to_stereo(x: &[f32], ch: usize) -> Vec<f32> {
    match ch {
        0 => Vec::new(),
        1 => x.iter().flat_map(|v| [*v, *v]).collect(),
        2 => x.to_vec(),
        6 => {
            const K: f32 = std::f32::consts::FRAC_1_SQRT_2;
            x.as_chunks::<6>()
                .0
                .iter()
                .flat_map(|f| [f[0] + K * (f[2] + f[4]), f[1] + K * (f[2] + f[5])])
                .collect()
        }
        n => x
            .chunks_exact(n)
            .flat_map(|f| {
                let (mut l, mut r, mut nl, mut nr) = (0.0, 0.0, 0.0, 0.0);
                for (i, v) in f.iter().enumerate() {
                    if i % 2 == 0 {
                        l += v;
                        nl += 1.0;
                    } else {
                        r += v;
                        nr += 1.0;
                    }
                }
                [l / f32::max(nl, 1.0), r / f32::max(nr, 1.0)]
            })
            .collect(),
    }
}

pub enum Ev {
    Meta(Meta),
    Error(Kind, String),
}

/// The decoder thread for one track, starting at `at` seconds.
/// Seconds decoded before a seek target and dropped: covers the overlap
/// AAC (2048), Vorbis (up to 8192 at 44.1 kHz… usually 2048) and MP3 need.
const PREROLL: f64 = 0.1;

pub fn run(src: Result<HttpSource, SrcErr>, at: f64, pcm: Arc<Pcm>, notify: Box<dyn Fn(Ev) + Send>) {
    let fail = |k: Kind, m: String| {
        let mut st = pcm.st.lock().unwrap();
        if !st.stop {
            st.err = Some((k, m.clone()));
            pcm.cv.notify_all();
            notify(Ev::Error(k, m));
        }
    };
    let src = match src {
        Ok(s) => s,
        Err(e) => return fail(src_kind(&e), e.text()),
    };
    let closer = src.clone();
    let (mut dm, meta) = match Demux::open(src) {
        Ok(v) => v,
        Err((k, m)) => {
            closer.close();
            return fail(k, m);
        }
    };
    {
        let mut st = pcm.st.lock().unwrap();
        if st.stop {
            closer.close();
            return;
        }
        st.meta = Some(meta.clone());
        if st.seek.is_none() && at > 0.05 {
            st.seek = Some(at);
        }
    }
    notify(Ev::Meta(meta.clone()));
    let mut epoch = pcm.st.lock().unwrap().epoch;
    let mut skip_until = 0.0f64;
    let mut eof = false;
    let mut est_dur = meta.dur;
    let mut decoded_secs = 0.0f64;
    'outer: loop {
        // Wait for room, a seek or the end.
        {
            let mut st = pcm.st.lock().unwrap();
            loop {
                if st.stop {
                    break 'outer;
                }
                if let Some(t) = st.seek.take() {
                    epoch = st.epoch;
                    drop(st);
                    skip_until = t;
                    eof = false;
                    // A little earlier, so the frames that come out wrong after
                    // a decoder reset (no overlap yet) are the dropped ones.
                    if let Err((k, m)) = dm.seek((t - PREROLL).max(0.0)) {
                        if k == Kind::Decode {
                            // Could not seek: the end it is.
                            let mut st = pcm.st.lock().unwrap();
                            if st.epoch == epoch {
                                st.eof = true;
                                pcm.cv.notify_all();
                            }
                            eof = true;
                            continue 'outer;
                        }
                        fail(k, m);
                        break 'outer;
                    }
                    continue 'outer;
                }
                let ahead = st.frames as f64 / meta.sr.max(1) as f64;
                if !eof && ahead < AHEAD {
                    break;
                }
                st = pcm.cv.wait_timeout(st, Duration::from_millis(250)).unwrap().0;
            }
        }
        match dm.next() {
            Ok(Some((t, sr, data))) => {
                let mut pos = t;
                let mut data = data;
                let frames = data.len() / 2;
                if pos + frames as f64 / sr as f64 <= skip_until - 0.5 / sr as f64 {
                    continue;
                }
                if pos < skip_until {
                    let k = (((skip_until - pos) * sr as f64).round() as usize).min(frames);
                    data.drain(..k * 2);
                    pos += k as f64 / sr as f64;
                }
                skip_until = 0.0;
                if data.is_empty() {
                    continue;
                }
                decoded_secs = decoded_secs.max(pos + (data.len() / 2) as f64 / sr as f64);
                let buffered = {
                    let len = dm.src.len();
                    let rp = dm.src.read_pos();
                    let ahead = dm.src.ahead_of(rp);
                    match (len, est_dur) {
                        (Some(n), Some(d)) if n > 0 => ((rp + ahead) as f64 / n as f64 * d).min(d),
                        _ => 0.0,
                    }
                };
                if est_dur.is_none() && decoded_secs > 8.0 {
                    if let (Some(n), rp) = (dm.src.len(), dm.src.read_pos()) {
                        if rp > 0 {
                            let d = n as f64 * decoded_secs / rp as f64;
                            est_dur = Some(d);
                            let mut m = meta.clone();
                            m.dur = Some(d);
                            pcm.st.lock().unwrap().meta = Some(m.clone());
                            notify(Ev::Meta(m));
                        }
                    }
                }
                let mut st = pcm.st.lock().unwrap();
                if st.stop {
                    break;
                }
                if st.epoch != epoch || st.seek.is_some() {
                    continue;
                }
                st.frames += data.len() / 2;
                st.buffered_to = buffered;
                st.q.push_back(Chunk { pos, sr, data });
                pcm.cv.notify_all();
            }
            Ok(None) => {
                let mut st = pcm.st.lock().unwrap();
                if st.epoch == epoch {
                    st.eof = true;
                    st.buffered_to = est_dur.unwrap_or(st.buffered_to);
                    pcm.cv.notify_all();
                }
                eof = true;
            }
            Err(e) if is_closed(&e) => break,
            Err(e) => {
                let (k, m) = sym_kind(&e);
                // A seek raced the error (the old download was dropped): retry.
                if pcm.st.lock().unwrap().seek.is_some() {
                    continue;
                }
                fail(k, m);
                break;
            }
        }
    }
    closer.close();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn downmixes_five_one_like_web_audio() {
        let x = [1.0, 0.0, 0.5, 9.0, 0.25, 0.0];
        let s = to_stereo(&x, 6);
        let k = std::f32::consts::FRAC_1_SQRT_2;
        assert!((s[0] - (1.0 + k * 0.75)).abs() < 1e-6);
        assert!((s[1] - k * 0.5).abs() < 1e-6);
        assert_eq!(to_stereo(&[0.5], 1), vec![0.5, 0.5]);
    }

    #[test]
    fn sniffs_containers() {
        let h = hint_for("", b"\0\0\0\x18ftypdash");
        let _ = h;
        assert!(hint_is(&Hint::new(), b"ID3\x04", "mp3"));
        assert!(!hint_is(&Hint::new(), b"fLaC", "mp3"));
    }
}
