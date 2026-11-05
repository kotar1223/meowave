//! The output device: a cpal stream fed from a lock-free ring.
//!
//! The callback only copies samples out of the ring — everything costly
//! happens on the render thread, tens of milliseconds ahead — so it cannot
//! miss its deadline because a filter or a convolution took long. Pausing is
//! a short gain ramp right here, so it is immediate and click-free, and the
//! rendered audio after the pause point waits in the ring for the resume.
//!
//! A dedicated thread owns the stream (it is not `Send` on every platform)
//! and rebuilds it when the device goes away or the system's default output
//! changes.

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, SampleFormat, SizedSample, StreamConfig};
use rtrb::{Consumer, Producer, RingBuffer};
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

pub const SCOPE: usize = 2048;
/// Ring capacity in seconds.
const RING_SEC: f64 = 0.5;

fn epoch() -> Instant {
    static E: OnceLock<Instant> = OnceLock::new();
    *E.get_or_init(Instant::now)
}

pub fn now_ns() -> u64 {
    epoch().elapsed().as_nanos() as u64
}

/// When the frames of the last callback that played anything start sounding.
#[derive(Clone, Copy, Default)]
pub struct Clock {
    /// Frames consumed before that callback.
    pub played: u64,
    /// When the callback ran, plus the device latency: the moment its first
    /// frame reaches the speakers (ns, see `now_ns`).
    pub sounds_at: u64,
}

/// What the callback and the rest of the engine share.
pub struct Out {
    pub played: AtomicU64,
    pub clock: Mutex<Clock>,
    pub sr: AtomicU32,
    pub cb_frames: AtomicU32,
    pub latency_ns: AtomicU64,
    /// Playing (consume the ring) or paused (ramp down and hold).
    pub want: AtomicBool,
    pub ramp_ms: AtomicU32,
    /// The callback is at zero gain and not consuming.
    pub idle: AtomicBool,
    pub underruns: AtomicU64,
    pub scope: Vec<AtomicU32>,
    pub scope_w: AtomicU64,
    lost: AtomicBool,
    pub quit: AtomicBool,
}

impl Default for Out {
    fn default() -> Self {
        Self {
            played: AtomicU64::new(0),
            clock: Mutex::new(Clock::default()),
            sr: AtomicU32::new(48000),
            cb_frames: AtomicU32::new(0),
            latency_ns: AtomicU64::new(0),
            want: AtomicBool::new(false),
            ramp_ms: AtomicU32::new(12),
            idle: AtomicBool::new(true),
            underruns: AtomicU64::new(0),
            scope: (0..SCOPE).map(|_| AtomicU32::new(0)).collect(),
            scope_w: AtomicU64::new(0),
            lost: AtomicBool::new(false),
            quit: AtomicBool::new(false),
        }
    }
}

impl Out {
    /// The frame (in ring order) reaching the speakers now.
    pub fn heard(&self) -> u64 {
        let played = self.played.load(Ordering::Acquire);
        let c = *self.clock.lock().unwrap();
        let sr = self.sr.load(Ordering::Relaxed) as i128;
        let el = now_ns() as i128 - c.sounds_at as i128;
        let h = c.played as i128 + el * sr / 1_000_000_000;
        h.clamp(0, played as i128) as u64
    }

    /// The last `n` mono samples played (oldest first).
    pub fn scope(&self, n: usize) -> Vec<f32> {
        let w = self.scope_w.load(Ordering::Acquire) as usize;
        let n = n.min(SCOPE);
        (0..n)
            .map(|i| {
                let k = (w + SCOPE - n + i) % SCOPE;
                f32::from_bits(self.scope[k].load(Ordering::Relaxed))
            })
            .collect()
    }
}

pub struct DevInfo {
    pub sr: u32,
    pub channels: u16,
    pub name: String,
    pub format: String,
}

pub enum DevMsg {
    Ready(DevInfo, Producer<f32>, Arc<Mutex<Consumer<f32>>>),
    Lost(String),
}

pub(super) struct CbState {
    g: f32,
    rng: u64,
}

impl CbState {
    pub(super) fn new() -> Self {
        Self { g: 0.0, rng: 0x9E37_79B9_7F4A_7C15 }
    }

    #[inline]
    fn tpdf(&mut self, lsb: f32) -> f32 {
        let mut r = || {
            self.rng ^= self.rng << 13;
            self.rng ^= self.rng >> 7;
            self.rng ^= self.rng << 17;
            (self.rng >> 40) as f32 / (1u64 << 24) as f32
        };
        (r() - r()) * lsb
    }
}

