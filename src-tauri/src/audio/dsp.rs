//! The signal chain — what the Web Audio graph did, in one loop:
//!
//! preamp → 10-band EQ → [bypass | 3D: binaural panner → air → dry + hall]
//! + reverb send → volume → levelling → fade → boost → limiter.
//!
//! Filter coefficients are the Web Audio spec's (as Chromium computes them),
//! parameter changes glide the way `setTargetAtTime` glided them, so a preset
//! sounds the same in both engines. Where the graph was approximate the
//! chain is exact: a flat EQ at unity gain passes the samples through
//! untouched, and the limiter is a true peak limiter with look-ahead instead
//! of a compressor that squashed every master it touched.
#![allow(clippy::needless_range_loop)]

use super::conv::{self, BLOCK};
use realfft::num_complex::Complex;
use realfft::{RealFftPlanner, RealToComplex};
use std::f64::consts::PI;
use std::sync::Arc;

pub const FREQ: [f64; 10] = [32., 60., 150., 400., 1000., 2400., 4000., 8000., 12000., 16000.];
const EQ_Q: f64 = 1.05;
/// Coefficients are recomputed this often (samples) while a gain glides.
const SUB: usize = 32;

/// `setTargetAtTime`: an exponential glide towards the target.
#[derive(Clone, Copy, Debug)]
pub struct Smooth {
    pub v: f64,
    pub target: f64,
    k: f64,
}

impl Smooth {
    pub fn new(v: f64) -> Self {
        Self { v, target: v, k: 1.0 }
    }
    pub fn set(&mut self, target: f64, tau: f64, sr: f64) {
        self.target = target;
        if tau <= 0.0 {
            self.v = target;
            self.k = 1.0;
        } else {
            self.k = 1.0 - (-1.0 / (tau * sr)).exp();
        }
    }
    fn snap(&mut self) {
        if (self.target - self.v).abs() <= 1e-9 * (1.0 + self.target.abs()) {
            self.v = self.target;
        }
    }
    #[inline]
    pub fn tick(&mut self) -> f64 {
        if self.v != self.target {
            self.v += (self.target - self.v) * self.k;
            self.snap();
        }
        self.v
    }
    /// `n` samples in one step (parameters updated per sub-block).
    pub fn skip(&mut self, n: usize) -> f64 {
        if self.v != self.target {
            self.v = self.target + (self.v - self.target) * (1.0 - self.k).powi(n as i32);
            self.snap();
        }
        self.v
    }
    pub fn settled(&self) -> bool {
        self.v == self.target
    }
}

/// `linearRampToValueAtTime` from wherever the value is now.
#[derive(Clone, Copy, Debug)]
pub struct Ramp {
    pub v: f64,
    to: f64,
    step: f64,
    left: u64,
}

impl Ramp {
    pub fn new(v: f64) -> Self {
        Self { v, to: v, step: 0.0, left: 0 }
    }
    pub fn to(&mut self, v: f64, sec: f64, sr: f64) {
        let n = (sec.max(0.0) * sr).round() as u64;
        self.to = v;
        if n == 0 {
            self.v = v;
            self.left = 0;
        } else {
            self.left = n;
            self.step = (v - self.v) / n as f64;
        }
    }
    #[inline]
    pub fn tick(&mut self) -> f64 {
        if self.left > 0 {
            self.left -= 1;
            self.v = if self.left == 0 { self.to } else { self.v + self.step };
        }
        self.v
    }
    pub fn settled(&self) -> bool {
        self.left == 0
    }
}

/// Normalised biquad coefficients (a0 = 1).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Coef {
    pub b0: f64,
    pub b1: f64,
    pub b2: f64,
    pub a1: f64,
    pub a2: f64,
}

impl Coef {
    pub const IDENT: Coef = Coef { b0: 1.0, b1: 0.0, b2: 0.0, a1: 0.0, a2: 0.0 };

    fn norm(b0: f64, b1: f64, b2: f64, a0: f64, a1: f64, a2: f64) -> Coef {
        let k = 1.0 / a0;
        Coef { b0: b0 * k, b1: b1 * k, b2: b2 * k, a1: a1 * k, a2: a2 * k }
    }
    fn gain(g: f64) -> Coef {
        Coef { b0: g, ..Coef::IDENT }
    }
    /// Frequency as a fraction of Nyquist, clamped like Chromium does.
    fn nf(f: f64, sr: f64) -> f64 {
        (f / (sr * 0.5)).clamp(0.0, 1.0)
    }

    pub fn lowshelf(f: f64, db: f64, sr: f64) -> Coef {
        let nf = Self::nf(f, sr);
        let a = 10f64.powf(db / 40.0);
        if nf >= 1.0 {
            return Self::gain(a * a);
        }
        if nf <= 0.0 {
            return Self::IDENT;
        }
        let w0 = PI * nf;
        let alpha = 0.5 * w0.sin() * 2f64.sqrt();
        let k = w0.cos();
        let k2 = 2.0 * a.sqrt() * alpha;
        let (ap, am) = (a + 1.0, a - 1.0);
        Self::norm(
            a * (ap - am * k + k2),
            2.0 * a * (am - ap * k),
            a * (ap - am * k - k2),
            ap + am * k + k2,
            -2.0 * (am + ap * k),
            ap + am * k - k2,
        )
    }

    pub fn highshelf(f: f64, db: f64, sr: f64) -> Coef {
        let nf = Self::nf(f, sr);
        let a = 10f64.powf(db / 40.0);
        if nf >= 1.0 {
            return Self::IDENT;
        }
        if nf <= 0.0 {
            return Self::gain(a * a);
        }
        let w0 = PI * nf;
        let alpha = 0.5 * w0.sin() * 2f64.sqrt();
        let k = w0.cos();
        let k2 = 2.0 * a.sqrt() * alpha;
        let (ap, am) = (a + 1.0, a - 1.0);
        Self::norm(
            a * (ap + am * k + k2),
            -2.0 * a * (am + ap * k),
            a * (ap + am * k - k2),
            ap - am * k + k2,
            2.0 * (am - ap * k),
            ap - am * k - k2,
        )
    }

