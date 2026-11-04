//! Turns whatever a lyrics source returned into the words of the song, and
//! nothing else.
//!
//! What the sources mix into the text, as seen in real responses:
//!
//! * **Genius** — section labels (`[Verse 1: Artist]`, `[Припев]`,
//!   `[Текст песни «…»]`), unknown-word marks (`[?]`), and page chrome that
//!   leaks into the lyrics container: "84 Contributors", "Translations" and the
//!   language list, "Song Lyrics", the description ending in "Read More",
//!   "You might also like", "25Embed", "See … Live / Get tickets as low as …",
//!   "Lyrics for this song have yet to be released".
//! * **LRCLIB** — crowd-sourced, many entries imported from Musixmatch, NetEase
//!   and QQ: `Artist - Title` at 00:00, credit blocks (`作词 : …`, `作曲 : …`,
//!   `Written by: …`, `Слова: …`), "纯音乐，请欣赏" for instrumentals, the old
//!   Musixmatch watermark "******* This Lyrics is NOT for Commercial use *******"
//!   plus its numeric tracking id, and plain-text section labels such as
//!   "Припев:", "Куплет 2", "(Chorus)", "Chorus x2".
//! * **Yandex Music / YouTube Music** (LyricFind, Musixmatch) — mostly clean,
//!   but occasionally "Lyrics licensed and provided by LyricFind",
//!   "Writer(s): …" or a copyright line at the end, and explicit-content
//!   warnings at the top of some Russian texts.
//!
//! Everything here is deliberately conservative about real lyrics: a line is
//! only dropped when it is *entirely* a label, a credit or a notice. Credits and
//! the title header are only looked for near the start/end of the text, where
//! sources put them, so a lyric that happens to mention "music" survives.

use std::sync::LazyLock;

use regex::Regex;

use crate::lyrics::Line;

/// Section names that are safe to drop even as a bare line ("Chorus", "Припев").
const STRONG: &str = concat!(
    // English
    r"verse|chorus|pre-?chorus|post-?chorus|pre-?hook|post-?hook|hook|refrain|bridge|intro|outro|",
    r"interlude|instrumental(?:\s+break)?|breakdown|(?:guitar|piano|sax|drum|bass)\s+solo|spoken(?:\s+word)?|",
    r"skit|coda|ad-?libs?|build-?up|reprise|",
    // Russian / Ukrainian
    r"куплет|строфа|припев|пред-?припев|пре-?припев|пост-?припев|бридж|интро|вступление|аутро|концовка|",
    r"проигрыш|кода|хук|рефрен|речитатив|переход|инструментал|вставка|связка|приспів|вступ|кінцівка|",
    r"програш|перехід|",
    // Spanish / Portuguese / French / German / Italian / Polish / Turkish / Dutch
    r"estrofa|pre-?coro|estribillo|interludio|introducción|refrão|pré-?refrão|introdução|estrofe|",
    r"couplet|pré-?refrain|strophe|zwischenteil|strofa|ritornello|pre-?ritornello|zwrotka|refren|",
    r"przejście|mostek|nakarat|köprü|refrein|",
    // Chinese / Japanese / Korean
    r"副歌|主歌|间奏|間奏|前奏|尾奏|桥段|橋段|过门|過門|サビ|大サビ|[abcｂａｃ]メロ|後奏|후렴|벌스|브릿지|인트로|아웃트로|간주"
);

/// Words that are labels only when the line is clearly formatted as one:
/// wrapped in parentheses or followed by a number or a colon. As a bare line
/// "Solo" or "Coro" could just as well be a sung word.
const WEAK: &str = r"solo|соло|coro|ponte|pont|puente|мост|міст|vers|verso|brug|drop|tag|part|часть|vamp";

const ORD: &str = r"(?:(?:\d+|first|second|third|fourth|final|last|первый|второй|третий|четв[её]ртый|пятый|последний|финальный)(?:-?(?:й|ый|ой|ий|st|nd|rd|th))?\s+)?";
const NUM: &str = r"(?:\s*[-–—#№]?\s*(?:\d+|[ivx]{1,4}))?";
const REP: &str = r"(?:\s*[(\[]?\s*(?:[xх×*]\s*\d+|\d+\s*[xх×]|\d+\s*раза?|repeat|повтор(?:ить|яется)?|again)\s*[)\]]?)?";

fn re(src: &str) -> Regex {
    Regex::new(src).expect("lyrics_clean: bad regex")
}

