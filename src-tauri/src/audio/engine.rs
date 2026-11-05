//! The engine: a render thread, a status thread, the device thread and one
//! decoder thread per track.
//!
//! The render thread is the only one that touches the signal: it pulls PCM
//! from the current track, resamples it to the device rate (and the playback
//! speed), runs the chain and keeps the device ring about 60 ms full. Every
//! block it renders leaves a marker — which ring frame carries which media
//! second — so the status thread can say exactly what is sounding now,
//! however the speed changed or whatever the ring still holds.

use super::conv;
use super::decode::{self, Ev, Pcm};
use super::dsp::{self, Chain, Set, Spectrum};
use super::output::{self, DevMsg, Out};
use super::resample::Resampler;
use super::source::HttpSource;
use base64::Engine as _;
use rtrb::{Consumer, Producer};
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::ipc::Channel;

const BLOCK: usize = conv::BLOCK;
/// Frames of the old audio kept, faded out, when a seek cuts in.
const BRIDGE: usize = 256;
/// Fade-in after a cut or a stall, frames.
const DECLICK: usize = 240;

#[derive(Clone, Copy, Debug)]
pub struct Marker {
    pub frame: u64,
    pub pos: f64,
    /// Media seconds per ring frame.
    pub step: f64,
}

pub enum Cmd {
    Open { gen: u64, pcm: Arc<Pcm>, at: f64, play: bool },
    /// Play / pause with the ramp length in ms. The `want` flag the device
    /// callback reads is only ever set here, on the render thread, in command
    /// order: set from the IPC thread, a "play" could land before the "open
    /// paused" queued ahead of it and be undone by it.
    Play(u32),
    Pause(u32),
    Seek { gen: u64, t: f64 },
    Stop,
    Set(Box<Set>),
    Rate(f64),
    Room(Box<conv::Stereo>, (f64, f64), u32),
    Dev(DevMsg),
}

pub enum Note {
    Meta { gen: u64, dur: Option<f64>, sr: u32, codec: String },
    Error { gen: u64, kind: &'static str, msg: String },
    Playing { gen: u64 },
    Waiting { gen: u64 },
    Seeked { gen: u64, t: f64 },
    Dev { name: String, sr: u32, ch: u16, fmt: String },
    DevLost { msg: String },
}

#[derive(Default)]
pub struct Cur {
    pub gen: u64,
    pub dur: Option<f64>,
    pub end_frame: Option<u64>,
    pub ended_sent: bool,
    pub waiting: bool,
    pub pcm: Option<Arc<Pcm>>,
    /// Reported while no marker applies (opening, right after a seek).
    pub hold: f64,
    pub codec: String,
    pub sr: u32,
}

pub struct Hub {
    pub out: Arc<Out>,
    pub markers: Mutex<VecDeque<Marker>>,
    pub cur: Mutex<Cur>,
    pub chan: Mutex<Option<Channel<Value>>>,
    pub level_ms: AtomicU64,
    pub lim_db: AtomicU64,
    pub viz: AtomicBool,
    pub dev: Mutex<Option<(String, u32, u16, String)>>,
    pub dev_seen: AtomicBool,
    note: Mutex<Sender<Note>>,
    /// The newest play / pause / open the page has sent (see `Engine::fresh`).
    op: AtomicU64,
    /// Whether the page's latest word was "play".
    req_play: AtomicBool,
}

impl Hub {
    pub fn note(&self, n: Note) {
        let _ = self.note.lock().unwrap().send(n);
    }