    pub fn peaking(f: f64, q: f64, db: f64, sr: f64) -> Coef {
        let nf = Self::nf(f, sr);
        let a = 10f64.powf(db / 40.0);
        if nf <= 0.0 || nf >= 1.0 {
            return Self::IDENT;
        }
        if q <= 0.0 {
            return Self::gain(a * a);
        }
        let w0 = PI * nf;
        let alpha = w0.sin() / (2.0 * q);
        let k = w0.cos();
        Self::norm(1.0 + alpha * a, -2.0 * k, 1.0 - alpha * a, 1.0 + alpha / a, -2.0 * k, 1.0 - alpha / a)
    }

    /// Web Audio's lowpass: `q_db` is the resonance in dB.
    pub fn lowpass(f: f64, q_db: f64, sr: f64) -> Coef {
        let nf = Self::nf(f, sr);
        if nf >= 1.0 {
            return Self::IDENT;
        }
        if nf <= 0.0 {
            return Self::gain(0.0);
        }
        let res = 10f64.powf(q_db / 20.0);
        let w0 = PI * nf;
        let alpha = w0.sin() / (2.0 * res);
        let c = w0.cos();
        let beta = (1.0 - c) / 2.0;
        Self::norm(beta, 2.0 * beta, beta, 1.0 + alpha, -2.0 * c, 1.0 - alpha)
    }

    /// |H| at `f` Hz.
    #[cfg(test)]
    pub fn mag(&self, f: f64, sr: f64) -> f64 {
        let w = 2.0 * PI * f / sr;
        let z1 = Complex::new(w.cos(), -w.sin());
        let z2 = z1 * z1;
        let num = Complex::new(self.b0, 0.0) + z1 * self.b1 + z2 * self.b2;
        let den = Complex::new(1.0, 0.0) + z1 * self.a1 + z2 * self.a2;
        (num / den).norm()
    }
}

/// Direct form I, like Chromium's: stays well-behaved while the
/// coefficients change under it.
#[derive(Clone, Copy, Debug, Default)]
struct Df1 {
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl Df1 {
    #[inline]
    fn run(&mut self, c: &Coef, x: f64) -> f64 {
        let y = c.b0 * x + c.b1 * self.x1 + c.b2 * self.x2 - c.a1 * self.y1 - c.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x;
        self.y2 = self.y1;
        self.y1 = if y.abs() < 1e-30 { 0.0 } else { y };
        self.y1
    }
    /// The state of a filter that passed `prev, last` through unchanged.
    fn hold(&mut self, prev: f64, last: f64) {
        self.x2 = prev;
        self.x1 = last;
        self.y2 = prev;
        self.y1 = last;
    }
    /// How far the output still differs from what an identity filter gives.
    fn residue(&self) -> f64 {
        (self.y1 - self.x1).abs() + (self.y2 - self.x2).abs()
    }
}

/// A stereo biquad.
#[derive(Clone, Copy, Debug)]
struct Bq {
    c: Coef,
    s: [Df1; 2],
}

impl Bq {
    fn new(c: Coef) -> Self {
        Self { c, s: [Df1::default(); 2] }
    }
    #[inline]
    fn run(&mut self, l: f64, r: f64) -> (f64, f64) {
        (self.s[0].run(&self.c, l), self.s[1].run(&self.c, r))
    }
}

fn band_coef(i: usize, db: f64, sr: f64) -> Coef {
    match i {
        0 => Coef::lowshelf(FREQ[0], db, sr),
        9 => Coef::highshelf(FREQ[9], db, sr),
        _ => Coef::peaking(FREQ[i], EQ_Q, db, sr),
    }
}

/// Preamp and the ten bands. A band at 0 dB is skipped once its state has
/// settled, so a flat EQ is bit-transparent.
pub struct Eq10 {
    sr: f64,
    pre: Smooth,
    gains: [Smooth; 10],
    bands: [Bq; 10],
    active: [bool; 10],
}

impl Eq10 {
    pub fn new(sr: f64) -> Self {
        Self {
            sr,
            pre: Smooth::new(1.0),
            gains: [Smooth::new(0.0); 10],
            bands: [Bq::new(Coef::IDENT); 10],
            active: [false; 10],
        }
    }

    pub fn set_pre_in(&mut self, g: f64, tau: f64) {
        self.pre.set(g.clamp(0.0, 8.0), tau, self.sr);
    }

    /// Band gains in dB, gliding with time constant `tau` (0: at once).
    pub fn set_in(&mut self, db: &[f64], tau: f64) {
        for (i, g) in db.iter().take(10).enumerate() {
            let g = if g.is_finite() { g.clamp(-24.0, 24.0) } else { 0.0 };
            if g != self.gains[i].target || tau <= 0.0 {
                self.gains[i].set(g, tau, self.sr);
            }
        }
    }

    /// Interleaved stereo, any length.
    pub fn process(&mut self, buf: &mut [f32]) {
        let frames = buf.len() / 2;
        let mut at = 0;
        while at < frames {
            let n = SUB.min(frames - at);
            let sub = &mut buf[at * 2..(at + n) * 2];
            if !(self.pre.settled() && self.pre.v == 1.0) {
                for f in sub.as_chunks_mut::<2>().0 {
                    let g = self.pre.tick() as f32;
                    f[0] *= g;
                    f[1] *= g;
                }
            }
            for b in 0..10 {
                let gl = &mut self.gains[b];
                if !gl.settled() || gl.v != 0.0 {
                    if !gl.settled() || !self.active[b] {
                        let v = gl.skip(n);
                        self.bands[b].c = band_coef(b, v, self.sr);
                    }
                    self.active[b] = true;
                }
                if !self.active[b] {
                    let k = sub.len();
                    let (pl, pr, ll, lr) = if k >= 4 {
                        (sub[k - 4] as f64, sub[k - 3] as f64, sub[k - 2] as f64, sub[k - 1] as f64)
                    } else {
                        (self.bands[b].s[0].x1, self.bands[b].s[1].x1, sub[0] as f64, sub[1] as f64)
                    };
                    self.bands[b].s[0].hold(pl, ll);
                    self.bands[b].s[1].hold(pr, lr);
                    continue;
                }
                let bq = &mut self.bands[b];
                for f in sub.as_chunks_mut::<2>().0 {
                    let (l, r) = bq.run(f[0] as f64, f[1] as f64);
                    f[0] = l as f32;
                    f[1] = r as f32;
                }
                // Back at 0 dB and the ringing has died out: leave the band.
                if gl_flat(&self.gains[b]) && bq.s[0].residue() + bq.s[1].residue() < 1e-10 {
                    self.active[b] = false;
                    bq.c = Coef::IDENT;
                }
            }
            at += n;
        }
    }
}

fn gl_flat(g: &Smooth) -> bool {
    g.settled() && g.v == 0.0
}

/// Fractional delay read with 4-point Hermite interpolation.
#[inline]
fn hermite(xm1: f64, x0: f64, x1: f64, x2: f64, t: f64) -> f64 {
    let c1 = 0.5 * (x1 - xm1);
    let c2 = xm1 - 2.5 * x0 + 2.0 * x1 - 0.5 * x2;
    let c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);
    ((c3 * t + c2) * t + c1) * t + x0
}

