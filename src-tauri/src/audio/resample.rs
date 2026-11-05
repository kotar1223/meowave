//! Variable-ratio band-limited interpolation (windowed sinc), stereo.
//!
//! One resampler does two jobs: the device's rate (a 44.1 kHz track on a
//! 48 kHz output) and the speed control, where slowed and nightcore move
//! the pitch with the tempo exactly like a record played at another speed.
//! The ratio may change between blocks without a click; going faster than
//! the input's own band allows, the kernel widens and its cutoff drops, so
//! nightcore does not alias.

const NZ: f64 = 32.0;
const NP: usize = 256;
/// Passband edge as a fraction of the lower Nyquist frequency.
const FC: f64 = 0.94;
const BETA: f64 = 8.5;
/// Zero frames ahead of the first real one, so the first output sample has
/// its full kernel.
const PAD: usize = 192;

fn bessel_i0(x: f64) -> f64 {
    let mut sum = 1.0;
    let mut term = 1.0;
    let q = x * x / 4.0;
    for k in 1..64 {
        term *= q / (k as f64 * k as f64);
        sum += term;
        if term < sum * 1e-17 {
            break;
        }
    }
    sum
}

pub struct Resampler {
    /// One side of the windowed sinc, `NP` points per zero crossing.
    table: Vec<f32>,
    /// Stereo frames; `buf[0]` is input frame `base`.
    buf: Vec<f32>,
    base: i64,
    /// Input position (frames, absolute) of the next output frame.
    t: f64,
    w: Vec<f32>,
}

impl Default for Resampler {
    fn default() -> Self {
        Self::new()
    }
}

impl Resampler {
    pub fn new() -> Self {
        let n = (NZ as usize) * NP + 2;
        let i0b = bessel_i0(BETA);
        let table = (0..n)
            .map(|i| {
                let x = i as f64 / NP as f64; // in zero crossings
                if x >= NZ {
                    return 0.0;
                }
                let sinc = if x == 0.0 { 1.0 } else { (std::f64::consts::PI * x).sin() / (std::f64::consts::PI * x) };
                let r = x / NZ;
                let win = bessel_i0(BETA * (1.0 - r * r).max(0.0).sqrt()) / i0b;
                (sinc * win) as f32
            })
            .collect();
        let mut s = Self { table, buf: Vec::new(), base: 0, t: 0.0, w: Vec::new() };
        s.reset(0);
        s
    }

    /// Forgets everything; the next pushed frame is input frame `at`.
    pub fn reset(&mut self, at: u64) {
        self.buf.clear();
        self.buf.resize(PAD * 2, 0.0);
        self.base = at as i64 - PAD as i64;
        self.t = at as f64;
    }

    pub fn push(&mut self, frames: &[f32]) {
        self.buf.extend_from_slice(frames);
    }

    /// Input position (absolute frames) of the next output frame.
    pub fn pos(&self) -> f64 {
        self.t
    }

    fn cutoff(ratio: f64) -> f64 {
        FC * if ratio > 1.0 { 1.0 / ratio } else { 1.0 }
    }

    /// Input frames the kernel reaches past the current position.
    pub fn reach(ratio: f64) -> usize {
        (NZ / Self::cutoff(ratio)).ceil() as usize + 1
    }

    /// Input frames needed (beyond what is buffered) to make `frames` output frames.
    pub fn need(&self, frames: usize, ratio: f64) -> usize {
        let last = self.t + ratio * frames as f64 + Self::reach(ratio) as f64;
        let have = (self.base + (self.buf.len() / 2) as i64) as f64;
        (last - have).ceil().max(0.0) as usize
    }

