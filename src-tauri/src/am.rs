//! Apple Music: catalogue search, charts, albums and artists through Apple's
//! public iTunes Search / Lookup API and the Apple Music RSS charts.
//!
//! Like Spotify (spanon.rs) and Deezer (dz.rs), the catalogue is open — no
//! key, no sign-in — but the audio is not: outside Apple's own player there is
//! only a 30-second preview. So an Apple Music track is played the way a
//! Deezer one is: the same recording is looked up on a service that streams it
//! in full (Yandex Music when it is connected, then YouTube Music, then
//! SoundCloud), the strict matcher in matching.rs deciding what counts as "the
//! same". Only when nothing matches does the preview play, and the frontend
//! says so.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;

use crate::api::{client, Track};
use crate::dz::Info;
use crate::feeds::{Card, Opened, Shelf};

const SEARCH: &str = "https://itunes.apple.com/search";
const LOOKUP: &str = "https://itunes.apple.com/lookup";
const RSS: &str = "https://rss.marketingtools.apple.com/api/v2";

/// What a track needs to be matched elsewhere, remembered from every list
/// Apple answered, so pressing play needs no lookup of its own.
static INFO: Mutex<Option<HashMap<String, Info>>> = Mutex::new(None);

fn remember(id: &str, i: Info) {
    let mut g = INFO.lock().unwrap_or_else(|e| e.into_inner());
    let m = g.get_or_insert_with(HashMap::new);
    if m.len() > 4000 {
        m.clear();
    }
    m.insert(id.to_string(), i);
}

fn cached(id: &str) -> Option<Info> {
    INFO.lock().unwrap_or_else(|e| e.into_inner()).as_ref()?.get(id).cloned()
}

/// The storefront to ask. Cyrillic goes to the Russian one, where Russian
/// artists are spelled the way their listeners type them.
fn store_for(q: &str) -> &'static str {
    if q.chars().any(|c| ('\u{0400}'..='\u{04FF}').contains(&c)) {
        "ru"
    } else {
        "us"
    }
}

async fn get(url: &str) -> Result<Value, String> {
    client()?
        .get(url)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Apple Music: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))
}

fn results(v: &Value) -> &[Value] {
    v.get("results").and_then(|r| r.as_array()).map(|a| a.as_slice()).unwrap_or(&[])
}

fn s<'a>(v: &'a Value, k: &str) -> Option<&'a str> {
    v.get(k).and_then(|x| x.as_str()).filter(|x| !x.trim().is_empty())
}

fn id_of(v: &Value, k: &str) -> Option<String> {
    v.get(k).and_then(|x| x.as_u64().map(|n| n.to_string()).or_else(|| x.as_str().map(str::to_string)))
}

/// The API names 100 px covers; the size is part of the address, so a bigger
/// one is the same path with another last segment.
pub(crate) fn big_art(u: &str) -> String {
    if let Some(i) = u.rfind('/') {
        let last = &u[i + 1..];
        let sized = last.chars().next().is_some_and(|c| c.is_ascii_digit())
            && last.contains('x')
            && (last.ends_with("bb.jpg") || last.ends_with("bb.png") || last.ends_with("bb.webp"));
        if sized {
            return format!("{}/600x600bb.jpg", &u[..i]);
        }
    }
    u.to_string()
}

pub(crate) fn track_of(v: &Value) -> Option<Track> {
    if s(v, "wrapperType").is_some_and(|w| w != "track") || s(v, "kind").is_some_and(|k| k != "song") {
        return None;
    }
    let id = id_of(v, "trackId")?;
    let t = s(v, "trackName")?.to_string();
    let a = s(v, "artistName").unwrap_or("—").to_string();
    let al = s(v, "collectionName").unwrap_or("").to_string();
    let d = (v.get("trackTimeMillis").and_then(|x| x.as_u64()).unwrap_or(0) / 1000) as u32;
    let art = s(v, "artworkUrl100").or_else(|| s(v, "artworkUrl60")).map(big_art);
    remember(&id, Info { t: t.clone(), a: a.clone(), d, preview: s(v, "previewUrl").map(str::to_string) });
    Some(Track { id, s: "am".into(), t, a, al, d, art, mode: "local".into() })
}

pub async fn search(q: &str) -> Result<Vec<Track>, String> {
    let url = format!(
        "{SEARCH}?term={}&media=music&entity=song&limit=25&country={}",
        urlencoding::encode(q),
        store_for(q)
    );
    let v = get(&url).await?;
    Ok(results(&v).iter().filter_map(track_of).collect())
}

/// A lookup in the US storefront, then the Russian one: an id from either
/// works in this app, and the API does not say which store it came from.
async fn lookup(params: &str) -> Result<Value, String> {
    let mut last = "Apple Music: nothing found".to_string();
    for cc in ["us", "ru"] {
        match get(&format!("{LOOKUP}?{params}&country={cc}")).await {
            Ok(v) if !results(&v).is_empty() => return Ok(v),
            Ok(_) => {}
            Err(e) => last = e,
        }
    }
    Err(last)
}