const HEAD_A: f64 = 0.0875;
const SOUND_C: f64 = 343.0;
const LINE: usize = 512;

/// One ear of the spherical-head model (Brown & Duda, 1998): the time the
/// sound takes round the head, and the head's shadow — a shelf that lifts
/// the highs at the near ear and dulls them at the far one.
#[derive(Clone)]
struct Ear {
    line: Vec<f64>,
    w: usize,
    x1: f64,
    y1: f64,
}

impl Ear {
    fn new() -> Self {
        Self { line: vec![0.0; LINE], w: 0, x1: 0.0, y1: 0.0 }
    }
    #[inline]
    fn push(&mut self, x: f64) {
        self.w = (self.w + 1) % LINE;
        self.line[self.w] = x;
    }
    /// The sample `d` samples ago (d ≥ 2).
    #[inline]
    fn read(&self, d: f64) -> f64 {
        let di = d.floor();
        let t = d - di;
        let i = di as usize;
        let at = |k: usize| self.line[(self.w + LINE - k) % LINE];
        // Position w-d lies between w-i-1 and w-i, t of the way from w-i towards w-i-1.
        hermite(at(i - 1), at(i), at(i + 1), at(i + 2), t)
    }
}

/// Incidence angle (radians) of a source at unit direction `u` on the ear
/// pointing along `ear_x` (±1 on the x axis).
fn incidence(u: [f64; 3], ear_x: f64) -> f64 {
    (u[0] * ear_x).clamp(-1.0, 1.0).acos()
}

/// Woodworth's path difference, as a delay in seconds (0 at the near side).
fn itd(theta: f64) -> f64 {
    let ac = HEAD_A / SOUND_C;
    if theta < PI / 2.0 {
        ac * (1.0 - theta.cos())
    } else {
        ac * (1.0 + theta - PI / 2.0)
    }
}

/// The head-shadow zero: 2 at the ear, 0.1 at 150°.
fn shadow_alpha(theta: f64) -> f64 {
    1.05 + 0.95 * (theta * 180.0 / 150.0).cos()
}

/// Web Audio's "inverse" distance model with refDistance 1, rolloff 0.6.
fn distance_gain(d: f64) -> f64 {
    1.0 / (1.0 + 0.6 * (d.max(1.0) - 1.0))
}

pub struct Binaural {
    sr: f64,
    ears: [Ear; 2],
    pos: [f64; 3],
    prev: Option<([f64; 2], [f64; 2], f64)>,
}

impl Binaural {
    pub fn new(sr: f64) -> Self {
        Self { sr, ears: [Ear::new(), Ear::new()], pos: [0.0, 0.0, -1.0], prev: None }
    }

    fn params(&self) -> ([f64; 2], [f64; 2], f64) {
        let p = self.pos;
        let d = (p[0] * p[0] + p[1] * p[1] + p[2] * p[2]).sqrt();
        let u = if d > 1e-9 { [p[0] / d, p[1] / d, p[2] / d] } else { [0.0, 0.0, -1.0] };
        let tl = incidence(u, -1.0);
        let tr = incidence(u, 1.0);
        let base = 2.0;
        (
            [base + itd(tl) * self.sr, base + itd(tr) * self.sr],
            [shadow_alpha(tl), shadow_alpha(tr)],
            distance_gain(d),
        )
    }

    /// One block: the left input feeds the left ear and the right the right
    /// ear, as Chromium's HRTF panner does with stereo input.
    pub fn process(&mut self, inp: &[f32], out: &mut [f32], target: [f64; 3], tau: f64) {
        let frames = inp.len() / 2;
        let k = 1.0 - (-(frames as f64) / (tau * self.sr)).exp();
        for i in 0..3 {
            self.pos[i] += (target[i] - self.pos[i]) * k;
        }
        let (d1, a1, g1) = self.params();
        let (d0, a0, g0) = self.prev.unwrap_or((d1, a1, g1));
        self.prev = Some((d1, a1, g1));
        let kk = 2.0 * self.sr;
        let beta = 2.0 * SOUND_C / HEAD_A;
        let den = beta + kk;
        let pole = (beta - kk) / den;
        for i in 0..frames {
            let t = (i + 1) as f64 / frames as f64;
            let g = g0 + (g1 - g0) * t;
            for e in 0..2 {
                let ear = &mut self.ears[e];
                ear.push(inp[i * 2 + e] as f64);
                let d = d0[e] + (d1[e] - d0[e]) * t;
                let x = ear.read(d);
                let alpha = a0[e] + (a1[e] - a0[e]) * t;
                let b0 = (beta + alpha * kk) / den;
                let b1 = (beta - alpha * kk) / den;
                let y = b0 * x + b1 * ear.x1 - pole * ear.y1;
                ear.x1 = x;
                ear.y1 = if y.abs() < 1e-30 { 0.0 } else { y };
                out[i * 2 + e] = (y * g) as f32;
            }
        }
    }
}

/// Spatial ("3D") settings, as the dock sends them.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Sp {
    pub on: bool,
    pub speed: f64,
    pub rad: f64,
    pub elev: f64,
}