    /// The media second sounding now.
    pub fn position(&self) -> f64 {
        let heard = self.out.heard();
        let m = self.markers.lock().unwrap();
        let mut best: Option<Marker> = None;
        for mk in m.iter() {
            if mk.frame <= heard {
                best = Some(*mk);
            } else {
                break;
            }
        }
        match best.or_else(|| m.front().copied()) {
            Some(mk) if mk.frame <= heard => mk.pos + (heard - mk.frame) as f64 * mk.step,
            Some(mk) => mk.pos,
            None => self.cur.lock().unwrap().hold,
        }
    }
}

struct Dev {
    prod: Producer<f32>,
    cons: Arc<Mutex<Consumer<f32>>>,
    sr: u32,
}

struct Tr {
    gen: u64,
    pcm: Arc<Pcm>,
    rs: Resampler,
    src_sr: u32,
    /// Media time of resampler input frame 0.
    t0: f64,
    /// Input frames pushed since the last reset.
    fed: u64,
    started: bool,
    eof: bool,
    done: bool,
    failed: bool,
    waiting: bool,
    seek_note: Option<f64>,
    play_note: bool,
    /// Blocks of reverb/3D tail still to render after the end.
    tail: usize,
}

struct Render {
    rx: Receiver<Cmd>,
    tx: Sender<Cmd>,
    hub: Arc<Hub>,
    out: Arc<Out>,
    dev: Option<Dev>,
    chain: Option<Chain>,
    params: Set,
    rate: f64,
    tr: Option<Tr>,
    pushed: u64,
    buf: Vec<f32>,
    rsout: Vec<f32>,
    declick: usize,
    room_flight: Option<(f64, f64)>,
    resume_at: Option<f64>,
}

fn merge(a: &mut Set, b: &Set) {
    macro_rules! m {
        ($($f:ident),*) => { $( if b.$f.is_some() { a.$f = b.$f.clone(); } )* };
    }
    m!(pre, eq, vol, norm, boost, lim, sp, rv);
    if let Some((v, _)) = b.fade {
        a.fade = Some((v, 0.0));
    }
}

impl Render {
    fn fill_target(&self, sr: u32) -> usize {
        let cb = self.out.cb_frames.load(Ordering::Relaxed) as usize;
        let base = (sr as f64 * 0.06) as usize;
        base.max(cb * 3).min((sr as f64 * 0.25) as usize)
    }

    fn ring_fill(&self) -> usize {
        (self.pushed.saturating_sub(self.out.played.load(Ordering::Acquire))) as usize
    }

    fn active(&self) -> bool {
        let (Some(dev), Some(tr)) = (self.dev.as_ref(), self.tr.as_ref()) else { return false };
        if tr.failed || (tr.done && tr.tail == 0) {
            return false;
        }
        let want = self.out.want.load(Ordering::Relaxed);
        want || self.ring_fill() < self.fill_target(dev.sr)
    }

    /// Empties the ring. With `bridge`, the next few milliseconds of the old
    /// audio stay, faded out, so the cut does not click.
    fn flush(&mut self, bridge: bool) {
        let Some(dev) = self.dev.as_mut() else { return };
        let mut keep: Vec<f32> = Vec::new();
        {
            let mut cons = dev.cons.lock().unwrap();
            let n = cons.slots() / 2;
            if n > 0 {
                let k = if bridge && !self.out.idle.load(Ordering::Relaxed) { n.min(BRIDGE) } else { 0 };
                if let Ok(ch) = cons.read_chunk(n * 2) {
                    let (a, b) = ch.as_slices();
                    for i in 0..k * 2 {
                        keep.push(if i < a.len() { a[i] } else { b[i - a.len()] });
                    }
                    ch.commit_all();
                }
                self.out.played.fetch_add(n as u64, Ordering::AcqRel);
            }
            self.pushed = self.out.played.load(Ordering::Acquire);
        }
        let k = keep.len() / 2;
        for i in 0..k {
            let g = 1.0 - (i + 1) as f32 / k as f32;
            keep[i * 2] *= g;
            keep[i * 2 + 1] *= g;
        }
        if k > 0 {
            if let Ok(w) = dev.prod.write_chunk_uninit(k * 2) {
                let n = w.fill_from_iter(keep.iter().copied());
                self.pushed += (n / 2) as u64;
            }
        }
        if let Some(c) = self.chain.as_mut() {
            c.flush();
        }
        self.declick = DECLICK;
    }