/// A whole line that is only a section label.
static LABEL: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        // "Chorus", "Припев:", "(Chorus x2)", "Куплет 2", "2-й куплет", "{Bridge}"
        re(&format!(r"(?i)^[({{<]?\s*{ORD}(?:{STRONG}){NUM}{REP}\s*[)}}>]?\s*[:：.]?\s*$")),
        // "(Solo)", "Coro:", "Vers 2"
        re(&format!(r"(?i)^(?:[({{<]\s*{ORD}(?:{WEAK}){NUM}{REP}\s*[)}}>]|{ORD}(?:{WEAK}){NUM}{REP}\s*[:：]|(?:{WEAK})\s*\d+)\s*$")),
        // "(Repeat chorus)", "Повторить припев", "Repeat"
        re(&format!(r"(?i)^[({{<]?\s*(?:repeat|повтор(?:ить|яется)?)(?:\s+(?:the\s+)?(?:{STRONG}|{WEAK}))?{NUM}{REP}\s*[)}}>]?\s*[:：.]?\s*$")),
        // "(Chorus: Artist)", "(Припев — Artist)"
        re(&format!(r"(?i)^[({{<]\s*{ORD}(?:{STRONG}|{WEAK}){NUM}\s*[:：\-–—]\s*[^)}}>]{{1,60}}[)}}>]\s*$")),
    ]
});

/// A label glued in front of a sung line: "Припев: Ла-ла-ла", "(Chorus) Yeah".
static LABEL_PREFIX: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    vec![
        re(&format!(r"(?i)^{ORD}(?:{STRONG}|{WEAK}){NUM}{REP}\s*[:：]\s*(?P<rest>\S.*)$")),
        re(&format!(r"(?i)^[({{<]\s*{ORD}(?:{STRONG}|{WEAK}){NUM}{REP}\s*[)}}>]\s*(?P<rest>\S.*)$")),
    ]
});

/// "(x2)", "x2", "[Repeat]", "(2 раза)" at the end of a sung line.
static REPEAT_TAIL: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)(?:\s+[xх×]\s?\d{1,2}|\s+\d{1,2}\s?[xх×]|\s*[(\[]\s*(?:[xх×*]\s?\d{1,2}|\d{1,2}\s?[xх×]|\d{1,2}\s*раза?|repeat|повтор(?:ить|яется)?)\s*[)\]])\s*$")
});

/// Notices that are never lyrics, wherever they appear.
static JUNK: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)this\s+lyrics?\s+(?:is|are)\s+not\s+for\s+commercial\s+use",
        r"^\(?\d{10,}\)?$",
        r"^\*{3,}.*\*{3,}$",
        r"(?i)^lyrics\s+(?:licensed|provided|powered|courtesy)\b",
        r"(?i)\blyrics\s+(?:licensed\s+(?:and|&)\s+provided|provided|powered)\s+by\b",
        r"(?i)^(?:source|источник)\s*[:：]\s*(?:musixmatch|lyricfind|genius|lrclib|яндекс|yandex|netease|qq)",
        r"(?i)^(?:lyrics|текст)\s+(?:from|by|via|с|взят\s+с)\s+(?:musixmatch|lyricfind|genius|lrclib)\b",
        r"(?i)^(?:writer\(s\)|songwriters?|autor(?:es)?|авторы?)\s*[:：]",
        r"(?i)^(?:lyrics\s*)?(?:©|\(c\)\s|℗)",
        r"(?i)^\d*\s*contributors?\b",
        r"(?i)^translations?$",
        r"(?i)^you\s+might\s+also\s+like$",
        r"(?i)^\d*\s*embed$",
        r"(?i)get\s+tickets\s+as\s+low\s+as",
        r"(?i)^lyrics\s+(?:will\s+be\s+available|for\s+this\s+song\s+have\s+yet)",
        r"(?i)^(?:this\s+song\s+is\s+(?:an\s+)?instrumental|instrumental\s+only)\b",
        r"(?i)^(?:внимание|осторожно|warning)\b.*(?:ненормативн|нецензурн|explicit|\bмат(?:ом|а)?\b)",
        r"(?i)(?:содержит|присутствует|встречается)\s+(?:ненормативн|нецензурн)",
        r"(?i)^(?:18\+|explicit(?:\s+content)?|parental\s+advisory.*)$",
        r"(?i)^текст\s+песни\s+(?:предоставлен|взят|добавлен)",
        r"(?i)^(?:текст\s+песни\s+)?пока\s+не\s+добавлен",
        r"纯音乐|純音樂|请欣赏|請欣賞|此歌曲为没有填词|歌词贡献者|翻译贡献者|歌詞貢獻者",
        // Credits that only ever appear as credits: NetEase/QQ/Japanese/Korean.
        r"^(?:作词|作詞|作曲|编曲|編曲|词|詞|曲|制作人|製作人|监制|監製|混音|母带|母帶|和声|和聲|吉他|贝斯|貝斯|鼓|录音|錄音|出品|发行|發行|策划|策劃|统筹|統籌|制作|製作|演唱|原唱|翻唱|人声|人聲|弦乐|弦樂|钢琴|鋼琴|配唱|封面|文案|企划|企劃|监修|監修|作詞・作曲|작사|작곡|편곡|OP|SP|ISRC)\s*[:：]",
    ]
    .iter()
    .map(|s| re(s))
    .collect()
});