    /// Up to `frames` output frames into `out` (stereo); returns how many.
    /// Fewer when the input runs out; `flush` pads the end with silence so
    /// the last real frames come out too.
    pub fn produce(&mut self, out: &mut Vec<f32>, frames: usize, ratio: f64, flush: bool) -> usize {
        let ratio = ratio.clamp(0.05, 16.0);
        let reach = Self::reach(ratio) as i64;
        if flush {
            let pad = (reach as usize + 2) * 2;
            self.buf.extend(std::iter::repeat_n(0.0, pad));
        }
        let end = self.base + (self.buf.len() / 2) as i64;
        let exact = (ratio - 1.0).abs() < 1e-12 && self.t.fract() == 0.0;
        let fc = Self::cutoff(ratio);
        let mut made = 0;
        out.clear();
        while made < frames {
            let ti = self.t.floor() as i64;
            if ti + reach >= end {
                break;
            }
            if exact {
                let i = ((ti - self.base) * 2) as usize;
                out.push(self.buf[i]);
                out.push(self.buf[i + 1]);
                self.t += 1.0;
                made += 1;
                continue;
            }
            let frac = self.t - ti as f64;
            let lo = ti - reach + 1;
            self.w.clear();
            let scale = fc * NP as f64;
            let mut wsum = 0.0f64;
            for j in lo..=ti + reach {
                let d = ((j as f64 - ti as f64) - frac).abs() * scale;
                let k = d as usize;
                let wv = if k + 1 < self.table.len() {
                    let a = (d - k as f64) as f32;
                    self.table[k] + (self.table[k + 1] - self.table[k]) * a
                } else {
                    0.0
                };
                wsum += wv as f64;
                self.w.push(wv);
            }
            // Normalise the DC gain exactly: no level wobble as the phase moves.
            let g = if wsum.abs() > 1e-9 { (1.0 / wsum) as f32 } else { 0.0 };
            let mut l = 0.0f32;
            let mut r = 0.0f32;
            let start = ((lo - self.base) * 2) as usize;
            for (n, wv) in self.w.iter().enumerate() {
                let i = start + n * 2;
                l += self.buf[i] * wv;
                r += self.buf[i + 1] * wv;
            }
            out.push(l * g);
            out.push(r * g);
            self.t += ratio;
            made += 1;
        }
        // Keep only the history a kernel can still reach (PAD covers any ratio up to ~5×).
        let keep_from = (self.t.floor() as i64 - PAD as i64).max(self.base);
        let drop = (keep_from - self.base) as usize;
        if drop > 4096 {
            self.buf.drain(..drop * 2);
            self.base += drop as i64;
        }
        made
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sine(f: f64, sr: f64, n: usize) -> Vec<f32> {
        (0..n)
            .flat_map(|i| {
                let v = (2.0 * std::f64::consts::PI * f * i as f64 / sr).sin() as f32 * 0.5;
                [v, v]
            })
            .collect()
    }

    /// Power of the residual after removing the best-fitting sine at `f`
    /// (a true least-squares fit: the window need not hold whole periods).
    fn residual_db(x: &[f32], f: f64, sr: f64) -> f64 {
        let n = x.len() / 2;
        let (mut ss, mut cc, mut sc, mut xs, mut xc) = (0.0, 0.0, 0.0, 0.0, 0.0);
        for i in 0..n {
            let ph = 2.0 * std::f64::consts::PI * f * i as f64 / sr;
            let (s, c) = ph.sin_cos();
            let v = x[i * 2] as f64;
            ss += s * s;
            cc += c * c;
            sc += s * c;
            xs += v * s;
            xc += v * c;
        }
        let det = ss * cc - sc * sc;
        let a = (xs * cc - xc * sc) / det;
        let b = (xc * ss - xs * sc) / det;
        let mut e = 0.0;
        let mut p = 0.0;
        for i in 0..n {
            let ph = 2.0 * std::f64::consts::PI * f * i as f64 / sr;
            let fit = a * ph.sin() + b * ph.cos();
            e += (x[i * 2] as f64 - fit).powi(2);
            p += fit * fit;
        }
        10.0 * (e / p).log10()
    }

    fn run(input: &[f32], ratio: f64) -> Vec<f32> {
        let mut r = Resampler::new();
        r.push(input);
        let mut all = Vec::new();
        let mut blk = Vec::new();
        loop {
            let n = r.produce(&mut blk, 512, ratio, false);
            all.extend_from_slice(&blk);
            if n < 512 {
                break;
            }
        }
        all
    }

    #[test]
    fn passthrough_is_bit_exact() {
        let x = sine(1000.0, 48000.0, 9000);
        let y = run(&x, 1.0);
        assert!(y.len() > 8000);
        assert_eq!(&y[..8000], &x[..8000]);
    }

    #[test]
    fn upsampling_is_clean() {
        // 44.1 kHz → 48 kHz, 1 kHz tone: everything but the tone below -90 dB.
        let x = sine(1000.0, 44100.0, 44100);
        let y = run(&x, 44100.0 / 48000.0);
        let mid = &y[2000 * 2..40000 * 2];
        let r = residual_db(mid, 1000.0, 48000.0);
        assert!(r < -90.0, "residual {r} dB");
    }

    #[test]
    fn high_tones_survive_and_level_holds() {
        // 18 kHz at 44.1 → 48: still there at (almost) full level.
        let x = sine(18000.0, 44100.0, 44100);
        let y = run(&x, 44100.0 / 48000.0);
        let mid = &y[2000 * 2..40000 * 2];
        let rms = (mid.iter().map(|v| (*v as f64).powi(2)).sum::<f64>() / mid.len() as f64).sqrt();
        let want = 0.5 / 2f64.sqrt();
        assert!((rms / want - 1.0).abs() < 0.02, "rms {rms} vs {want}");
        assert!(residual_db(mid, 18000.0, 48000.0) < -60.0);
    }

    #[test]
    fn downsampling_removes_what_cannot_be_kept() {
        // 23 kHz at 48 kHz has no place at 44.1 kHz: it must vanish, not fold to 21.1 kHz.
        let x = sine(23000.0, 48000.0, 48000);
        let y = run(&x, 48000.0 / 44100.0);
        let mid = &y[2000 * 2..38000 * 2];
        let rms = (mid.iter().map(|v| (*v as f64).powi(2)).sum::<f64>() / mid.len() as f64).sqrt();
        assert!(20.0 * (rms / 0.3535).log10() < -60.0, "alias {rms}");
    }

    #[test]
    fn speed_changes_pitch_like_a_record() {
        // 1.25× on the same rate: a 1 kHz tone comes out at 1.25 kHz.
        let x = sine(1000.0, 48000.0, 48000);
        let y = run(&x, 1.25);
        let mid = &y[2000 * 2..30000 * 2];
        assert!(residual_db(mid, 1250.0, 48000.0) < -70.0);
    }

    #[test]
    fn ratio_can_move_between_blocks() {
        let x = sine(440.0, 48000.0, 96000);
        let mut r = Resampler::new();
        r.push(&x);
        let mut blk = Vec::new();
        let mut prev: Option<f32> = None;
        let mut worst = 0.0f32;
        for i in 0..100 {
            let ratio = 0.8 + 0.4 * ((i as f64) / 100.0);
            r.produce(&mut blk, 256, ratio, false);
            if let Some(p) = prev {
                worst = worst.max((blk[0] - p).abs());
            }
            prev = blk.get(blk.len() - 2).copied();
        }
        // No jump at block edges larger than a 440 Hz sine moves per sample (×2 margin).
        assert!(worst < 0.5 * 2.0 * std::f32::consts::PI * 440.0 * 1.2 / 48000.0 * 2.0, "jump {worst}");
    }
}