    fn reset_markers(&mut self, pos: f64) {
        let mut m = self.hub.markers.lock().unwrap();
        m.clear();
        m.push_back(Marker { frame: self.pushed, pos, step: 0.0 });
        drop(m);
        let mut c = self.hub.cur.lock().unwrap();
        c.hold = pos;
        c.end_frame = None;
        c.ended_sent = false;
    }

    fn seek_to(&mut self, t: f64, note: bool) {
        let want = self.out.want.load(Ordering::Relaxed);
        if let Some(tr) = self.tr.as_mut() {
            tr.pcm.seek(t);
            tr.started = false;
            tr.eof = false;
            tr.done = false;
            tr.failed = false;
            tr.fed = 0;
            tr.t0 = t;
            tr.seek_note = note.then_some(t);
            tr.play_note = want;
        }
        self.flush(want);
        self.reset_markers(t);
    }

    fn handle(&mut self, cmd: Cmd) {
        match cmd {
            Cmd::Open { gen, pcm, at, play } => {
                if let Some(old) = self.tr.take() {
                    old.pcm.stop();
                }
                let audible = self.out.want.load(Ordering::Relaxed);
                self.flush(audible);
                self.out.ramp_ms.store(12, Ordering::Relaxed);
                self.out.want.store(play, Ordering::Release);
                {
                    let mut c = self.hub.cur.lock().unwrap();
                    *c = Cur { gen, pcm: Some(pcm.clone()), hold: at, ..Default::default() };
                }
                self.tr = Some(Tr {
                    gen,
                    pcm,
                    rs: Resampler::new(),
                    src_sr: 44100,
                    t0: at,
                    fed: 0,
                    started: false,
                    eof: false,
                    done: false,
                    failed: false,
                    waiting: false,
                    seek_note: None,
                    play_note: play,
                    tail: 0,
                });
                self.reset_markers(at);
                self.resume_at = None;
            }
            Cmd::Play(ramp) => {
                self.out.ramp_ms.store(ramp, Ordering::Relaxed);
                self.out.want.store(true, Ordering::Release);
                if let Some(tr) = self.tr.as_mut() {
                    if !tr.waiting && tr.started {
                        self.hub.note(Note::Playing { gen: tr.gen });
                    } else {
                        tr.play_note = true;
                    }
                }
            }
            Cmd::Pause(ramp) => {
                self.out.ramp_ms.store(ramp, Ordering::Relaxed);
                self.out.want.store(false, Ordering::Release);
            }
            Cmd::Seek { gen, t } => {
                if self.tr.as_ref().is_some_and(|tr| tr.gen == gen) {
                    self.seek_to(t, true);
                }
            }
            Cmd::Stop => {
                if let Some(old) = self.tr.take() {
                    old.pcm.stop();
                }
                self.out.want.store(false, Ordering::Release);
                self.flush(false);
                self.reset_markers(0.0);
            }
            Cmd::Set(s) => {
                merge(&mut self.params, &s);
                if let Some(c) = self.chain.as_mut() {
                    c.apply(&s);
                }
                self.want_room();
            }
            Cmd::Rate(r) => self.rate = r.clamp(0.25, 4.0),
            Cmd::Room(cv, sig, sr) => {
                self.room_flight = None;
                if let Some(c) = self.chain.as_mut() {
                    if c.sr as u32 == sr {
                        c.room(*cv, sig);
                    }
                }
                self.want_room();
            }
            Cmd::Dev(DevMsg::Ready(info, prod, cons)) => {
                let sr = info.sr;
                *self.hub.dev.lock().unwrap() = Some((info.name.clone(), info.sr, info.channels, info.format.clone()));
                self.hub.dev_seen.store(true, Ordering::Release);
                self.hub.note(Note::Dev { name: info.name, sr: info.sr, ch: info.channels, fmt: info.format });
                if self.chain.as_ref().map(|c| c.sr as u32) != Some(sr) {
                    let mut c = Chain::new(sr as f64);
                    c.apply(&self.params);
                    self.chain = Some(c);
                    self.room_flight = None;
                    self.want_room();
                }
                self.pushed = self.out.played.load(Ordering::Acquire);
                self.dev = Some(Dev { prod, cons, sr });
                let resume = self.resume_at.take();
                if let (Some(t), true) = (resume, self.tr.is_some()) {
                    self.seek_to(t, false);
                } else {
                    let p = self.hub.position();
                    self.reset_markers(p);
                }
            }
            Cmd::Dev(DevMsg::Lost(msg)) => {
                if self.dev.is_some() && self.tr.is_some() {
                    self.resume_at = Some(self.hub.position());
                }
                self.dev = None;
                *self.hub.dev.lock().unwrap() = None;
                self.hub.dev_seen.store(true, Ordering::Release);
                self.hub.note(Note::DevLost { msg });
            }
        }
    }