impl Default for Sp {
    fn default() -> Self {
        Self { on: false, speed: 0.10, rad: 0.7, elev: 0.55 }
    }
}

/// Reverb send settings: mix 0‥1, size in seconds, tone 0‥100, pre-delay in ms.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rv {
    pub on: bool,
    pub mix: f64,
    pub size: f64,
    pub tone: f64,
    pub pre: f64,
}

impl Default for Rv {
    fn default() -> Self {
        Self { on: false, mix: 0.0, size: 2.4, tone: 52.0, pre: 22.0 }
    }
}

struct Spatial {
    sr: f64,
    pan: Binaural,
    air: Bq,
    air_f: Smooth,
    hall: conv::Stereo,
    byp: Smooth,
    dry: Smooth,
    wet: Smooth,
    theta: f64,
    target: [f64; 3],
    /// Blocks rendered since everything faded out (unplug after ~450 ms).
    idle: usize,
    wired: bool,
    a: Vec<f32>,
    b: Vec<f32>,
}

impl Spatial {
    fn new(sr: f64) -> Self {
        Self {
            sr,
            pan: Binaural::new(sr),
            air: Bq::new(Coef::lowpass(20000.0, 0.5, sr)),
            air_f: Smooth::new(20000.0),
            hall: conv::Stereo::new(&conv::hall_ir(sr as f32)),
            byp: Smooth::new(1.0),
            dry: Smooth::new(0.0),
            wet: Smooth::new(0.0),
            theta: 0.0,
            target: [0.0, 0.0, -1.0],
            idle: usize::MAX / 2,
            wired: false,
            a: vec![0.0; BLOCK * 2],
            b: vec![0.0; BLOCK * 2],
        }
    }

    fn set(&mut self, sp: &Sp) {
        let sr = self.sr;
        self.byp.set(if sp.on { 0.0 } else { 1.0 }, 0.06, sr);
        self.dry.set(if sp.on { 0.9 } else { 0.0 }, 0.06, sr);
        self.wet.set(if sp.on { 0.15 + 0.2 * sp.rad } else { 0.0 }, 0.06, sr);
        if sp.on && !self.wired {
            // Plugged back in: no stale delay lines or reverb tail.
            self.pan = Binaural::new(sr);
            self.air = Bq::new(Coef::lowpass(self.air_f.v, 0.5, sr));
            self.hall.reset();
            self.wired = true;
        }
        if sp.on {
            self.idle = 0;
        } else {
            self.air_f.set(20000.0, 0.1, sr);
        }
    }

    /// The orbit of app.js `orbit()`, advanced by the audio clock.
    fn orbit(&mut self, sp: &Sp, dt: f64) {
        if sp.on {
            self.theta += dt * sp.speed * PI * 2.0;
            let r = 0.6 + sp.rad * 3.4;
            let th = self.theta;
            let x = th.sin() * r;
            let z = th.cos() * r * 0.85;
            let y = (th * 2.0).sin() * r * 0.55 * sp.elev;
            self.target = [x, y, z];
            let behind = (z / (r * 0.85)).max(0.0);
            self.air_f.set(19000.0 - 13000.0 * behind * behind, 0.05, self.sr);
        } else {
            self.target = [0.0, 0.0, -1.0];
        }
    }

    fn quiet(&self) -> bool {
        self.byp.settled() && self.byp.v == 1.0 && self.dry.settled() && self.dry.v == 0.0 && self.wet.settled() && self.wet.v == 0.0
    }

    /// `e` is the EQ output; the result (bypass + 3D) goes to `out`.
    fn process(&mut self, e: &[f32], out: &mut [f32], sp: &Sp) {
        let dt = (e.len() / 2) as f64 / self.sr;
        if !self.wired {
            out.copy_from_slice(e);
            return;
        }
        self.orbit(sp, dt);
        let tau = if sp.on { 0.02 } else { 0.1 };
        self.pan.process(e, &mut self.a, self.target, tau);
        // Air: a gentle low-pass that closes as the source moves behind.
        let frames = e.len() / 2;
        let mut at = 0;
        while at < frames {
            let n = SUB.min(frames - at);
            if !self.air_f.settled() {
                let f = self.air_f.skip(n);
                self.air.c = Coef::lowpass(f, 0.5, self.sr);
            }
            for i in at..at + n {
                let (l, r) = self.air.run(self.a[i * 2] as f64, self.a[i * 2 + 1] as f64);
                self.a[i * 2] = l as f32;
                self.a[i * 2 + 1] = r as f32;
            }
            at += n;
        }
        self.hall.process(&self.a, &mut self.b);
        for i in 0..frames {
            let (gb, gd, gw) = (self.byp.tick() as f32, self.dry.tick() as f32, self.wet.tick() as f32);
            for c in 0..2 {
                let k = i * 2 + c;
                out[k] = e[k] * gb + self.a[k] * gd + self.b[k] * gw;
            }
        }
        if !sp.on && self.quiet() {
            self.idle += 1;
            if self.idle as f64 * dt > 0.45 {
                self.wired = false;
            }
        }
    }
}

/// The reverb send: pre-delay → convolver → tone low-pass → mix.
struct Reverb {
    sr: f64,
    line: Vec<f32>,
    w: usize,
    pre: Smooth,
    tone_f: Smooth,
    tone: Bq,
    out: Smooth,
    conv: Option<conv::Stereo>,
    /// The previous room, faded out over a few blocks after a change.
    old: Option<(conv::Stereo, usize)>,
    pub sig: (f64, f64),
    linked: bool,
    a: Vec<f32>,
    b: Vec<f32>,
    c: Vec<f32>,
}

const RV_XFADE: usize = 8;

impl Reverb {
    fn new(sr: f64) -> Self {
        let n = (sr * 0.2) as usize + 8;
        Self {
            sr,
            line: vec![0.0; n * 2],
            w: 0,
            pre: Smooth::new(0.0),
            tone_f: Smooth::new(1800.0 + 52.0 * 140.0),
            tone: Bq::new(Coef::lowpass(1800.0 + 52.0 * 140.0, 1.0, sr)),
            out: Smooth::new(0.0),
            conv: None,
            old: None,
            sig: (-1.0, -1.0),
            linked: false,
            a: vec![0.0; BLOCK * 2],
            b: vec![0.0; BLOCK * 2],
            c: vec![0.0; BLOCK * 2],
        }
    }