/// Credits in Latin/Cyrillic scripts. Only checked near the start and the end,
/// because "Music:" could open a sung line in the middle of a song.
static CREDIT: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"(?i)^(?:music|lyrics|words|text|composer|composed|written|writers?|lyricist|producers?|produced|production|arranged|arrangement|arranger|mixed|mixing|mastered|mastering|recorded|recording|engineer(?:ed)?|vocals?|performed|performer|executive\s+producer|co-?producer|programming|programmed)(?:\s+(?:and|&)\s+(?:music|lyrics|words))?(?:\s+by)?\s*[:：]",
        r"(?i)^(?:words\s+(?:and|&)\s+music|music\s+(?:and|&)\s+(?:lyrics|words)|lyrics\s+(?:and|&)\s+music|written|produced|composed|arranged|mixed|mastered|recorded)\s+by\s",
        r"(?i)^(?:слова|музыка|музика|текст|автор(?:ы)?(?:\s+(?:слов|текста|музыки|песни))?|композитор|аранжировка|аранжировщик|сведение|мастеринг|продюсер(?:ы)?|звукорежисс[её]р|запись|исполнитель|исполняет|вокал|бэк-вокал)(?:\s+и\s+(?:слова|музыка))?\s*[:：]",
        r"(?i)^(?:слова\s+и\s+музыка|музыка\s+и\s+слова|сл\.\s*и\s*муз\.|муз\.\s*и\s*сл\.)",
        r"(?i)^(?:paroles\s+et\s+musique|letra\s+y\s+música|text\s+und\s+musik)\b",
    ]
    .iter()
    .map(|s| re(s))
    .collect()
});

/// "Текст песни «…»", "Lyrics to …", "Paroles de …" — a header announcing the
/// song rather than singing it.
static HEADER: LazyLock<Regex> = LazyLock::new(|| {
    re(r"(?i)^(?:текст(?:\s+песни)?|слова\s+песни|перевод\s+песни|lyrics(?:\s+(?:to|for|of))?|song\s+lyrics|letra(?:\s+de)?|paroles(?:\s+de(?:\s+la\s+chanson)?)?|songtext(?:\s+(?:von|zu))?)\b")
});

/// `[?]` and other bracketed notes inside a line.
static INLINE_NOTE: LazyLock<Regex> = LazyLock::new(|| re(r"\s*\[\?\]\s*"));
/// A whole line in square brackets: Genius only uses them for annotations.
static BRACKET_LINE: LazyLock<Regex> = LazyLock::new(|| re(r"^\[[^\]]{0,120}\]$"));
/// A bracketed label in front of a line: "[Chorus: X] Text".
static BRACKET_PREFIX: LazyLock<Regex> = LazyLock::new(|| re(r"^\[[^\]]{1,60}\]\s*"));
/// Only notes, dashes or dots: an instrumental gap, not words.
static GAP_ONLY: LazyLock<Regex> = LazyLock::new(|| re(r"^[\s♪♫♬♩🎵🎶*·•.…\-–—~]+$"));
static SPACES: LazyLock<Regex> = LazyLock::new(|| re(r"\s{2,}"));
/// Bracketed parts and " - Remastered 2011"-style tails of a catalogue title.
static TITLE_EXTRA: LazyLock<Regex> = LazyLock::new(|| re(r"\s*(?:[(\[][^)\]]*[)\]]|\s[-–—]\s.*)"));
/// Bracketed asides in a header line, full-width ones included: "光年之外 (《太空旅客》主题曲)".
static ASIDE: LazyLock<Regex> = LazyLock::new(|| re(r"\s*(?:\([^()]*(?:\([^()]*\)[^()]*)*\)|\[[^\]]*\]|（[^（）]*(?:（[^（）]*）[^（）]*)*）|【[^】]*】)"));
static DASH: LazyLock<Regex> = LazyLock::new(|| re(r"\s+[-–—|]\s+"));