    /// Builds the reverb room the settings ask for, off this thread.
    fn want_room(&mut self) {
        let Some(c) = self.chain.as_ref() else { return };
        let Some(sig) = c.wants_room() else { return };
        if self.room_flight == Some(sig) {
            return;
        }
        self.room_flight = Some(sig);
        let sr = c.sr as u32;
        let tx = self.tx.clone();
        let _ = std::thread::Builder::new().name("mw-audio-room".into()).spawn(move || {
            let ir = conv::reverb_ir(sr as f32, sig.0 as f32, sig.1 as f32);
            let cv = conv::Stereo::new(&ir);
            let _ = tx.send(Cmd::Room(Box::new(cv), sig, sr));
        });
    }

    fn push_block(dev: &mut Dev, buf: &[f32]) -> bool {
        match dev.prod.write_chunk_uninit(buf.len()) {
            Ok(w) => {
                w.fill_from_iter(buf.iter().copied());
                true
            }
            Err(_) => false,
        }
    }

    /// Renders one block into the ring; false when there is nothing to do.
    fn render_block(&mut self) -> bool {
        let want = self.out.want.load(Ordering::Relaxed);
        let (Some(dev), Some(chain), Some(tr)) = (self.dev.as_mut(), self.chain.as_mut(), self.tr.as_mut()) else {
            return false;
        };
        if dev.prod.slots() < BLOCK * 2 || tr.failed {
            return false;
        }
        let dsr = dev.sr as f64;
        let la = chain.latency() as u64;
        if tr.done {
            if tr.tail == 0 || !want {
                return false;
            }
            tr.tail -= 1;
            self.buf.iter_mut().for_each(|v| *v = 0.0);
            chain.process(&mut self.buf);
            if Self::push_block(dev, &self.buf) {
                self.pushed += BLOCK as u64;
            }
            return true;
        }
        let mut ratio = tr.src_sr as f64 * self.rate / dsr;
        loop {
            if tr.started && tr.rs.need(BLOCK, ratio) == 0 {
                break;
            }
            let mut st = tr.pcm.st.lock().unwrap();
            if let Some(ch) = st.q.pop_front() {
                st.frames = st.frames.saturating_sub(ch.data.len() / 2);
                tr.pcm.cv.notify_all();
                drop(st);
                if !tr.started || ch.sr != tr.src_sr {
                    tr.t0 = ch.pos;
                    tr.src_sr = ch.sr.max(1);
                    tr.rs.reset(0);
                    tr.fed = 0;
                    tr.started = true;
                    ratio = tr.src_sr as f64 * self.rate / dsr;
                }
                tr.rs.push(&ch.data);
                tr.fed += (ch.data.len() / 2) as u64;
                continue;
            }
            if st.err.is_some() {
                tr.failed = true;
                return false;
            }
            if st.eof {
                tr.eof = true;
            }
            break;
        }
        if !tr.started && tr.eof {
            // Nothing at all (a seek past the end): the track is over.
            tr.done = true;
            let end = self.pushed + la;
            self.hub.cur.lock().unwrap().end_frame = Some(end);
            return false;
        }
        let enough = tr.started && tr.rs.need(BLOCK, ratio) == 0;
        if !enough && !tr.eof {
            if !tr.waiting {
                tr.waiting = true;
                self.hub.cur.lock().unwrap().waiting = true;
                if want && tr.started {
                    self.hub.note(Note::Waiting { gen: tr.gen });
                }
                self.declick = DECLICK;
            }
            return false;
        }
        let pos0 = tr.t0 + tr.rs.pos() / tr.src_sr as f64;
        let step = ratio / tr.src_sr as f64;
        let mut frames = BLOCK;
        let mut ended = false;
        if tr.eof {
            let left = ((tr.fed as f64 - tr.rs.pos()) / ratio).ceil().max(0.0) as usize;
            if left <= BLOCK {
                frames = left;
                ended = true;
            }
        }
        let made = if frames > 0 { tr.rs.produce(&mut self.rsout, frames, ratio, tr.eof) } else { 0 };
        self.buf[..made * 2].copy_from_slice(&self.rsout[..made * 2]);
        self.buf[made * 2..].iter_mut().for_each(|v| *v = 0.0);
        if self.declick > 0 {
            let n = self.declick.min(made);
            for i in 0..n {
                let g = (i + 1) as f32 / (DECLICK + 1) as f32;
                self.buf[i * 2] *= g;
                self.buf[i * 2 + 1] *= g;
            }
            self.declick = 0;
        }
        chain.process(&mut self.buf);
        self.hub.level_ms.store(chain.level_ms().to_bits(), Ordering::Relaxed);
        self.hub.lim_db.store(chain.limiting_db().to_bits(), Ordering::Relaxed);
        let frame0 = self.pushed + la;
        {
            let heard = self.out.heard();
            let mut m = self.hub.markers.lock().unwrap();
            m.push_back(Marker { frame: frame0, pos: pos0, step });
            if ended {
                m.push_back(Marker { frame: frame0 + made as u64, pos: pos0 + made as f64 * step, step: 0.0 });
            }
            while m.len() > 2 && m[1].frame <= heard {
                m.pop_front();
            }
        }
        if !Self::push_block(dev, &self.buf) {
            return false;
        }
        self.pushed += BLOCK as u64;
        if ended {
            tr.done = true;
            tr.tail = (3.0 * dsr / BLOCK as f64) as usize;
            self.hub.cur.lock().unwrap().end_frame = Some(frame0 + made as u64);
        }
        if tr.waiting {
            tr.waiting = false;
            self.hub.cur.lock().unwrap().waiting = false;
            tr.play_note = true;
        }
        if let Some(t) = tr.seek_note.take() {
            self.hub.note(Note::Seeked { gen: tr.gen, t });
        }
        if tr.play_note && want {
            tr.play_note = false;
            self.hub.note(Note::Playing { gen: tr.gen });
        }
        true
    }

