//! Convolution reverb: non-uniformly partitioned, so a 5-second church costs
//! about as much as a short room.
//!
//! The head of the impulse response runs in 512-sample partitions inside
//! the render block (no added latency); the middle in 2048-sample ones and
//! the tail in 8192-sample ones, each computed one block of its own size
//! ahead of when it is heard — those parts of the response start late
//! enough that the wait is hidden. The response itself is generated, as the
//! Web Audio graph generated it, and scaled the way a ConvolverNode with
//! `normalize = true` scales it, so the reverb sits at the level it had.

use realfft::num_complex::Complex;
use realfft::{ComplexToReal, RealFftPlanner, RealToComplex};
use std::sync::Arc;

pub const BLOCK: usize = 512;

struct Seg {
    b: usize,
    parts: Vec<Vec<Complex<f32>>>,
    fdl: Vec<Vec<Complex<f32>>>,
    at: usize,
    /// [previous block | current block] of input.
    inbuf: Vec<f32>,
    fill: usize,
    out_cur: Vec<f32>,
    out_pos: usize,
    fwd: Arc<dyn RealToComplex<f32>>,
    inv: Arc<dyn ComplexToReal<f32>>,
    spec: Vec<Complex<f32>>,
    acc: Vec<Complex<f32>>,
    tmp: Vec<f32>,
    head: bool,
}

impl Seg {
    fn new(planner: &mut RealFftPlanner<f32>, ir: &[f32], b: usize, head: bool) -> Self {
        let fwd = planner.plan_fft_forward(2 * b);
        let inv = planner.plan_fft_inverse(2 * b);
        let n = ir.len().div_ceil(b).max(1);
        let mut parts = Vec::with_capacity(n);
        for p in 0..n {
            let mut buf = vec![0.0f32; 2 * b];
            let lo = p * b;
            let hi = ((p + 1) * b).min(ir.len());
            if lo < hi {
                buf[..hi - lo].copy_from_slice(&ir[lo..hi]);
            }
            let mut out = fwd.make_output_vec();
            let _ = fwd.process(&mut buf, &mut out);
            parts.push(out);
        }
        let fdl = (0..n).map(|_| vec![Complex::new(0.0, 0.0); b + 1]).collect();
        Self {
            b,
            parts,
            fdl,
            at: 0,
            inbuf: vec![0.0; 2 * b],
            fill: 0,
            out_cur: vec![0.0; b],
            out_pos: 0,
            spec: fwd.make_output_vec(),
            acc: vec![Complex::new(0.0, 0.0); b + 1],
            tmp: vec![0.0; 2 * b],
            fwd,
            inv,
            head,
        }
    }

    /// The convolution of the input so far with this segment's partitions:
    /// the next `b` output samples of the partitioned sum.
    fn compute(&mut self) {
        let b = self.b;
        self.tmp.copy_from_slice(&self.inbuf);
        let _ = self.fwd.process(&mut self.tmp, &mut self.spec);
        self.at = (self.at + 1) % self.fdl.len();
        self.fdl[self.at].copy_from_slice(&self.spec);
        for c in self.acc.iter_mut() {
            *c = Complex::new(0.0, 0.0);
        }
        let n = self.parts.len();
        for p in 0..n {
            let x = &self.fdl[(self.at + n - p) % n];
            let h = &self.parts[p];
            for ((a, xv), hv) in self.acc.iter_mut().zip(x.iter()).zip(h.iter()) {
                *a += xv * hv;
            }
        }
        // DC and Nyquist bins of a real signal's spectrum are real.
        self.acc[0].im = 0.0;
        self.acc[b].im = 0.0;
        let _ = self.inv.process(&mut self.acc, &mut self.tmp);
        let k = 1.0 / (2 * b) as f32;
        for (o, v) in self.out_cur.iter_mut().zip(self.tmp[b..].iter()) {
            *o = v * k;
        }
        self.out_pos = 0;
        // Slide the input window.
        self.inbuf.copy_within(b.., 0);
    }

    fn reset(&mut self) {
        for f in self.fdl.iter_mut() {
            f.iter_mut().for_each(|c| *c = Complex::new(0.0, 0.0));
        }
        self.inbuf.iter_mut().for_each(|v| *v = 0.0);
        self.out_cur.iter_mut().for_each(|v| *v = 0.0);
        self.fill = 0;
        self.out_pos = 0;
    }