#[allow(clippy::too_many_arguments)]
pub(super) fn fill<T: SizedSample + FromSample<f32>>(
    data: &mut [T],
    ch: usize,
    sr: u32,
    out: &Out,
    cons: &Mutex<Consumer<f32>>,
    st: &mut CbState,
    lsb: f32,
    info: &cpal::OutputCallbackInfo,
) {
    let frames = data.len() / ch.max(1);
    out.cb_frames.store(frames as u32, Ordering::Relaxed);
    let want = out.want.load(Ordering::Acquire);
    let ramp = (out.ramp_ms.load(Ordering::Relaxed) as f32 * sr as f32 / 1000.0).max(1.0);
    let step = 1.0 / ramp;
    let mut guard = cons.try_lock().ok();
    let avail = guard.as_ref().map(|c| c.slots() / 2).unwrap_or(0);
    let take = if want {
        frames.min(avail)
    } else {
        let left = (st.g / step).ceil() as usize;
        frames.min(avail).min(left)
    };
    let mut l_r = [0.0f32; 2];
    let mut w = out.scope_w.load(Ordering::Relaxed);
    let mut chunk = match (take, guard.as_mut()) {
        (n, Some(c)) if n > 0 => c.read_chunk(n * 2).ok(),
        _ => None,
    };
    let (a, b) = match chunk.as_ref() {
        Some(c) => c.as_slices(),
        None => (&[][..], &[][..]),
    };
    for (i, frame) in data.chunks_exact_mut(ch.max(1)).enumerate() {
        if i < take {
            let k = i * 2;
            for (c, v) in l_r.iter_mut().enumerate() {
                let j = k + c;
                *v = if j < a.len() { a[j] } else { b[j - a.len()] };
            }
            if want {
                st.g = (st.g + step).min(1.0);
            } else {
                st.g = (st.g - step).max(0.0);
            }
            l_r[0] *= st.g;
            l_r[1] *= st.g;
        } else {
            l_r = [0.0, 0.0];
            if !want {
                st.g = 0.0;
            }
        }
        let m = (l_r[0] + l_r[1]) * 0.5;
        out.scope[(w as usize) % SCOPE].store(m.to_bits(), Ordering::Relaxed);
        w += 1;
        let mut put = |slot: &mut T, v: f32| {
            let v = if lsb > 0.0 { v + st.tpdf(lsb) } else { v };
            *slot = T::from_sample(v.clamp(-1.0, 1.0));
        };
        match ch {
            1 => put(&mut frame[0], m),
            _ => {
                put(&mut frame[0], l_r[0]);
                put(&mut frame[1], l_r[1]);
                for s in frame[2..].iter_mut() {
                    *s = T::EQUILIBRIUM;
                }
            }
        }
    }
    if let Some(c) = chunk.take() {
        c.commit_all();
    }
    drop(guard);
    out.scope_w.store(w, Ordering::Release);
    if want && take < frames {
        out.underruns.fetch_add(1, Ordering::Relaxed);
    }
    if take > 0 {
        let ts = info.timestamp();
        let lat = ts.playback.duration_since(ts.callback).as_nanos() as u64;
        out.latency_ns.store(lat, Ordering::Relaxed);
        let before = out.played.load(Ordering::Relaxed);
        if let Ok(mut c) = out.clock.try_lock() {
            c.played = before;
            c.sounds_at = now_ns() + lat;
        }
        out.played.store(before + take as u64, Ordering::Release);
    }
    out.idle.store(!want && st.g == 0.0, Ordering::Relaxed);
}

fn build<T: SizedSample + FromSample<f32>>(
    dev: &cpal::Device,
    cfg: StreamConfig,
    out: Arc<Out>,
    cons: Arc<Mutex<Consumer<f32>>>,
    lsb: f32,
) -> Result<cpal::Stream, String> {
    let ch = cfg.channels as usize;
    let sr = cfg.sample_rate;
    let mut st = CbState::new();
    let out2 = out.clone();
    dev.build_output_stream::<T, _, _>(
        cfg,
        move |data: &mut [T], info: &cpal::OutputCallbackInfo| fill(data, ch, sr, &out, &cons, &mut st, lsb, info),
        move |e: cpal::Error| {
            use cpal::ErrorKind as K;
            match e.kind() {
                K::Xrun | K::DeviceChanged | K::RealtimeDenied => {}
                _ => {
                    eprintln!("[audio] device error: {e}");
                    out2.lost.store(true, Ordering::Release);
                }
            }
        },
        None,
    )
    .map_err(|e| e.to_string())
}