    fn run(mut self) {
        loop {
            let first = if self.active() {
                match self.rx.try_recv() {
                    Ok(c) => Some(c),
                    Err(std::sync::mpsc::TryRecvError::Empty) => None,
                    Err(_) => return,
                }
            } else {
                match self.rx.recv_timeout(Duration::from_millis(40)) {
                    Ok(c) => Some(c),
                    Err(RecvTimeoutError::Timeout) => None,
                    Err(_) => return,
                }
            };
            if let Some(c) = first {
                self.handle(c);
                while let Ok(c) = self.rx.try_recv() {
                    self.handle(c);
                }
            }
            let Some(sr) = self.dev.as_ref().map(|d| d.sr) else { continue };
            let target = self.fill_target(sr);
            let mut n = 0;
            while self.ring_fill() < target && n < 48 {
                if !self.render_block() {
                    break;
                }
                n += 1;
            }
            if self.active() {
                std::thread::sleep(Duration::from_millis(3));
            }
        }
    }
}

fn note_json(n: &Note, hub: &Hub) -> Value {
    match n {
        Note::Meta { gen, dur, sr, codec } => {
            let mut c = hub.cur.lock().unwrap();
            if c.gen == *gen {
                c.dur = *dur;
                c.sr = *sr;
                c.codec = codec.clone();
            }
            json!({"k": "meta", "g": gen, "d": dur, "sr": sr, "codec": codec})
        }
        Note::Error { gen, kind, msg } => json!({"k": "error", "g": gen, "kind": kind, "msg": msg}),
        Note::Playing { gen } => json!({"k": "playing", "g": gen}),
        Note::Waiting { gen } => json!({"k": "waiting", "g": gen}),
        Note::Seeked { gen, t } => json!({"k": "seeked", "g": gen, "t": t}),
        Note::Dev { name, sr, ch, fmt } => json!({"k": "dev", "name": name, "sr": sr, "ch": ch, "fmt": fmt}),
        Note::DevLost { msg } => json!({"k": "devlost", "msg": msg}),
    }
}

fn send(hub: &Hub, v: Value) {
    let mut ch = hub.chan.lock().unwrap();
    if let Some(c) = ch.as_ref() {
        if c.send(v).is_err() {
            *ch = None;
        }
    }
}

pub fn snapshot(hub: &Hub, spec: Option<&mut Spectrum>) -> Value {
    let pos = hub.position();
    let heard = hub.out.heard();
    let want = hub.out.want.load(Ordering::Relaxed);
    let (gen, dur, ended, waiting, buffered) = {
        let c = hub.cur.lock().unwrap();
        let b = c.pcm.as_ref().map(|p| p.st.lock().unwrap().buffered_to).unwrap_or(0.0);
        (c.gen, c.dur, c.end_frame.is_some_and(|f| heard >= f), c.waiting, b)
    };
    let pos = match dur {
        Some(d) => pos.min(d),
        None => pos,
    };
    let st = if ended {
        "end"
    } else if !want {
        "pause"
    } else if waiting {
        "wait"
    } else {
        "play"
    };
    let lv = 10.0 * (f64::from_bits(hub.level_ms.load(Ordering::Relaxed)) + 1e-12).log10();
    let mut v = json!({
        "k": "t", "g": gen, "p": pos, "d": dur, "st": st, "b": buffered,
        "lv": lv, "u": hub.out.underruns.load(Ordering::Relaxed),
        "lim": f64::from_bits(hub.lim_db.load(Ordering::Relaxed)),
    });
    if let Some(s) = spec {
        let bytes = s.bytes(&hub.out.scope(dsp::FFT));
        v["sp"] = Value::String(base64::engine::general_purpose::STANDARD.encode(bytes));
    }
    v
}

fn status_loop(hub: Arc<Hub>, rx: Receiver<Note>) {
    let mut spec = Spectrum::new();
    let mut last = Instant::now();
    let mut was_viz = false;
    loop {
        let want = hub.out.want.load(Ordering::Relaxed);
        let viz = hub.viz.load(Ordering::Relaxed) && want;
        let period = Duration::from_millis(if viz {
            16
        } else if want {
            100
        } else {
            250
        });
        let wait = period.saturating_sub(last.elapsed());
        match rx.recv_timeout(wait) {
            Ok(n) => {
                let v = note_json(&n, &hub);
                send(&hub, v);
                continue;
            }
            Err(RecvTimeoutError::Timeout) => {}
            Err(_) => return,
        }
        last = Instant::now();
        if viz != was_viz {
            spec.reset();
            was_viz = viz;
        }
        // The end: once, when its last frame has been heard.
        let ended = {
            let heard = hub.out.heard();
            let mut c = hub.cur.lock().unwrap();
            match c.end_frame {
                Some(f) if heard >= f && !c.ended_sent => {
                    c.ended_sent = true;
                    Some(c.gen)
                }
                _ => None,
            }
        };
        let v = snapshot(&hub, if viz { Some(&mut spec) } else { None });
        send(&hub, v);
        if let Some(g) = ended {
            send(&hub, json!({"k": "ended", "g": g}));
        }
    }
}

pub struct Engine {
    tx: Mutex<Sender<Cmd>>,
    pub hub: Arc<Hub>,
    preload: Mutex<VecDeque<(String, HttpSource)>>,
}

static ENGINE: OnceLock<Engine> = OnceLock::new();

pub fn get() -> &'static Engine {
    ENGINE.get_or_init(Engine::start)
}