pub async fn info(id: &str) -> Result<Info, String> {
    if let Some(i) = cached(id) {
        return Ok(i);
    }
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("bad Apple Music id".into());
    }
    let v = lookup(&format!("id={id}")).await?;
    results(&v).iter().for_each(|x| {
        track_of(x);
    });
    cached(id).ok_or_else(|| "Apple Music does not know this track".into())
}

/// Full-length audio for an Apple Music track from a service that has it.
pub async fn stream_url(id: &str, hq: u8, fmt: &str) -> Result<String, String> {
    let i = info(id).await?;
    crate::dz::stream_match(&i, hq, fmt).await
}

/// Artists and albums for a query. The search has no playlists.
pub async fn search_cards(q: &str) -> (Vec<Card>, Vec<Card>) {
    let (cc, enc) = (store_for(q), urlencoding::encode(q).into_owned());
    let (pa, pal) = (
        format!("{SEARCH}?term={enc}&media=music&entity=musicArtist&limit=10&country={cc}"),
        format!("{SEARCH}?term={enc}&media=music&entity=album&limit=12&country={cc}"),
    );
    let (a, al) = tokio::join!(get(&pa), get(&pal));
    let artists = a
        .map(|v| {
            results(&v)
                .iter()
                .filter_map(|x| {
                    let id = id_of(x, "artistId")?;
                    Some(Card::new("artist", "am", &id, s(x, "artistName")?, s(x, "primaryGenreName").unwrap_or(""), None))
                })
                .collect()
        })
        .unwrap_or_default();
    let albums = al.map(|v| results(&v).iter().filter_map(album_card).collect()).unwrap_or_default();
    (artists, albums)
}

fn album_card(x: &Value) -> Option<Card> {
    let id = id_of(x, "collectionId").or_else(|| id_of(x, "id"))?;
    let t = s(x, "collectionName").or_else(|| s(x, "name"))?;
    let sub = s(x, "artistName").unwrap_or("");
    Some(Card::new("album", "am", &id, t, sub, s(x, "artworkUrl100").map(big_art)))
}

/// One chart from the Apple Music RSS feed; the old iTunes feed when the new
/// one fails (it answers 502 for some storefronts). Rows come back in the
/// new feed's shape: id, name, artistName, artworkUrl100.
async fn chart(cc: &str, kind: &str) -> Vec<Value> {
    if let Ok(v) = get(&format!("{RSS}/{cc}/music/most-played/25/{kind}.json")).await {
        if let Some(a) = v.pointer("/feed/results").and_then(|r| r.as_array()).filter(|a| !a.is_empty()) {
            return a.clone();
        }
    }
    let Ok(v) = get(&format!("https://itunes.apple.com/{cc}/rss/top{kind}/limit=25/json")).await else {
        return Vec::new();
    };
    v.pointer("/feed/entry")
        .and_then(|e| e.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|e| {
                    let id = e.pointer("/id/attributes/im:id")?.as_str()?;
                    let name = e.pointer("/im:name/label")?.as_str()?;
                    let artist = e.pointer("/im:artist/label").and_then(|x| x.as_str()).unwrap_or("");
                    let art = e
                        .get("im:image")
                        .and_then(|i| i.as_array())
                        .and_then(|a| a.last())
                        .and_then(|x| x.get("label"))
                        .and_then(|x| x.as_str())
                        .unwrap_or("");
                    Some(json!({ "id": id, "name": name, "artistName": artist, "artworkUrl100": art }))
                })
                .collect()
        })
        .unwrap_or_default()
}

/// The charts' songs carry no length; one lookup for all of them gives the
/// matcher its durations. Chart order is kept.
async fn chart_tracks(cc: &str, rows: &[Value]) -> Vec<Track> {
    let ids: Vec<String> = rows.iter().filter_map(|r| id_of(r, "id")).collect();
    if ids.is_empty() {
        return Vec::new();
    }
    let mut by: HashMap<String, Track> = HashMap::new();
    if let Ok(v) = get(&format!("{LOOKUP}?id={}&country={cc}", ids.join(","))).await {
        for t in results(&v).iter().filter_map(track_of) {
            by.insert(t.id.clone(), t);
        }
    }
    rows.iter()
        .filter_map(|r| {
            let id = id_of(r, "id")?;
            if let Some(t) = by.remove(&id) {
                return Some(t);
            }
            let t = s(r, "name")?.to_string();
            let a = s(r, "artistName").unwrap_or("—").to_string();
            remember(&id, Info { t: t.clone(), a: a.clone(), d: 0, preview: None });
            Some(Track { id, s: "am".into(), t, a, al: String::new(), d: 0, art: s(r, "artworkUrl100").map(big_art), mode: "local".into() })
        })
        .collect()
}