    fn process(&mut self, input: &[f32], out: &mut [f32]) {
        let n = input.len();
        if self.head {
            // b == BLOCK: in and out within the same block.
            self.inbuf[self.b..].copy_from_slice(input);
            self.compute();
            for (o, v) in out.iter_mut().zip(self.out_cur.iter()) {
                *o += v;
            }
            return;
        }
        for (o, v) in out.iter_mut().zip(self.out_cur[self.out_pos..self.out_pos + n].iter()) {
            *o += v;
        }
        self.out_pos += n;
        self.inbuf[self.b + self.fill..self.b + self.fill + n].copy_from_slice(input);
        self.fill += n;
        if self.fill == self.b {
            self.fill = 0;
            self.compute();
        }
    }
}

/// One channel of convolution.
pub struct Convolver {
    segs: Vec<Seg>,
}

impl Convolver {
    pub fn new(ir: &[f32]) -> Self {
        let mut planner = RealFftPlanner::<f32>::new();
        let mut segs = Vec::new();
        let head_end = ir.len().min(2048);
        segs.push(Seg::new(&mut planner, &ir[..head_end], BLOCK, true));
        if ir.len() > 2048 {
            let mid_end = ir.len().min(8192);
            segs.push(Seg::new(&mut planner, &ir[2048..mid_end], 2048, false));
        }
        if ir.len() > 8192 {
            segs.push(Seg::new(&mut planner, &ir[8192..], 8192, false));
        }
        Self { segs }
    }

    /// Forgets the input heard so far (no tail of old audio).
    pub fn reset(&mut self) {
        self.segs.iter_mut().for_each(Seg::reset);
    }

    /// One block of exactly `BLOCK` samples.
    pub fn process(&mut self, input: &[f32], out: &mut [f32]) {
        debug_assert_eq!(input.len(), BLOCK);
        out.iter_mut().for_each(|v| *v = 0.0);
        for s in self.segs.iter_mut() {
            s.process(input, out);
        }
    }
}

/// Two channels, each convolved with its own response (a ConvolverNode with
/// a stereo buffer and stereo input).
pub struct Stereo {
    l: Convolver,
    r: Convolver,
    bl: Vec<f32>,
    br: Vec<f32>,
    ol: Vec<f32>,
    or: Vec<f32>,
}

impl Stereo {
    pub fn new(ir: &[Vec<f32>; 2]) -> Self {
        Self {
            l: Convolver::new(&ir[0]),
            r: Convolver::new(&ir[1]),
            bl: vec![0.0; BLOCK],
            br: vec![0.0; BLOCK],
            ol: vec![0.0; BLOCK],
            or: vec![0.0; BLOCK],
        }
    }

    pub fn reset(&mut self) {
        self.l.reset();
        self.r.reset();
    }

    /// `input` is BLOCK interleaved stereo frames; `out` gets the wet signal.
    pub fn process(&mut self, input: &[f32], out: &mut [f32]) {
        for i in 0..BLOCK {
            self.bl[i] = input[i * 2];
            self.br[i] = input[i * 2 + 1];
        }
        self.l.process(&self.bl, &mut self.ol);
        self.r.process(&self.br, &mut self.or);
        for i in 0..BLOCK {
            out[i * 2] = self.ol[i];
            out[i * 2 + 1] = self.or[i];
        }
    }
}

/// xorshift64*: noise for the generated responses.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        let v = x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 40;
        (v as f32 / (1u64 << 24) as f32) * 2.0 - 1.0
    }
}

/// The scale a ConvolverNode applies with `normalize = true` (the Web Audio
/// spec's algorithm, as Chromium and WebKit implement it).
pub fn normalize(ir: &mut [Vec<f32>; 2], sr: f32) {
    let len = ir[0].len().max(1);
    let power: f64 = ir.iter().map(|c| c.iter().map(|v| (*v as f64) * (*v as f64)).sum::<f64>()).sum();
    let mut power = (power / (2.0 * len as f64)).sqrt() as f32;
    if !power.is_finite() || power < 0.000_125 {
        power = 0.000_125;
    }
    let mut scale = 1.0 / power;
    scale *= 10f32.powf(-58.0 / 20.0);
    scale *= 44100.0 / sr;
    for c in ir.iter_mut() {
        for v in c.iter_mut() {
            *v *= scale;
        }
    }
}