fn new_hub(out: Arc<Out>, ntx: Sender<Note>) -> Arc<Hub> {
    Arc::new(Hub {
        out,
        markers: Mutex::new(VecDeque::new()),
        cur: Mutex::new(Cur::default()),
        chan: Mutex::new(None),
        level_ms: AtomicU64::new(0),
        lim_db: AtomicU64::new(0),
        viz: AtomicBool::new(false),
        dev: Mutex::new(None),
        dev_seen: AtomicBool::new(false),
        note: Mutex::new(ntx),
        op: AtomicU64::new(0),
        req_play: AtomicBool::new(false),
    })
}

impl Render {
    fn new(rx: Receiver<Cmd>, tx: Sender<Cmd>, hub: Arc<Hub>) -> Self {
        Render {
            rx,
            tx,
            out: hub.out.clone(),
            hub,
            dev: None,
            chain: None,
            params: Set { vol: Some(0.8), ..Default::default() },
            rate: 1.0,
            tr: None,
            pushed: 0,
            buf: vec![0.0; BLOCK * 2],
            rsout: Vec::with_capacity(BLOCK * 2),
            declick: 0,
            room_flight: None,
            resume_at: None,
        }
    }
}

/// The decoder thread for one track; its PCM goes to the render thread.
fn spawn_decoder(hub: Arc<Hub>, url: String, pre: Option<HttpSource>, gen: u64, at: f64) -> Arc<Pcm> {
    let pcm = Arc::new(Pcm::default());
    let pcm2 = pcm.clone();
    let _ = std::thread::Builder::new().name("mw-audio-dec".into()).spawn(move || {
        let src = match pre {
            Some(s) => Ok(s),
            None => HttpSource::open(&url),
        };
        let h = hub.clone();
        decode::run(
            src,
            at,
            pcm2,
            Box::new(move |ev| match ev {
                Ev::Meta(m) => h.note(Note::Meta { gen, dur: m.dur, sr: m.sr, codec: m.codec }),
                Ev::Error(k, msg) => h.note(Note::Error { gen, kind: k.as_str(), msg }),
            }),
        );
    });
    pcm
}

