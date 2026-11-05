//! Just enough of MP4 to start a DASH stream fast and seek in it cheaply.
//!
//! YouTube's audio (and SoundCloud's CMAF) is fragmented MP4: a small header
//! (`ftyp`, `moov`, a `sidx` segment index) and then dozens of `moof`+`mdat`
//! fragments. Handed a seekable file, the demuxer walks every top-level atom
//! before the first packet, which over the network means waiting for most
//! of the file. So the engine reads the layout itself: when `moov` comes
//! first the file is probed as a stream, and with a complete `sidx` a seek
//! enters the file at the right fragment (see `source::Spliced`).

use super::source::HttpSource;
use std::io;

#[derive(Debug, Clone, PartialEq)]
pub struct Frag {
    pub off: u64,
    /// Start time in seconds.
    pub t: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Frags {
    /// Bytes before the first fragment (ftyp, moov, sidx…).
    pub head_len: u64,
    pub list: Vec<Frag>,
    pub dur: f64,
}

impl Frags {
    /// The fragment holding second `t`.
    pub fn at(&self, t: f64) -> usize {
        self.list.iter().rposition(|f| f.t <= t + 1e-6).unwrap_or_default()
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct Layout {
    /// `moov` precedes the first `mdat`/`moof`: probing can read it as a stream.
    pub moov_first: bool,
    pub frags: Option<Frags>,
}

fn be32(b: &[u8]) -> u64 {
    u32::from_be_bytes([b[0], b[1], b[2], b[3]]) as u64
}
fn be64(b: &[u8]) -> u64 {
    u64::from_be_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]])
}

/// Parses a `sidx` body (after its 8-byte header) found at `atom_end` (the
/// first byte after the atom).
pub fn parse_sidx(body: &[u8], atom_end: u64) -> Option<Frags> {
    if body.len() < 12 {
        return None;
    }
    let version = body[0];
    let timescale = be32(&body[8..12]) as f64;
    if timescale <= 0.0 {
        return None;
    }
    let (ept, first, mut p) = if version == 0 {
        if body.len() < 24 {
            return None;
        }
        (be32(&body[12..16]), be32(&body[16..20]), 20usize)
    } else {
        if body.len() < 32 {
            return None;
        }
        (be64(&body[12..20]), be64(&body[20..28]), 28usize)
    };
    let count = u16::from_be_bytes([body[p + 2], body[p + 3]]) as usize;
    p += 4;
    if body.len() < p + count * 12 || count == 0 {
        return None;
    }
    let mut off = atom_end + first;
    let mut cum = ept as f64;
    let mut list = Vec::with_capacity(count);
    for i in 0..count {
        let r = &body[p + i * 12..p + i * 12 + 12];
        let a = be32(&r[0..4]);
        if a >> 31 == 1 {
            // A hierarchy of indexes: not worth following for audio.
            return None;
        }
        let size = a & 0x7fff_ffff;
        let dur = be32(&r[4..8]) as f64;
        list.push(Frag { off, t: cum / timescale });
        off += size;
        cum += dur;
    }
    Some(Frags { head_len: atom_end + first, list, dur: cum / timescale })
}

/// Walks the top-level atoms up to the first fragment or media data.
pub fn scan(src: &mut HttpSource) -> io::Result<Layout> {
    let total = src.len();
    let mut pos = 0u64;
    let mut out = Layout::default();
    let mut moov = false;
    let mut sidx: Option<Frags> = None;
    for _ in 0..64 {
        let h = src.peek_at(pos, 16)?;
        if h.len() < 8 {
            break;
        }
        let mut size = be32(&h[0..4]);
        let kind = &h[4..8];
        let mut hdr = 8u64;
        if size == 1 {
            if h.len() < 16 {
                break;
            }
            size = be64(&h[8..16]);
            hdr = 16;
        }
        if size == 0 {
            // To the end of the file.
            if kind == b"moov" {
                moov = true;
            }
            break;
        }
        if size < hdr {
            break;
        }
        match kind {
            b"moov" => moov = true,
            b"sidx" if sidx.is_none() && size < 4 * 1024 * 1024 => {
                let body = src.peek_at(pos + hdr, (size - hdr) as usize)?;
                sidx = parse_sidx(&body, pos + size);
            }
            b"moof" | b"mdat" => {
                out.moov_first = moov;
                if kind == b"moof" {
                    if let Some(f) = sidx.take() {
                        // Trust the index only if it lines up with the file.
                        let last_end_ok = match total {
                            Some(n) => f.list.last().map(|l| l.off < n).unwrap_or(false),
                            None => true,
                        };
                        if f.head_len == pos && f.list.len() > 1 && last_end_ok {
                            out.frags = Some(f);
                        }
                    }
                }
                return Ok(out);
            }
            _ => {}
        }
        pos += size;
        if total.is_some_and(|n| pos >= n) {
            break;
        }
    }
    out.moov_first = moov;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sidx_v0_lists_fragments() {
        // version 0, ref id 1, timescale 1000, ept 0, first_offset 0, 2 refs.
        let mut b = vec![0u8, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0x03, 0xe8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
        for (size, dur) in [(1000u32, 10_000u32), (2000, 10_000)] {
            b.extend_from_slice(&size.to_be_bytes());
            b.extend_from_slice(&dur.to_be_bytes());
            b.extend_from_slice(&0x9000_0000u32.to_be_bytes());
        }
        let f = parse_sidx(&b, 1019).unwrap();
        assert_eq!(f.head_len, 1019);
        assert_eq!(f.list, vec![Frag { off: 1019, t: 0.0 }, Frag { off: 2019, t: 10.0 }]);
        assert_eq!(f.dur, 20.0);
        assert_eq!(f.at(0.0), 0);
        assert_eq!(f.at(9.99), 0);
        assert_eq!(f.at(10.0), 1);
        assert_eq!(f.at(99.0), 1);
    }

    #[test]
    fn hierarchical_sidx_is_ignored() {
        let mut b = vec![0u8, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0x03, 0xe8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1];
        b.extend_from_slice(&(0x8000_0000u32 | 500).to_be_bytes());
        b.extend_from_slice(&10u32.to_be_bytes());
        b.extend_from_slice(&0u32.to_be_bytes());
        assert!(parse_sidx(&b, 100).is_none());
    }
}