    fn set(&mut self, rv: &Rv) {
        let on = rv.on && rv.mix > 0.0;
        let sr = self.sr;
        self.pre.set((rv.pre / 1000.0).clamp(0.0, 0.2), 0.05, sr);
        let f = 1800.0 + rv.tone * 140.0;
        self.tone_f.set(f, 0.05, sr);
        self.out.set(if on { rv.mix.clamp(0.0, 1.0) * 1.15 } else { 0.0 }, 0.08, sr);
        if on && !self.linked {
            self.line.iter_mut().for_each(|v| *v = 0.0);
            if let Some(c) = self.conv.as_mut() {
                c.reset();
            }
            self.linked = true;
        }
    }

    /// A new room, built off the audio thread.
    fn swap(&mut self, conv: conv::Stereo, sig: (f64, f64)) {
        if let Some(prev) = self.conv.take() {
            if self.linked {
                self.old = Some((prev, RV_XFADE));
            }
        }
        self.conv = Some(conv);
        self.sig = sig;
    }

    /// Adds the wet signal of `e` into `out`.
    fn process(&mut self, e: &[f32], out: &mut [f32]) {
        if !self.linked {
            return;
        }
        let frames = e.len() / 2;
        let n = self.line.len() / 2;
        for i in 0..frames {
            self.w = (self.w + 1) % n;
            self.line[self.w * 2] = e[i * 2];
            self.line[self.w * 2 + 1] = e[i * 2 + 1];
            let d = (self.pre.tick() * self.sr).clamp(0.0, (n - 3) as f64);
            let di = d.floor();
            let t = (d - di) as f32;
            let i0 = (self.w + n - di as usize) % n;
            let i1 = (i0 + n - 1) % n;
            for c in 0..2 {
                let a = self.line[i0 * 2 + c];
                let b = self.line[i1 * 2 + c];
                self.a[i * 2 + c] = a + (b - a) * t;
            }
        }
        match self.conv.as_mut() {
            Some(cv) => cv.process(&self.a, &mut self.b),
            None => self.b.iter_mut().for_each(|v| *v = 0.0),
        }
        if let Some((old, left)) = self.old.as_mut() {
            old.process(&self.a, &mut self.c);
            let from = *left as f32 / RV_XFADE as f32;
            let to = (*left - 1) as f32 / RV_XFADE as f32;
            for i in 0..frames {
                let k = from + (to - from) * (i as f32 / frames as f32);
                for c in 0..2 {
                    let j = i * 2 + c;
                    self.b[j] = self.b[j] * (1.0 - k) + self.c[j] * k;
                }
            }
            *left -= 1;
            if *left == 0 {
                self.old = None;
            }
        }
        let mut at = 0;
        while at < frames {
            let m = SUB.min(frames - at);
            if !self.tone_f.settled() {
                let f = self.tone_f.skip(m);
                self.tone.c = Coef::lowpass(f, 1.0, self.sr);
            }
            for i in at..at + m {
                let (l, r) = self.tone.run(self.b[i * 2] as f64, self.b[i * 2 + 1] as f64);
                let g = self.out.tick();
                out[i * 2] += (l * g) as f32;
                out[i * 2 + 1] += (r * g) as f32;
            }
            at += m;
        }
        if self.out.settled() && self.out.v == 0.0 && self.old.is_none() {
            self.linked = false;
        }
    }
}

/// Look-ahead peak limiter. Each sample's needed gain is held over the
/// look-ahead window and smoothed by a box filter of the same length, so
/// the gain is already down when a peak arrives and no sample ever passes
/// the ceiling; recovery is a 150 ms exponential.
pub struct Limiter {
    la: usize,
    delay: Vec<f32>,
    dpos: usize,
    // Sliding minimum (monotonic deque over a ring).
    dq_v: Vec<f64>,
    dq_i: Vec<u64>,
    head: usize,
    len: usize,
    n: u64,
    // Box filter.
    boxb: Vec<f64>,
    bpos: usize,
    bsum: f64,
    /// Samples in the box below unity: none means exactly unity.
    below: usize,
    r: f64,
    rel: f64,
    pub ceiling: f64,
}

impl Limiter {
    pub fn new(sr: f64) -> Self {
        let la = ((sr * 0.005).round() as usize).max(1);
        let w = la + 1;
        Self {
            la,
            // Exactly `la` frames: a sample leaves when the last gain that
            // saw it in its window is applied.
            delay: vec![0.0; la * 2],
            dpos: 0,
            dq_v: vec![0.0; w + 1],
            dq_i: vec![0; w + 1],
            head: 0,
            len: 0,
            n: 0,
            boxb: vec![1.0; w],
            bpos: 0,
            bsum: w as f64,
            below: 0,
            r: 1.0,
            rel: 1.0 - (-1.0 / (0.15 * sr)).exp(),
            ceiling: 1.0,
        }
    }

    /// Frames of delay the look-ahead adds.
    pub fn latency(&self) -> usize {
        self.la
    }

    #[inline]
    fn min_push(&mut self, v: f64) -> f64 {
        let cap = self.dq_v.len();
        // Drop larger values from the back.
        while self.len > 0 {
            let back = (self.head + self.len - 1) % cap;
            if self.dq_v[back] >= v {
                self.len -= 1;
            } else {
                break;
            }
        }
        let at = (self.head + self.len) % cap;
        self.dq_v[at] = v;
        self.dq_i[at] = self.n;
        self.len += 1;
        // Drop the front once it leaves the window of la+1 samples.
        let w = (self.la + 1) as u64;
        while self.dq_i[self.head] + w <= self.n {
            self.head = (self.head + 1) % cap;
            self.len -= 1;
        }
        self.n += 1;
        self.dq_v[self.head]
    }