fn pick(dev: &cpal::Device) -> Result<(StreamConfig, SampleFormat), String> {
    let def = dev.default_output_config().map_err(|e| e.to_string())?;
    let sr = def.sample_rate();
    let ch = def.channels();
    let mut fmt = def.sample_format();
    if fmt != SampleFormat::F32 {
        if let Ok(list) = dev.supported_output_configs() {
            for r in list {
                if r.sample_format() == SampleFormat::F32 && r.channels() == ch && r.contains_rate(sr) {
                    fmt = SampleFormat::F32;
                    break;
                }
            }
        }
    }
    let mut buffer_size = cpal::BufferSize::Default;
    // ALSA's default buffer can be half a second: pauses and seeks would
    // wait for it. Ask for ~20 ms periods where the device allows.
    if cfg!(target_os = "linux") {
        if let cpal::SupportedBufferSize::Range { min, max } = def.buffer_size() {
            let want = (sr / 50).next_power_of_two();
            if *min <= want && want <= *max {
                buffer_size = cpal::BufferSize::Fixed(want);
            }
        }
    }
    Ok((StreamConfig { channels: ch, sample_rate: sr, buffer_size }, fmt))
}

type Opened = (cpal::Stream, DevInfo, Producer<f32>, Arc<Mutex<Consumer<f32>>>);

fn open(out: &Arc<Out>) -> Result<Opened, String> {
    let host = cpal::default_host();
    let dev = host.default_output_device().ok_or("no output device")?;
    let name = dev.description().map(|d| d.name().to_string()).unwrap_or_else(|_| "output".into());
    let (cfg, fmt) = pick(&dev)?;
    let cap = ((cfg.sample_rate as f64 * RING_SEC) as usize).max(4096) * 2;
    let (prod, cons) = RingBuffer::<f32>::new(cap);
    let cons = Arc::new(Mutex::new(cons));
    out.sr.store(cfg.sample_rate, Ordering::Relaxed);
    out.lost.store(false, Ordering::Release);
    let o = out.clone();
    let c = cons.clone();
    let try_build = |cfg: StreamConfig| -> Result<cpal::Stream, String> {
        match fmt {
            SampleFormat::F32 => build::<f32>(&dev, cfg, o.clone(), c.clone(), 0.0),
            SampleFormat::F64 => build::<f64>(&dev, cfg, o.clone(), c.clone(), 0.0),
            SampleFormat::I32 => build::<i32>(&dev, cfg, o.clone(), c.clone(), 0.0),
            SampleFormat::I24 => build::<cpal::I24>(&dev, cfg, o.clone(), c.clone(), 1.0 / 8_388_608.0),
            SampleFormat::I16 => build::<i16>(&dev, cfg, o.clone(), c.clone(), 1.0 / 32768.0),
            SampleFormat::U16 => build::<u16>(&dev, cfg, o.clone(), c.clone(), 1.0 / 32768.0),
            SampleFormat::U8 => build::<u8>(&dev, cfg, o.clone(), c.clone(), 1.0 / 128.0),
            SampleFormat::I8 => build::<i8>(&dev, cfg, o.clone(), c.clone(), 1.0 / 128.0),
            f => Err(format!("unsupported sample format {f:?}")),
        }
    };
    let stream = match try_build(cfg) {
        Ok(s) => s,
        Err(e) if cfg.buffer_size != cpal::BufferSize::Default => {
            eprintln!("[audio] fixed buffer refused ({e}), using the default");
            try_build(StreamConfig { buffer_size: cpal::BufferSize::Default, ..cfg })?
        }
        Err(e) => return Err(e),
    };
    stream.play().map_err(|e| e.to_string())?;
    let info = DevInfo { sr: cfg.sample_rate, channels: cfg.channels, name, format: format!("{fmt:?}") };
    Ok((stream, info, prod, cons))
}

/// Starts the device thread; it reports to `tx` every time a stream is up
/// or gone.
pub fn spawn(out: Arc<Out>, send: impl Fn(DevMsg) -> bool + Send + 'static) {
    let _ = std::thread::Builder::new().name("mw-audio-dev".into()).spawn(move || {
        let mut fails = 0u32;
        while !out.quit.load(Ordering::Relaxed) {
            match open(&out) {
                Ok((stream, info, prod, cons)) => {
                    fails = 0;
                    eprintln!("[audio] output: {} · {} Hz · {} ch · {}", info.name, info.sr, info.channels, info.format);
                    if !send(DevMsg::Ready(info, prod, cons)) {
                        return;
                    }
                    while !out.lost.load(Ordering::Acquire) && !out.quit.load(Ordering::Relaxed) {
                        std::thread::sleep(Duration::from_millis(150));
                    }
                    drop(stream);
                    send(DevMsg::Lost("device changed".into()));
                    std::thread::sleep(Duration::from_millis(250));
                }
                Err(e) => {
                    if fails == 0 {
                        eprintln!("[audio] no output: {e}");
                        send(DevMsg::Lost(e));
                    }
                    fails += 1;
                    std::thread::sleep(Duration::from_millis(if fails < 5 { 500 } else { 2000 }));
                }
            }
        }
    });
}