impl Engine {
    fn start() -> Engine {
        let out = Arc::new(Out::default());
        let (tx, rx) = channel::<Cmd>();
        let (ntx, nrx) = channel::<Note>();
        let hub = new_hub(out.clone(), ntx);
        let r = Render::new(rx, tx.clone(), hub.clone());
        let _ = std::thread::Builder::new().name("mw-audio-render".into()).spawn(move || {
            #[cfg(target_os = "windows")]
            raise_priority();
            r.run()
        });
        let h2 = hub.clone();
        let _ = std::thread::Builder::new().name("mw-audio-status".into()).spawn(move || status_loop(h2, nrx));
        let dtx = Mutex::new(tx.clone());
        output::spawn(out, move |m| dtx.lock().unwrap().send(Cmd::Dev(m)).is_ok());
        Engine { tx: Mutex::new(tx), hub, preload: Mutex::new(VecDeque::new()) }
    }

    fn cmd(&self, c: Cmd) {
        let _ = self.tx.lock().unwrap().send(c);
    }

    /// Waits (briefly) for the device thread's first answer.
    pub fn device(&self, wait: Duration) -> Option<(String, u32, u16, String)> {
        let t0 = Instant::now();
        while !self.hub.dev_seen.load(Ordering::Acquire) && t0.elapsed() < wait {
            std::thread::sleep(Duration::from_millis(20));
        }
        self.hub.dev.lock().unwrap().clone()
    }

    pub fn subscribe(&self, ch: Channel<Value>) {
        *self.hub.chan.lock().unwrap() = Some(ch);
        if let Some((name, sr, ch, fmt)) = self.hub.dev.lock().unwrap().clone() {
            self.hub.note(Note::Dev { name, sr, ch, fmt });
        }
    }