fn normalize(s: &str) -> String {
    let s: String = s
        .chars()
        .filter(|c| !matches!(c, '\u{200b}' | '\u{200c}' | '\u{200d}' | '\u{2060}' | '\u{feff}'))
        .map(|c| if matches!(c, '\u{00a0}' | '\u{202f}' | '\u{2009}' | '\t') { ' ' } else { c })
        .collect();
    SPACES.replace_all(s.trim(), " ").into_owned()
}

/// Lowercase letters and digits only, single-spaced: for comparing a line with
/// the title regardless of quotes, dashes and case.
fn key(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut space = false;
    for c in s.chars().flat_map(|c| c.to_lowercase()) {
        if c.is_alphanumeric() {
            if space && !out.is_empty() {
                out.push(' ');
            }
            space = false;
            out.push(c);
        } else {
            space = true;
        }
    }
    out
}

fn is_label(t: &str) -> bool {
    LABEL.iter().any(|r| r.is_match(t))
}

fn strip_label_prefix(t: &str) -> Option<String> {
    LABEL_PREFIX
        .iter()
        .find_map(|r| r.captures(t).and_then(|c| c.name("rest")).map(|m| m.as_str().to_string()))
}

/// Genius page furniture whose wording is too close to real lyrics for a
/// pattern: the description teaser ("… Read More") is long and ends in the
/// capitalised link text, the concert plug names the artist.
fn is_page_chrome(t: &str, artist: &str) -> bool {
    if t == "Read More" || (t.ends_with("Read More") && (t.chars().count() > 50 || t.contains('…') || t.contains("..."))) {
        return true;
    }
    if let Some(mid) = t.strip_prefix("See ").and_then(|r| r.strip_suffix(" Live")) {
        let a = key(artist);
        return !a.is_empty() && key(mid) == a;
    }
    false
}

/// Is this line the song announcing itself: "Artist - Title", "Title Lyrics",
/// "Текст песни «Title»"? `first` allows a bare title, which only counts as
/// a header when it is the very first line.
fn is_title_header(t: &str, artist: &str, title: &str, first: bool) -> bool {
    let line = key(t);
    if line.is_empty() {
        return false;
    }
    let artist_k = key(artist);
    let titles: Vec<String> = {
        let mut v = vec![key(title), key(&TITLE_EXTRA.replace_all(title, ""))];
        v.retain(|s| !s.is_empty());
        v.dedup();
        v
    };
    if titles.is_empty() {
        return false;
    }
    for tk in &titles {
        if !artist_k.is_empty() {
            for combo in [format!("{artist_k} {tk}"), format!("{tk} {artist_k}")] {
                if line == combo || line == format!("{combo} lyrics") || line == format!("{combo} текст песни") {
                    return true;
                }
            }
        }
        if line == format!("{tk} lyrics") || line == format!("{tk} текст песни") || line == format!("{tk} текст") {
            return true;
        }
        if HEADER.is_match(t) && (line.contains(tk.as_str()) || (!artist_k.is_empty() && line.contains(&artist_k))) {
            return true;
        }
        if first && line == *tk {
            return true;
        }
        // "Title (from the film …) - Artist", "Artist — Title (Remix)"
        let core = ASIDE.replace_all(t, "");
        let parts: Vec<String> = DASH.split(&core).map(key).filter(|p| !p.is_empty()).collect();
        if parts.len() == 2 && !artist_k.is_empty() {
            let is_artist = |p: &str| p == artist_k || p.contains(artist_k.as_str()) || artist_k.contains(p);
            if (parts[0] == *tk && is_artist(&parts[1])) || (parts[1] == *tk && is_artist(&parts[0])) {
                return true;
            }
        }
    }
    first && !artist_k.is_empty() && line == artist_k
}