pub async fn home(lang: &str) -> Result<Vec<Shelf>, String> {
    let cc = if lang == "ru" { "ru" } else { "us" };
    let (songs, albums) = tokio::join!(chart(cc, "songs"), chart(cc, "albums"));
    let mut shelves = Vec::new();
    let tracks: Vec<Card> = chart_tracks(cc, &songs).await.into_iter().map(Card::track).collect();
    if !tracks.is_empty() {
        shelves.push(Shelf { title: "Чарт Apple Music".into(), s: "am".into(), cards: tracks });
    }
    let albums: Vec<Card> = albums.iter().filter_map(album_card).collect();
    if !albums.is_empty() {
        shelves.push(Shelf { title: "Популярные альбомы".into(), s: "am".into(), cards: albums });
    }
    if shelves.is_empty() {
        return Err("Apple Music returned no charts".into());
    }
    Ok(shelves)
}

pub async fn open(kind: &str, id: &str) -> Result<Opened, String> {
    if !id.chars().all(|c| c.is_ascii_digit()) {
        return Err("bad Apple Music id".into());
    }
    match kind {
        "album" => {
            let v = lookup(&format!("id={id}&entity=song&limit=200")).await?;
            let list = results(&v);
            let head = list.iter().find(|x| s(x, "wrapperType") == Some("collection"));
            let title = head.and_then(|h| s(h, "collectionName")).unwrap_or("").to_string();
            let cover = head.and_then(|h| s(h, "artworkUrl100")).map(big_art);
            let mut tracks: Vec<Track> = list.iter().filter_map(track_of).collect();
            for t in tracks.iter_mut() {
                if t.art.is_none() {
                    t.art = cover.clone();
                }
            }
            Ok(Opened { title, tracks, shelves: vec![] })
        }
        "artist" => {
            let (ps, pa) = (format!("id={id}&entity=song&limit=50"), format!("id={id}&entity=album&limit=25"));
            let (songs, albums) = tokio::join!(lookup(&ps), lookup(&pa));
            let songs = songs?;
            let title = results(&songs)
                .iter()
                .find(|x| s(x, "wrapperType") == Some("artist"))
                .and_then(|h| s(h, "artistName"))
                .unwrap_or("")
                .to_string();
            let tracks = results(&songs).iter().filter_map(track_of).collect();
            let cards: Vec<Card> = albums
                .map(|v| results(&v).iter().filter(|x| s(x, "wrapperType") == Some("collection")).filter_map(album_card).collect())
                .unwrap_or_default();
            let shelves = if cards.is_empty() {
                vec![]
            } else {
                vec![Shelf { title: "albums".into(), s: "am".into(), cards }]
            };
            Ok(Opened { title, tracks, shelves })
        }
        "chart" => {
            let rows = chart("us", "songs").await;
            Ok(Opened { title: "Чарт Apple Music".into(), tracks: chart_tracks("us", &rows).await, shelves: vec![] })
        }
        other => Err(format!("unsupported Apple Music collection: {other}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_a_search_row() {
        let v = json!({"wrapperType":"track","kind":"song","trackId":590423552,"artistName":"LINKIN PARK",
            "collectionName":"Meteora","trackName":"Numb","trackTimeMillis":187508,
            "previewUrl":"https://audio-ssl.itunes.apple.com/x.m4a",
            "artworkUrl100":"https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a/b.jpg/100x100bb.jpg"});
        let t = track_of(&v).unwrap();
        assert_eq!((t.id.as_str(), t.s.as_str(), t.t.as_str(), t.d), ("590423552", "am", "Numb", 187));
        assert_eq!(t.art.as_deref(), Some("https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/a/b.jpg/600x600bb.jpg"));
        let i = cached("590423552").unwrap();
        assert_eq!((i.a.as_str(), i.preview.is_some()), ("LINKIN PARK", true));
        // Music videos and albums are not songs.
        assert!(track_of(&json!({"wrapperType":"track","kind":"music-video","trackId":1,"trackName":"x"})).is_none());
        assert!(track_of(&json!({"wrapperType":"collection","collectionId":1,"collectionName":"x"})).is_none());
    }

    #[test]
    fn covers_and_stores() {
        assert_eq!(big_art("https://x/y.jpg/55x55bb.png"), "https://x/y.jpg/600x600bb.jpg");
        assert_eq!(big_art("https://x/plain.jpg"), "https://x/plain.jpg");
        assert_eq!(store_for("кино"), "ru");
        assert_eq!(store_for("numb"), "us");
    }

    /// `cargo test -- --ignored live_apple --nocapture`
    #[tokio::test]
    #[ignore]
    async fn live_apple() {
        let s = search("linkin park numb").await.unwrap();
        assert!(!s.is_empty());
        println!("{} {} {}", s[0].t, s[0].a, s[0].d);
        let h = home("ru").await.unwrap();
        println!("shelves: {}", h.iter().map(|s| format!("{}={}", s.title, s.cards.len())).collect::<Vec<_>>().join(", "));
        let (a, al) = search_cards("кино").await;
        println!("artists {} albums {}", a.len(), al.len());
        let o = open("album", &al[0].id).await.unwrap();
        println!("album {} tracks {}", o.title, o.tracks.len());
    }
}