    /// IPC calls are not guaranteed to arrive in the order the page made
    /// them, so play / pause / open carry a counter: one older than the newest
    /// seen is stale and dropped.
    fn fresh(&self, op: Option<u64>) -> bool {
        op.is_none_or(|o| self.hub.op.fetch_max(o, Ordering::AcqRel) < o)
    }

    pub fn open(&self, url: String, gen: u64, at: f64, play: bool, op: Option<u64>) {
        // A stale open still opens (it is the newest track), but plays or
        // not as the page last asked.
        let play = if self.fresh(op) {
            self.hub.req_play.store(play, Ordering::Release);
            play
        } else {
            self.hub.req_play.load(Ordering::Acquire)
        };
        let pre = {
            let mut p = self.preload.lock().unwrap();
            p.iter().position(|(u, _)| *u == url).and_then(|i| p.remove(i)).map(|(_, s)| s)
        };
        let pcm = spawn_decoder(self.hub.clone(), url, pre, gen, at);
        self.cmd(Cmd::Open { gen, pcm, at: at.max(0.0), play });
    }

    pub fn play(&self, fade: f64, op: Option<u64>) {
        if self.fresh(op) {
            self.hub.req_play.store(true, Ordering::Release);
            self.cmd(Cmd::Play(ramp_ms(fade)));
        }
    }

    pub fn pause(&self, fade: f64, op: Option<u64>) {
        if self.fresh(op) {
            self.hub.req_play.store(false, Ordering::Release);
            self.cmd(Cmd::Pause(ramp_ms(fade)));
        }
    }

    pub fn seek(&self, gen: u64, t: f64) {
        self.cmd(Cmd::Seek { gen, t: t.max(0.0) });
    }

    pub fn stop(&self) {
        self.cmd(Cmd::Stop);
    }

    pub fn set(&self, s: Set, rate: Option<f64>, viz: Option<bool>) {
        if let Some(v) = viz {
            self.hub.viz.store(v, Ordering::Relaxed);
        }
        if let Some(r) = rate {
            self.cmd(Cmd::Rate(r));
        }
        self.cmd(Cmd::Set(Box::new(s)));
    }

    /// Starts downloading the next track so that it begins at once.
    pub fn preload(&self, url: String) {
        {
            let p = self.preload.lock().unwrap();
            if p.iter().any(|(u, _)| *u == url) {
                return;
            }
        }
        let me = get();
        let _ = std::thread::Builder::new().name("mw-audio-pre".into()).spawn(move || {
            if let Ok(src) = HttpSource::open(&url) {
                let mut p = me.preload.lock().unwrap();
                if p.iter().any(|(u, _)| *u == url) {
                    src.close();
                    return;
                }
                p.push_back((url, src));
                while p.len() > 2 {
                    if let Some((_, old)) = p.pop_front() {
                        old.close();
                    }
                }
            }
        });
    }

    pub fn status(&self) -> Value {
        let mut v = snapshot(&self.hub, None);
        if let Some((name, sr, ch, fmt)) = self.hub.dev.lock().unwrap().clone() {
            v["dev"] = json!({"name": name, "sr": sr, "ch": ch, "fmt": fmt});
        }
        let c = self.hub.cur.lock().unwrap();
        v["codec"] = json!(c.codec);
        v["sr"] = json!(c.sr);
        v
    }
}

fn ramp_ms(fade: f64) -> u32 {
    (fade * 1000.0).clamp(4.0, 2000.0) as u32
}

/// The render thread works tens of milliseconds ahead, but on a busy
/// Windows desktop a normal-priority thread can still be starved that long.
#[cfg(target_os = "windows")]
fn raise_priority() {
    extern "system" {
        fn GetCurrentThread() -> isize;
        fn SetThreadPriority(h: isize, p: i32) -> i32;
    }
    // THREAD_PRIORITY_HIGHEST
    unsafe {
        SetThreadPriority(GetCurrentThread(), 2);
    }
}

#[cfg(test)]
mod itest;
