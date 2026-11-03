//! "Is this hit the same recording?" — shared by every cross-service lookup.
//!
//! The old rescue paths only compared durations, and accepted anything when
//! the original had no usable length. That is how a SoundCloud upload ended up
//! playing a different song from YouTube Music: the first search hit within a
//! quarter of a minute won, whatever its title said. Every lookup now has to
//! agree on the title words, on the artist (or, failing that, on a near-exact
//! length), and must not add a version word the original does not have
//! ("Live", "Remix", "Karaoke" …). No match is a better answer than a wrong one:
//! the caller reports it and moves on instead of playing someone else's song.

use crate::api::Track;

/// Words that turn a song into a different recording of it.
const VERSION_WORDS: &[&str] = &[
    "remix", "live", "cover", "karaoke", "instrumental", "nightcore", "sped", "slowed", "reverb",
    "acoustic", "mashup", "tribute", "8d", "bassboosted", "minus", "acapella", "demo", "orchestral",
    "piano", "lofi", "edit", "version", "rmx", "vip", "bootleg", "flip", "remake", "parody",
    // Cyrillic, already transliterated by `fold`.
    "remiks", "kaver", "karaoke", "minus", "lajv", "akustika",
];

/// Words that decorate a title on video sites and say nothing about the song.
const NOISE_WORDS: &[&str] = &[
    "official", "video", "audio", "lyrics", "lyric", "music", "hd", "hq", "4k", "mv", "clip",
    "visualizer", "visualiser", "the", "a", "feat", "ft", "featuring", "prod", "topic", "full",
    "original", "mix", "explicit", "clean", "single", "remastered", "remaster", "premiere", "with",
    "x", "and", "i", "klip", "oficialnyj", "premera", "tekst", "pesni", "audio", "ofitsialnyy",
];

fn translit(c: char) -> Option<&'static str> {
    Some(match c {
        'а' => "a", 'б' => "b", 'в' => "v", 'г' => "g", 'д' => "d", 'е' | 'ё' | 'э' => "e",
        'ж' => "zh", 'з' => "z", 'и' | 'й' | 'ы' => "i", 'к' => "k", 'л' => "l", 'м' => "m",
        'н' => "n", 'о' => "o", 'п' => "p", 'р' => "r", 'с' => "s", 'т' => "t", 'у' => "u",
        'ф' => "f", 'х' => "h", 'ц' => "c", 'ч' => "ch", 'ш' => "sh", 'щ' => "sch", 'ъ' | 'ь' => "",
        'ю' => "yu", 'я' => "ya", 'і' => "i", 'ї' => "i", 'є' => "e", 'ґ' => "g",
        _ => return None,
    })
}

/// Lower-cased, transliterated, punctuation turned into spaces.
///
/// Transliteration is what lets "Кино" find "Kino": the two services spell the
/// same artist in different alphabets far more often than they disagree on it.
pub fn fold(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars().flat_map(|c| c.to_lowercase()) {
        if let Some(t) = translit(ch) {
            out.push_str(t);
        } else if ch.is_alphanumeric() {
            // Latin diacritics: keep the base letter.
            let base = match ch {
                'á' | 'à' | 'â' | 'ä' | 'ã' | 'å' => 'a',
                'é' | 'è' | 'ê' | 'ë' => 'e',
                'í' | 'ì' | 'î' | 'ï' => 'i',
                'ó' | 'ò' | 'ô' | 'ö' | 'õ' | 'ø' => 'o',
                'ú' | 'ù' | 'û' | 'ü' => 'u',
                'ñ' => 'n', 'ç' => 'c', 'ß' => 's', 'ý' | 'ÿ' => 'y',
                other => other,
            };
            out.push(base);
        } else if ch == '\'' || ch == '’' || ch == '`' {
            // "don't" and "dont" are the same word.
        } else {
            out.push(' ');
        }
    }
    // Spelling variants that show up between catalogues.
    out.replace(" and ", " ").replace("&", " ")
}