    pub fn process(&mut self, buf: &mut [f32]) {
        let w = self.la + 1;
        for f in buf.as_chunks_mut::<2>().0 {
            let (l, r) = (f[0], f[1]);
            let peak = l.abs().max(r.abs()) as f64;
            let need = if peak > self.ceiling { self.ceiling / peak } else { 1.0 };
            let h = self.min_push(need);
            if h < self.r {
                self.r = h;
            } else {
                self.r += (h - self.r) * self.rel;
                // Within 10⁻⁶ (under 0.00001 dB) of where it is going: there.
                if h - self.r < 1e-6 {
                    self.r = h;
                }
            }
            let out = self.boxb[self.bpos];
            if out < 1.0 {
                self.below -= 1;
            }
            self.bsum += self.r - out;
            self.boxb[self.bpos] = self.r;
            if self.r < 1.0 {
                self.below += 1;
            }
            self.bpos = (self.bpos + 1) % w;
            let g = if self.below == 0 {
                self.bsum = w as f64;
                1.0
            } else {
                (self.bsum / w as f64).min(1.0)
            };
            let dl = self.delay[self.dpos * 2];
            let dr = self.delay[self.dpos * 2 + 1];
            self.delay[self.dpos * 2] = l;
            self.delay[self.dpos * 2 + 1] = r;
            self.dpos = (self.dpos + 1) % self.la;
            if g == 1.0 {
                f[0] = dl;
                f[1] = dr;
            } else {
                // The box mean can sit a hair above the needed gain; the
                // clamp keeps the guarantee exact.
                let c = self.ceiling as f32;
                f[0] = ((dl as f64 * g) as f32).clamp(-c, c);
                f[1] = ((dr as f64 * g) as f32).clamp(-c, c);
            }
        }
    }

    /// Drops the look-ahead's audio (a seek: the old position must not
    /// follow the new one out).
    pub fn clear(&mut self) {
        self.delay.iter_mut().for_each(|v| *v = 0.0);
    }

    pub fn reduction_db(&self) -> f64 {
        let g = if self.below == 0 { 1.0 } else { self.bsum / (self.la + 1) as f64 };
        -20.0 * g.max(1e-6).log10()
    }
}

/// An AnalyserNode (fftSize 512, smoothing 0.84, −100‥−30 dB) over the
/// samples the device played, for the visuals.
pub struct Spectrum {
    fft: Arc<dyn RealToComplex<f32>>,
    win: Vec<f32>,
    inp: Vec<f32>,
    out: Vec<Complex<f32>>,
    scratch: Vec<Complex<f32>>,
    mag: Vec<f64>,
}

pub const FFT: usize = 512;

impl Default for Spectrum {
    fn default() -> Self {
        Self::new()
    }
}

impl Spectrum {
    pub fn new() -> Self {
        let mut planner = RealFftPlanner::<f32>::new();
        let fft = planner.plan_fft_forward(FFT);
        let out = fft.make_output_vec();
        let scratch = fft.make_scratch_vec();
        let win = (0..FFT)
            .map(|i| {
                let x = i as f64 / FFT as f64;
                (0.42 - 0.5 * (2.0 * PI * x).cos() + 0.08 * (4.0 * PI * x).cos()) as f32
            })
            .collect();
        Self { fft, win, inp: vec![0.0; FFT], out, scratch, mag: vec![0.0; FFT / 2] }
    }

    pub fn reset(&mut self) {
        self.mag.iter_mut().for_each(|v| *v = 0.0);
    }

    /// `mono`: the last FFT samples, oldest first. Returns the byte bins
    /// `getByteFrequencyData` would.
    pub fn bytes(&mut self, mono: &[f32]) -> Vec<u8> {
        for i in 0..FFT {
            self.inp[i] = mono.get(i).copied().unwrap_or(0.0) * self.win[i];
        }
        let _ = self.fft.process_with_scratch(&mut self.inp, &mut self.out, &mut self.scratch);
        let k = 0.84;
        let scale = SPECTRUM_SCALE / FFT as f64;
        let mut bytes = vec![0u8; FFT / 2];
        for i in 0..FFT / 2 {
            let c = self.out[i];
            let m = ((c.re as f64).powi(2) + (c.im as f64).powi(2)).sqrt() * scale;
            let v = k * self.mag[i] + (1.0 - k) * m;
            self.mag[i] = if v.is_finite() { v } else { 0.0 };
            let db = if self.mag[i] > 0.0 { 20.0 * self.mag[i].log10() } else { -100.0 };
            let s = 255.0 * (db + 100.0) / 70.0;
            bytes[i] = s.clamp(0.0, 255.0) as u8;
        }
        bytes
    }
}

/// Extra factor on |X|/N. Measured against Chromium's own AnalyserNode
/// (OfflineAudioContext, 3 kHz at 0.5 → −19.58 dB in bin 32): the plain
/// textbook DFT over N, so 1.
pub const SPECTRUM_SCALE: f64 = 1.0;

/// Everything the dock and the player set, in one partial update.
#[derive(Clone, Debug, Default)]
pub struct Set {
    pub pre: Option<f64>,
    pub eq: Option<Vec<f64>>,
    pub vol: Option<f64>,
    pub norm: Option<(f64, f64)>,
    pub fade: Option<(f64, f64)>,
    pub boost: Option<f64>,
    pub lim: Option<bool>,
    pub sp: Option<Sp>,
    pub rv: Option<Rv>,
}

/// The whole chain for one output rate.
pub struct Chain {
    pub sr: f64,
    eq: Eq10,
    sp: Sp,
    spatial: Spatial,
    rv: Rv,
    reverb: Reverb,
    vol: Smooth,
    norm: Smooth,
    fade: Ramp,
    boost: Smooth,
    lim: Limiter,
    lim_on: bool,
    e: Vec<f32>,
    /// Mean square of the EQ output over the last four blocks (the
    /// levelling meter's 2048-sample window).
    ms: [f64; 4],
    ms_i: usize,
    /// Nothing applied yet: the first settings take effect at once (a chain
    /// built mid-play for another device rate must not glide from defaults).
    fresh: bool,
}