/// The 3D mode's hall (app.js `ir(ctx, "hall")`): a decaying noise burst with
/// a short gap before it, the right channel a touch quieter for width.
pub fn hall_ir(sr: f32) -> [Vec<f32>; 2] {
    let (len, decay, pre) = (1.5f32, 2.8f32, 0.012f32);
    let n = (sr * len) as usize;
    let pre_n = (sr * pre) as usize;
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut out = [vec![0.0f32; n], vec![0.0f32; n]];
    for (c, ch) in out.iter_mut().enumerate() {
        for (i, v) in ch.iter_mut().enumerate() {
            if i < pre_n {
                continue;
            }
            let x = (i - pre_n) as f32 / (n - pre_n) as f32;
            *v = rng.next() * (1.0 - x).powf(decay) * if c == 1 { 0.94 } else { 1.0 };
        }
    }
    normalize(&mut out, sr);
    out
}

/// The reverb send's room (app.js `reverbIR`): decorrelated noise falling
/// 60 dB over `sec`, darkened over time by a closing one-pole low-pass, with
/// a 4 ms fade-in.
pub fn reverb_ir(sr: f32, sec: f32, tone: f32) -> [Vec<f32>; 2] {
    let sec = sec.max(0.3);
    let len = ((sr * sec) as usize).max(1);
    let k60 = 6.9 / sec;
    let a0 = 0.25 + 0.7 * tone / 100.0;
    let a1 = a0 * 0.25;
    let ramp = (sr * 0.004) as usize;
    let mut out = [vec![0.0f32; len], vec![0.0f32; len]];
    for (c, ch) in out.iter_mut().enumerate() {
        let mut rng = Rng(0xD1B5_4A32_D192_ED03 ^ (c as u64 + 1).wrapping_mul(0x9E37_79B9));
        let mut y = 0.0f32;
        for (i, v) in ch.iter_mut().enumerate() {
            let t = i as f32 / sr;
            let a = a0 + (a1 - a0) * (t / sec);
            y += a * (rng.next() * (-k60 * t).exp() - y);
            *v = if i < ramp { y * i as f32 / ramp as f32 } else { y };
        }
    }
    normalize(&mut out, sr);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn direct(x: &[f32], h: &[f32]) -> Vec<f32> {
        let mut y = vec![0.0f32; x.len()];
        for n in 0..x.len() {
            let mut s = 0.0f64;
            for (k, hv) in h.iter().enumerate() {
                if k > n {
                    break;
                }
                s += x[n - k] as f64 * *hv as f64;
            }
            y[n] = s as f32;
        }
        y
    }

    #[test]
    fn partitioned_equals_direct() {
        // A response long enough to reach the third segment.
        let mut rng = Rng(42);
        let h: Vec<f32> = (0..12000).map(|i| rng.next() * (-(i as f32) / 3000.0).exp()).collect();
        let x: Vec<f32> = (0..BLOCK * 40).map(|_| rng.next()).collect();
        let want = direct(&x, &h);
        let mut c = Convolver::new(&h);
        let mut got = Vec::new();
        let mut out = vec![0.0f32; BLOCK];
        for blk in x.chunks(BLOCK) {
            c.process(blk, &mut out);
            got.extend_from_slice(&out);
        }
        let err: f64 = want.iter().zip(got.iter()).map(|(a, b)| ((a - b) as f64).powi(2)).sum();
        let pow: f64 = want.iter().map(|a| (*a as f64).powi(2)).sum();
        assert!(10.0 * (err / pow).log10() < -80.0, "error {} dB", 10.0 * (err / pow).log10());
    }

    #[test]
    fn generated_rooms_are_normalised() {
        let ir = reverb_ir(48000.0, 2.4, 52.0);
        assert_eq!(ir[0].len(), (48000.0 * 2.4) as usize);
        let p: f64 = ir.iter().map(|c| c.iter().map(|v| (*v as f64).powi(2)).sum::<f64>()).sum();
        let rms = (p / (2.0 * ir[0].len() as f64)).sqrt();
        // 1/rms scaled by -58 dB and 44.1/48: the rms after scaling is that constant.
        let want = 10f64.powf(-58.0 / 20.0) * 44100.0 / 48000.0;
        assert!((rms / want - 1.0).abs() < 1e-3, "{rms} vs {want}");
        let h = hall_ir(44100.0);
        assert_eq!(h[0].len(), (44100.0 * 1.5) as usize);
        assert!(h[0][..(44100.0 * 0.012) as usize].iter().all(|v| *v == 0.0));
    }
}