/// Meaningful words of a title or artist string.
pub fn words(s: &str) -> Vec<String> {
    let folded = fold(s);
    let all: Vec<String> = folded.split_whitespace().map(|w| w.to_string()).collect();
    let kept: Vec<String> = all
        .iter()
        .filter(|w| !NOISE_WORDS.contains(&w.as_str()))
        .cloned()
        .collect();
    if kept.is_empty() {
        all
    } else {
        kept
    }
}

fn version_words(s: &str) -> Vec<String> {
    let folded = fold(s);
    let mut out: Vec<String> = folded
        .split_whitespace()
        .filter(|w| VERSION_WORDS.contains(w))
        .map(|w| w.to_string())
        .collect();
    let joined: String = folded.split_whitespace().collect();
    if joined.contains("bassboosted") && !out.iter().any(|w| w == "bassboosted") {
        out.push("bassboosted".into());
    }
    out
}

fn coverage(want: &[String], got: &[String]) -> f32 {
    if want.is_empty() {
        return 1.0;
    }
    let hit = want.iter().filter(|w| got.iter().any(|g| g == *w || (w.len() >= 5 && g.starts_with(w.as_str())))).count();
    hit as f32 / want.len() as f32
}

/// Splits "Artist - Title" uploads into their parts, the way SoundCloud and
/// YouTube uploads are usually titled.
pub fn split_dash(title: &str) -> Option<(String, String)> {
    for sep in [" - ", " – ", " — ", " | "] {
        if let Some((a, t)) = title.split_once(sep) {
            let (a, t) = (a.trim(), t.trim());
            if !a.is_empty() && !t.is_empty() {
                return Some((a.to_string(), t.to_string()));
            }
        }
    }
    None
}