impl Chain {
    pub fn new(sr: f64) -> Self {
        Self {
            sr,
            eq: Eq10::new(sr),
            sp: Sp::default(),
            spatial: Spatial::new(sr),
            rv: Rv::default(),
            reverb: Reverb::new(sr),
            vol: Smooth::new(0.8),
            norm: Smooth::new(1.0),
            fade: Ramp::new(1.0),
            boost: Smooth::new(1.0),
            lim: Limiter::new(sr),
            lim_on: false,
            e: vec![0.0; BLOCK * 2],
            ms: [0.0; 4],
            ms_i: 0,
            fresh: true,
        }
    }

    pub fn latency(&self) -> usize {
        self.lim.latency()
    }

    /// The reverb room the current settings need, if it is not the one loaded.
    pub fn wants_room(&self) -> Option<(f64, f64)> {
        let on = self.rv.on && self.rv.mix > 0.0;
        let sig = (self.rv.size.max(0.3), self.rv.tone);
        (on && self.reverb.sig != sig).then_some(sig)
    }

    pub fn room(&mut self, conv: conv::Stereo, sig: (f64, f64)) {
        self.reverb.swap(conv, sig);
    }

    pub fn apply(&mut self, s: &Set) {
        let sr = self.sr;
        let k = if std::mem::take(&mut self.fresh) { 0.0 } else { 1.0 };
        if let Some(p) = s.pre {
            self.eq.set_pre_in(p, 0.015 * k);
        }
        if let Some(eq) = &s.eq {
            self.eq.set_in(eq, 0.015 * k);
        }
        if let Some(v) = s.vol {
            self.vol.set(v.clamp(0.0, 1.0), 0.02 * k, sr);
        }
        if let Some((g, tau)) = s.norm {
            self.norm.set(g.clamp(0.0, 4.0), tau.max(0.0) * k, sr);
        }
        if let Some((v, sec)) = s.fade {
            self.fade.to(v.clamp(0.0, 1.0), sec * k, sr);
        }
        if let Some(b) = s.boost {
            self.boost.set(b.clamp(1.0, 3.0), 0.005 * k, sr);
        }
        if let Some(on) = s.lim {
            self.lim_on = on;
            self.lim.ceiling = if on { 10f64.powf(-1.0 / 20.0) } else { 1.0 };
        }
        if let Some(sp) = s.sp {
            self.sp = sp;
            self.spatial.set(&sp);
        }
        if let Some(rv) = s.rv {
            self.rv = rv;
            self.reverb.set(&rv);
        }
    }

    /// A seek or a new track: the look-ahead's old audio goes.
    pub fn flush(&mut self) {
        self.lim.clear();
    }

    pub fn limiting_db(&self) -> f64 {
        self.lim.reduction_db()
    }

    /// Mean square of the EQ output (what the levelling meter reads).
    pub fn level_ms(&self) -> f64 {
        self.ms.iter().sum::<f64>() / 4.0
    }