/// Cleans one source's lines. `synced` keeps timed empty lines (instrumental
/// gaps the view shows as a pause); plain text keeps single blank lines
/// between stanzas. Returns an empty list when nothing sung is left — the
/// caller then treats the source as having no lyrics.
pub fn clean(lines: Vec<Line>, synced: bool, artist: &str, title: &str) -> Vec<Line> {
    // Pass 1: notices, labels and markers, line by line.
    let mut kept: Vec<(Line, bool)> = Vec::with_capacity(lines.len()); // (line, stanza break before)
    let mut pending_break = false;
    for l in lines {
        let mut t = normalize(&l.text);
        // Genius glues its "You might also like" block onto the next lyric.
        if let Some(rest) = t.strip_prefix("You might also like") {
            if rest.chars().next().is_some_and(|c| !c.is_whitespace()) {
                t = rest.to_string();
            }
        }
        if JUNK.iter().any(|r| r.is_match(&t)) || is_page_chrome(&t, artist) {
            continue;
        }
        if !t.is_empty() {
            t = INLINE_NOTE.replace_all(&t, " ").trim().to_string();
            if BRACKET_LINE.is_match(&t) || is_label(&t) {
                pending_break = true;
                continue;
            }
            if let Some(m) = BRACKET_PREFIX.find(&t) {
                t = t[m.end()..].to_string();
                pending_break = true;
            }
            if let Some(rest) = strip_label_prefix(&t) {
                pending_break = true;
                t = rest;
            }
            t = REPEAT_TAIL.replace(&t, "").trim().to_string();
            if t.is_empty() {
                continue;
            }
            if GAP_ONLY.is_match(&t) {
                t.clear();
            }
        }
        kept.push((Line { at: l.at, text: t }, std::mem::take(&mut pending_break)));
    }

    // Pass 2: title header and credits, only where sources put them.
    let content: Vec<usize> = kept.iter().enumerate().filter(|(_, (l, _))| !l.text.is_empty()).map(|(i, _)| i).collect();
    let mut drop = vec![false; kept.len()];
    for (n, &i) in content.iter().enumerate() {
        let from_end = content.len() - 1 - n;
        let t = &kept[i].0.text;
        if (n < 8 || from_end < 6) && CREDIT.iter().any(|r| r.is_match(t)) {
            drop[i] = true;
            continue;
        }
        if n < 3 {
            let first = content.iter().take(n).all(|&j| drop[j]);
            if is_title_header(t, artist, title, first) {
                drop[i] = true;
            }
        }
    }

    // Pass 3: blank lines. Plain: one blank between stanzas, none at the ends.
    // Synced: a timed gap only right after a sung line, never two in a row.
    let mut out: Vec<Line> = Vec::with_capacity(kept.len());
    for (i, (line, brk)) in kept.into_iter().enumerate() {
        if drop[i] {
            continue;
        }
        let after_words = out.last().is_some_and(|l| !l.text.is_empty());
        if line.text.is_empty() {
            if after_words && (!synced || line.at.is_some()) {
                out.push(line);
            }
            continue;
        }
        if brk && !synced && after_words {
            out.push(Line { at: None, text: String::new() });
        }
        out.push(line);
    }
    while out.last().map(|l| l.text.is_empty()).unwrap_or(false) {
        out.pop();
    }
    if out.iter().all(|l| l.text.is_empty()) {
        out.clear();
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(text: &str) -> Vec<Line> {
        text.lines().map(|l| Line { at: None, text: l.to_string() }).collect()
    }
    fn texts(lines: &[Line]) -> Vec<&str> {
        lines.iter().map(|l| l.text.as_str()).collect()
    }

    #[test]
    fn drops_section_labels_in_many_forms() {
        let src = "[Verse 1: Thom Yorke]\nWhen you were here before\nChorus:\nBut I'm a creep\n(Chorus x2)\nПрипев:\nЯ люблю тебя\nКуплет 2\n2-й куплет\n{Bridge}\nПриспів\n[Текст песни «Кукла колдуна»]\nСтрофа 1\nCoro:\nEstribillo\n副歌\nサビ\n후렴\nOutro";
        let out = clean(plain(src), false, "", "");
        assert_eq!(texts(&out), vec!["When you were here before", "", "But I'm a creep", "", "Я люблю тебя"]);
    }

    #[test]
    fn keeps_words_that_only_look_like_labels() {
        let src = "Solo\nCoro de ángeles\nThe bridge is falling down\nМост через реку\nIntroduce yourself";
        let out = clean(plain(src), false, "", "");
        assert_eq!(texts(&out), src.lines().collect::<Vec<_>>());
    }

    #[test]
    fn strips_prefixes_markers_and_notes() {
        let src = "Припев: Ла-ла-ла\n(Chorus) Yeah yeah\n[Hook: Drake] Started from the bottom\nI [?] the night\nOh, baby (x2)\nКак же так х2\nDon't stop [Repeat]\nМы вместе (2 раза)";
        let out = clean(plain(src), false, "", "");
        assert_eq!(
            texts(&out),
            vec!["Ла-ла-ла", "", "Yeah yeah", "", "Started from the bottom", "I the night", "Oh, baby", "Как же так", "Don't stop", "Мы вместе"]
        );
    }

    #[test]
    fn drops_title_header_and_credits() {
        let src = "Radiohead - Creep\nWritten by: Thom Yorke\nWhen you were here before\nCouldn't look you in the eye\nLyrics licensed and provided by LyricFind\nWriter(s): Albert Hammond";
        let out = clean(plain(src), false, "Radiohead", "Creep");
        assert_eq!(texts(&out), vec!["When you were here before", "Couldn't look you in the eye"]);

        let ru = "Текст песни «Группа крови»\nСлова и музыка: В. Цой\nТёплое место, но улицы ждут\nОтпечатков наших ног";
        let out = clean(plain(ru), false, "Кино", "Группа крови");
        assert_eq!(texts(&out), vec!["Тёплое место, но улицы ждут", "Отпечатков наших ног"]);

        let zh = "光年之外 (《太空旅客（Passengers）》电影中国区主题曲) - G.E.M. 邓紫棋\n词：G.E.M. 邓紫棋\nOP：蜂鸟音乐\n感受停在我发端的指尖";
        let out = clean(plain(zh), false, "G.E.M.邓紫棋", "光年之外");
        assert_eq!(texts(&out), vec!["感受停在我发端的指尖"]);

        let bare = "Creep (Remastered 2009)\n\nWhen you were here before";
        let out = clean(plain(bare), false, "Radiohead", "Creep (Remastered 2009)");
        assert_eq!(texts(&out), vec!["When you were here before"]);
    }

    #[test]
    fn keeps_a_first_line_that_only_starts_with_the_title() {
        let src = "Hello, it's me\nI was wondering";
        let out = clean(plain(src), false, "Adele", "Hello");
        assert_eq!(texts(&out), vec!["Hello, it's me", "I was wondering"]);
    }

    #[test]
    fn drops_notices_and_genius_chrome() {
        let src = "84 Contributors\nTranslations\nCreep Lyrics\n“Creep” is the debut single… Read More\nWhen you were here before\nYou might also like\n******* This Lyrics is NOT for Commercial use *******\n(1409617857089)\n25Embed\nSee Radiohead Live\nGet tickets as low as $68";
        let out = clean(plain(src), false, "Radiohead", "Creep");
        assert_eq!(texts(&out), vec!["When you were here before"]);

        let glued = "You might also likeI'm a creep\nSee how they live\n(Repeat chorus)\nПовторить припев";
        let out = clean(plain(glued), false, "Radiohead", "Creep");
        assert_eq!(texts(&out), vec!["I'm a creep", "See how they live"]);
    }

    #[test]
    fn drops_chinese_credits_and_explicit_warnings_anywhere() {
        let lines = vec![
            Line { at: Some(0.0), text: "周杰伦 - 晴天".into() },
            Line { at: Some(0.5), text: "作词 : 周杰伦".into() },
            Line { at: Some(1.0), text: "作曲：周杰伦".into() },
            Line { at: Some(29.0), text: "故事的小黄花".into() },
            Line { at: Some(33.0), text: "".into() },
            Line { at: Some(34.0), text: "".into() },
            Line { at: Some(35.0), text: "♪".into() },
            Line { at: Some(40.0), text: "从出生那年就飘着".into() },
        ];
        let out = clean(lines, true, "周杰伦", "晴天");
        assert_eq!(texts(&out), vec!["故事的小黄花", "", "从出生那年就飘着"]);
        assert_eq!(out[1].at, Some(33.0));

        let warn = "Внимание! Текст песни содержит ненормативную лексику\n18+\nПервая строка";
        assert_eq!(texts(&clean(plain(warn), false, "", "")), vec!["Первая строка"]);
    }

    #[test]
    fn nothing_sung_means_no_lyrics() {
        assert!(clean(plain("[Instrumental]\n\n纯音乐，请欣赏"), false, "", "").is_empty());
        assert!(clean(plain("Lyrics for this song have yet to be released. Please check back once the song has been released."), false, "", "").is_empty());
    }

    #[test]
    fn collapses_blank_runs() {
        let src = "\n\nLine one\n\n\n\nLine two\n\n";
        assert_eq!(texts(&clean(plain(src), false, "", "")), vec!["Line one", "", "Line two"]);
    }
}