/// Similarity of a candidate to the wanted track, or `None` when it is not the
/// same recording. Higher is better; anything returned is acceptable.
/// What platforms bolt onto a title: "(feat. X)", "[Remastered 2011]",
/// " - Radio Edit". Only used for word coverage — versions are still checked
/// against the full title. A dash is cut only when what follows looks like
/// decoration, so "Кино - Группа крови" keeps its song name.
fn core_title(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0i32;
    for ch in s.chars() {
        match ch {
            '(' | '[' | '{' => depth += 1,
            ')' | ']' | '}' => depth = (depth - 1).max(0),
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    const DECOR: &[&str] = &[
        "remaster", "remastered", "version", "edit", "mix", "mono", "stereo", "deluxe", "bonus",
        "live", "radio", "single", "from", "soundtrack", "anniversary", "acoustic", "demo",
        "instrumental", "remix",
    ];
    for sep in [" - ", " – ", " — "] {
        if let Some(i) = out.find(sep) {
            let tail = fold(&out[i + sep.len()..]);
            let decor = tail.split_whitespace().any(|w| {
                DECOR.contains(&w) || (w.len() == 4 && w.chars().all(|c| c.is_ascii_digit()))
            });
            if decor {
                out.truncate(i);
            }
            break;
        }
    }
    // ASCII-only lowering keeps byte offsets identical to `out`.
    let low = out.to_ascii_lowercase();
    for sep in [" feat. ", " feat ", " ft. ", " ft ", " featuring "] {
        if let Some(i) = low.find(sep) {
            if i > 0 {
                out.truncate(i);
                break;
            }
        }
    }
    if words(&out).is_empty() {
        s.to_string()
    } else {
        out
    }
}

pub fn score(want_t: &str, want_a: &str, want_d: u32, got_t: &str, got_a: &str, got_d: u32) -> Option<f32> {
    let full = words(want_t);
    if full.is_empty() {
        return None;
    }
    let cw = words(&core_title(want_t));
    let artist_known = !want_a.trim().is_empty() && want_a.trim() != "—";
    let wa = if artist_known { words(want_a) } else { vec![] };
    let gt = words(got_t);
    let ga = words(got_a);
    let mut gall = gt.clone();
    gall.extend(ga.iter().cloned());

    let (fc, cc) = (coverage(&full, &gall), coverage(&cw, &gall));
    let wt = if cc > fc { cw.clone() } else { full.clone() };
    let title_cov = fc.max(cc);
    // Short titles ("Help", "Intro") must match completely.
    let need_title = if wt.len() <= 2 { 0.99 } else { 0.6 };
    if title_cov < need_title {
        return None;
    }

    // A version word the original does not carry is a different recording.
    let want_ver = version_words(&format!("{want_t} {want_a}"));
    for v in version_words(got_t) {
        if !want_ver.contains(&v) {
            return None;
        }
    }

    let gap = if want_d > 30 && got_d > 0 {
        Some((want_d as i64 - got_d as i64).unsigned_abs() as u32)
    } else {
        None
    };
    if let Some(g) = gap {
        let limit = ((want_d as f32) * 0.12).max(20.0) as u32;
        if g > limit {
            return None;
        }
    }

    let artist_cov = if wa.is_empty() { 0.7 } else { coverage(&wa, &gall) };
    // Different alphabets or a featured-artist mess can hide a correct artist;
    // only a near-exact length and a full title vouch for it then.
    if artist_known && artist_cov < 0.5 {
        let exact_len = matches!(gap, Some(g) if g <= 3);
        if !(title_cov >= 0.99 && exact_len && wt.len() >= 2) {
            return None;
        }
    }

    // Extra words in the hit's title that the original does not have
    // ("Song Part II", "Song (Interlude)") count against it.
    let mut known = full.clone();
    known.extend(wa.iter().cloned());
    let extra = gt.iter().filter(|g| !known.iter().any(|k| k == *g)).count();
    let extra_pen = (extra as f32 * 0.04).min(0.25);

    let bonus = match gap {
        Some(g) if g <= 3 => 0.15,
        Some(g) if g <= 8 => 0.08,
        Some(_) => 0.0,
        None => 0.03,
    };
    let s = 0.55 * title_cov + 0.35 * artist_cov + bonus - extra_pen;
    if s < 0.6 {
        None
    } else {
        Some(s)
    }
}

/// Best acceptable hit, if any.
pub fn best<'a>(hits: &'a [Track], want_t: &str, want_a: &str, want_d: u32) -> Option<&'a Track> {
    hits.iter()
        .filter_map(|h| score(want_t, want_a, want_d, &h.t, &h.a, h.d).map(|s| (s, h)))
        .max_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal))
        .map(|(_, h)| h)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_song_across_alphabets() {
        assert!(score("Группа крови", "Кино", 286, "Gruppa krovi", "Kino", 287).is_some());
    }

    #[test]
    fn decorated_upload_matches() {
        assert!(score("Blinding Lights", "The Weeknd", 200, "The Weeknd - Blinding Lights (Official Video)", "The Weeknd", 203).is_some());
    }

    #[test]
    fn platform_decorations_are_ignored() {
        assert!(score("Song 2 - Remastered 2012", "Blur", 122, "Song 2", "Blur", 121).is_some());
        assert!(score("Levitating (feat. DaBaby)", "Dua Lipa", 203, "Levitating", "Dua Lipa", 203).is_some());
        assert!(score("Кино - Группа крови", "", 0, "Звезда по имени Солнце", "Кино", 0).is_none());
    }

    #[test]
    fn different_song_is_rejected() {
        assert!(score("Blinding Lights", "The Weeknd", 200, "Save Your Tears", "The Weeknd", 215).is_none());
    }

    #[test]
    fn remix_is_not_the_original() {
        assert!(score("Levitating", "Dua Lipa", 203, "Levitating (Remix)", "Dua Lipa", 210).is_none());
        assert!(score("Levitating (Remix)", "Dua Lipa", 210, "Levitating Remix", "Dua Lipa", 212).is_some());
    }

    #[test]
    fn long_mix_is_rejected() {
        assert!(score("Strobe", "deadmau5", 637, "Strobe", "deadmau5", 2400).is_none());
    }

    #[test]
    fn wrong_artist_needs_exact_length() {
        assert!(score("Intro", "Artist A", 120, "Intro", "Artist B", 180).is_none());
    }

    #[test]
    fn splits_uploads() {
        assert_eq!(split_dash("Daft Punk - One More Time"), Some(("Daft Punk".into(), "One More Time".into())));
    }
}