    /// One block of BLOCK stereo frames, in place.
    pub fn process(&mut self, buf: &mut [f32]) {
        debug_assert_eq!(buf.len(), BLOCK * 2);
        self.eq.process(buf);
        let mut s = 0.0f64;
        for f in buf.as_chunks::<2>().0 {
            let m = (f[0] as f64 + f[1] as f64) * 0.5;
            s += m * m;
        }
        self.ms[self.ms_i] = s / BLOCK as f64;
        self.ms_i = (self.ms_i + 1) % 4;
        self.e.copy_from_slice(buf);
        self.spatial.process(&self.e, buf, &self.sp);
        self.reverb.process(&self.e, buf);
        let unity = self.vol.settled()
            && self.vol.v == 1.0
            && self.norm.settled()
            && self.norm.v == 1.0
            && self.fade.settled()
            && self.fade.v == 1.0
            && self.boost.settled()
            && self.boost.v == 1.0;
        if !unity {
            for f in buf.as_chunks_mut::<2>().0 {
                let g = (self.vol.tick() * self.norm.tick() * self.fade.tick() * self.boost.tick()) as f32;
                f[0] *= g;
                f[1] *= g;
            }
        }
        self.lim.process(buf);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db(x: f64) -> f64 {
        20.0 * x.log10()
    }

    #[test]
    fn peaking_hits_its_gain_at_the_centre() {
        let c = Coef::peaking(1000.0, EQ_Q, 6.0, 48000.0);
        assert!((db(c.mag(1000.0, 48000.0)) - 6.0).abs() < 0.01);
        assert!(db(c.mag(50.0, 48000.0)).abs() < 0.1);
    }

    #[test]
    fn shelves_reach_their_gain_at_the_far_end() {
        let lo = Coef::lowshelf(32.0, 6.0, 48000.0);
        assert!((db(lo.mag(2.0, 48000.0)) - 6.0).abs() < 0.05);
        assert!((db(lo.mag(32.0, 48000.0)) - 3.0).abs() < 0.1);
        assert!(db(lo.mag(2000.0, 48000.0)).abs() < 0.05);
        let hi = Coef::highshelf(16000.0, -9.0, 48000.0);
        assert!((db(hi.mag(23900.0, 48000.0)) + 9.0).abs() < 0.3);
        assert!(db(hi.mag(1000.0, 48000.0)).abs() < 0.05);
    }

    #[test]
    fn lowpass_resonance_is_in_db() {
        let c = Coef::lowpass(1000.0, 1.0, 48000.0);
        // At the corner a Web Audio lowpass sits at its resonance, Q dB.
        assert!((db(c.mag(1000.0, 48000.0)) - 1.0).abs() < 0.05);
        assert!(db(c.mag(10.0, 48000.0)).abs() < 0.01);
    }

    fn noise(n: usize, amp: f32) -> Vec<f32> {
        let mut x = 0x1234_5678_9abc_def0u64;
        (0..n * 2)
            .map(|_| {
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                ((x >> 40) as f32 / (1u64 << 24) as f32 * 2.0 - 1.0) * amp
            })
            .collect()
    }

    #[test]
    fn flat_chain_is_bit_transparent() {
        let mut ch = Chain::new(48000.0);
        ch.apply(&Set { vol: Some(1.0), ..Default::default() });
        let la = ch.latency();
        let input = noise(BLOCK * 8, 0.9);
        let mut out = Vec::new();
        for b in input.chunks(BLOCK * 2) {
            let mut blk = b.to_vec();
            ch.process(&mut blk);
            out.extend_from_slice(&blk);
        }
        for i in 0..(BLOCK * 8 - la) * 2 {
            assert_eq!(out[i + la * 2], input[i], "sample {i}");
        }
    }

    #[test]
    fn eq_returns_to_transparent_after_a_boost() {
        let mut eq = Eq10::new(48000.0);
        let mut g = [0.0; 10];
        g[4] = 6.0;
        eq.set_in(&g, 0.015);
        let mut blk = noise(4800, 0.3);
        eq.process(&mut blk);
        eq.set_in(&[0.0; 10], 0.015);
        // Glide back and ring out.
        for _ in 0..40 {
            let mut b = noise(4800, 0.3);
            eq.process(&mut b);
        }
        assert!(eq.active.iter().all(|a| !a));
        let input = noise(4800, 0.3);
        let mut b = input.clone();
        eq.process(&mut b);
        assert_eq!(b, input);
    }

    #[test]
    fn eq_band_lifts_its_frequency() {
        let sr = 48000.0;
        let mut eq = Eq10::new(sr);
        let mut g = [0.0; 10];
        g[4] = 6.0;
        eq.set_in(&g, 0.015);
        let n = 48000;
        let mut buf: Vec<f32> = (0..n).flat_map(|i| {
            let v = (2.0 * PI * 1000.0 * i as f64 / sr).sin() as f32 * 0.25;
            [v, v]
        }).collect();
        eq.process(&mut buf);
        let tail = &buf[n..];
        let peak = tail.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!((db(peak as f64 / 0.25) - 6.0).abs() < 0.1, "{}", db(peak as f64 / 0.25));
    }

    #[test]
    fn limiter_never_passes_the_ceiling() {
        let mut lim = Limiter::new(48000.0);
        lim.ceiling = 10f64.powf(-1.0 / 20.0);
        let mut buf = noise(48000, 3.0);
        // A few isolated spikes on a quiet bed too.
        for i in (0..buf.len()).step_by(7919) {
            buf[i] = 8.0;
        }
        lim.process(&mut buf);
        let peak = buf.iter().fold(0.0f32, |m, v| m.max(v.abs()));
        assert!(peak as f64 <= lim.ceiling + 1e-6, "{peak}");
    }

    #[test]
    fn limiter_recovers_to_unity() {
        let sr = 48000.0;
        let mut lim = Limiter::new(sr);
        // A spike, then three seconds for the 150 ms release to finish.
        let mut buf = vec![0.0f32; 48000 * 2 * 3];
        buf[2000] = 4.0;
        lim.process(&mut buf);
        let mut quiet = noise(48000, 0.2);
        let copy = quiet.clone();
        lim.process(&mut quiet);
        let la = lim.latency();
        assert_eq!(&quiet[la * 2 + 2000..], &copy[2000..copy.len() - la * 2]);
    }

    #[test]
    fn binaural_puts_a_right_source_in_the_right_ear() {
        let sr = 48000.0;
        let mut b = Binaural::new(sr);
        let input = noise(BLOCK, 0.5);
        let mut out = vec![0.0f32; BLOCK * 2];
        let mut el = 0.0;
        let mut er = 0.0;
        for _ in 0..40 {
            b.process(&input, &mut out, [3.0, 0.0, 0.0], 0.02);
        }
        for _ in 0..10 {
            b.process(&input, &mut out, [3.0, 0.0, 0.0], 0.02);
            for f in out.as_chunks::<2>().0 {
                el += (f[0] as f64).powi(2);
                er += (f[1] as f64).powi(2);
            }
        }
        assert!(er > el * 4.0, "left {el} right {er}");
        let (d, _, g) = b.params();
        assert!(d[0] > d[1]);
        assert!((g - distance_gain(3.0)).abs() < 1e-3);
    }

    #[test]
    fn spatial_branch_unplugs_after_fading_out() {
        let mut ch = Chain::new(48000.0);
        ch.apply(&Set { vol: Some(1.0), sp: Some(Sp { on: true, ..Sp::default() }), ..Default::default() });
        let mut blk = noise(BLOCK, 0.2);
        for _ in 0..50 {
            ch.process(&mut blk);
        }
        assert!(ch.spatial.wired);
        ch.apply(&Set { sp: Some(Sp { on: false, ..Sp::default() }), ..Default::default() });
        for _ in 0..400 {
            let mut b = noise(BLOCK, 0.2);
            ch.process(&mut b);
        }
        assert!(!ch.spatial.wired);
    }

    #[test]
    fn spectrum_finds_a_tone_in_its_bin() {
        let sr = 48000.0;
        let mut s = Spectrum::new();
        let f = 32.0 * sr / FFT as f64;
        // Quiet enough to stay inside the −100‥−30 dB byte range.
        let a = 0.01;
        let x: Vec<f32> = (0..FFT).map(|i| (2.0 * PI * f * i as f64 / sr).sin() as f32 * a as f32).collect();
        let mut b = vec![];
        for _ in 0..60 {
            b = s.bytes(&x);
        }
        let (imax, _) = b.iter().enumerate().max_by_key(|(_, v)| **v).unwrap();
        assert_eq!(imax, 32);
        // Blackman coherent gain 0.42, half the amplitude per side.
        let want = 255.0 * (db(a * 0.42 / 2.0 * SPECTRUM_SCALE) + 100.0) / 70.0;
        assert!((b[32] as f64 - want).abs() <= 2.0, "{} vs {}", b[32], want);
    }

    #[test]
    fn ramp_and_smooth_behave_like_audio_params() {
        let mut r = Ramp::new(1.0);
        r.to(0.0, 0.01, 1000.0);
        let v: Vec<f64> = (0..10).map(|_| r.tick()).collect();
        assert!((v[4] - 0.5).abs() < 1e-9 && v[9] == 0.0 && r.settled());
        let mut s = Smooth::new(0.0);
        s.set(1.0, 0.1, 1000.0);
        for _ in 0..100 {
            s.tick();
        }
        assert!((s.v - (1.0 - (-1f64).exp())).abs() < 1e-3);
    }
}
