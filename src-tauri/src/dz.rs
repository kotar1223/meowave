//! Deezer: search, charts, radios and artists through its public API.
//!
//! Deezer's catalogue API is open — no key, no sign-in — but full-length
//! audio is not: a non-subscriber only ever gets a 30-second preview. So a
//! Deezer track is played the way a Spotify one is: the same recording is
//! looked up on a service that streams it in full (Yandex Music when it is
//! connected, then YouTube Music, then SoundCloud), with the strict matcher in
//! matching.rs deciding what counts as "the same". Only when nothing matches
//! does the preview play, and the frontend says so.

use serde_json::Value;

use crate::api::{client, Track};
use crate::feeds::{Card, Opened, Shelf};

const API: &str = "https://api.deezer.com";

async fn get(path: &str) -> Result<Value, String> {
    let v: Value = client()?
        .get(format!("{API}{path}"))
        .header("Accept-Language", "ru")
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Deezer: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;
    if let Some(err) = v.get("error") {
        let msg = err.get("message").and_then(|m| m.as_str()).unwrap_or("error");
        return Err(format!("Deezer: {msg}"));
    }
    Ok(v)
}

pub fn track_of(v: &Value) -> Option<Track> {
    let id = v.get("id")?.to_string();
    if v.get("readable").and_then(|r| r.as_bool()) == Some(false) {
        return None;
    }
    let t = v
        .get("title")
        .and_then(|t| t.as_str())
        .filter(|t| !t.is_empty())?
        .to_string();
    let a = v
        .pointer("/artist/name")
        .and_then(|a| a.as_str())
        .unwrap_or("—")
        .to_string();
    let al = v.pointer("/album/title").and_then(|a| a.as_str()).unwrap_or("").to_string();
    let art = v
        .pointer("/album/cover_xl")
        .or_else(|| v.pointer("/album/cover_big"))
        .or_else(|| v.pointer("/artist/picture_xl"))
        .and_then(|a| a.as_str())
        .map(|s| s.to_string());
    Some(Track {
        id,
        s: "dz".into(),
        t,
        a,
        al,
        d: v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0) as u32,
        art,
        mode: "local".into(),
    })
}

fn tracks_in(v: &Value) -> Vec<Track> {
    v.get("data")
        .or_else(|| v.pointer("/tracks/data"))
        .and_then(|d| d.as_array())
        .map(|a| a.iter().filter_map(track_of).collect())
        .unwrap_or_default()
}

pub async fn search(q: &str) -> Result<Vec<Track>, String> {
    let v = get(&format!("/search?q={}&limit=25", urlencoding::encode(q))).await?;
    Ok(tracks_in(&v))
}

pub async fn home() -> Result<Vec<Shelf>, String> {
    let chart = get("/chart/0?limit=30").await?;
    let mut shelves = Vec::new();
    let tracks: Vec<Card> = chart
        .pointer("/tracks/data")
        .and_then(|d| d.as_array())
        .map(|a| a.iter().filter_map(track_of).map(Card::track).collect())
        .unwrap_or_default();
    if !tracks.is_empty() {
        shelves.push(Shelf { title: "Чарт Deezer".into(), s: "dz".into(), cards: tracks });
    }
    let albums: Vec<Card> = chart
        .pointer("/albums/data")
        .and_then(|d| d.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    let id = x.get("id")?.to_string();
                    let t = x.get("title")?.as_str()?;
                    let sub = x.pointer("/artist/name").and_then(|n| n.as_str()).unwrap_or("");
                    let art = x.get("cover_xl").or_else(|| x.get("cover_big")).and_then(|c| c.as_str()).map(|s| s.to_string());
                    Some(Card::new("album", "dz", &id, t, sub, art))
                })
                .collect()
        })
        .unwrap_or_default();
    if !albums.is_empty() {
        shelves.push(Shelf { title: "Популярные альбомы".into(), s: "dz".into(), cards: albums });
    }
    let lists: Vec<Card> = chart
        .pointer("/playlists/data")
        .and_then(|d| d.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| {
                    let id = x.get("id")?.to_string();
                    let t = x.get("title")?.as_str()?;
                    let sub = x.pointer("/user/name").and_then(|n| n.as_str()).unwrap_or("Deezer");
                    let art = x.get("picture_xl").or_else(|| x.get("picture_big")).and_then(|c| c.as_str()).map(|s| s.to_string());
                    Some(Card::new("playlist", "dz", &id, t, sub, art))
                })
                .collect()
        })
        .unwrap_or_default();
    if !lists.is_empty() {
        shelves.push(Shelf { title: "Плейлисты Deezer".into(), s: "dz".into(), cards: lists });
    }
    if let Ok(r) = get("/radio").await {
        let radios: Vec<Card> = r
            .get("data")
            .and_then(|d| d.as_array())
            .map(|a| {
                a.iter()
                    .take(30)
                    .filter_map(|x| {
                        let id = x.get("id")?.to_string();
                        let t = x.get("title")?.as_str()?;
                        let art = x.get("picture_xl").or_else(|| x.get("picture_big")).and_then(|c| c.as_str()).map(|s| s.to_string());
                        Some(Card::new("radio", "dz", &id, t, "Радио", art))
                    })
                    .collect()
            })
            .unwrap_or_default();
        if !radios.is_empty() {
            shelves.push(Shelf { title: "Радио по жанрам".into(), s: "dz".into(), cards: radios });
        }
    }
    if shelves.is_empty() {
        return Err("Deezer returned no collections".into());
    }
    Ok(shelves)
}

pub async fn open(kind: &str, id: &str) -> Result<Opened, String> {
    let (path, title_path) = match kind {
        "playlist" => (format!("/playlist/{id}"), "/title"),
        "album" => (format!("/album/{id}"), "/title"),
        "radio" => (format!("/radio/{id}/tracks?limit=50"), ""),
        "artist" => (format!("/artist/{id}/top?limit=50"), ""),
        "chart" => ("/chart/0/tracks?limit=100".to_string(), ""),
        other => return Err(format!("unsupported Deezer collection: {other}")),
    };
    let v = get(&path).await?;
    let mut tracks = tracks_in(&v);
    // Album rows carry no album block of their own; give them the cover.
    if kind == "album" {
        let cover = v.get("cover_xl").or_else(|| v.get("cover_big")).and_then(|c| c.as_str()).map(|s| s.to_string());
        let al = v.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
        for t in tracks.iter_mut() {
            if t.art.is_none() {
                t.art = cover.clone();
            }
            if t.al.is_empty() {
                t.al = al.clone();
            }
        }
    }
    let title = if title_path.is_empty() {
        String::new()
    } else {
        v.pointer(title_path).and_then(|t| t.as_str()).unwrap_or("").to_string()
    };
    Ok(Opened { title, tracks, shelves: vec![] })
}

/// A Deezer track's artist radio — Deezer's own "similar music" mix.
pub async fn radio_for(track_id: &str) -> Result<Vec<Track>, String> {
    let tr = get(&format!("/track/{track_id}")).await?;
    let artist = tr.pointer("/artist/id").map(|a| a.to_string()).ok_or("Deezer track has no artist")?;
    let v = get(&format!("/artist/{artist}/radio?limit=50")).await?;
    let mut out = tracks_in(&v);
    out.retain(|t| t.id != track_id);
    Ok(out)
}

pub struct Info {
    pub t: String,
    pub a: String,
    pub d: u32,
    pub preview: Option<String>,
}

pub async fn info(id: &str) -> Result<Info, String> {
    let v = get(&format!("/track/{id}")).await?;
    Ok(Info {
        t: v.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
        a: v.pointer("/artist/name").and_then(|a| a.as_str()).unwrap_or("").to_string(),
        d: v.get("duration").and_then(|d| d.as_u64()).unwrap_or(0) as u32,
        preview: v.get("preview").and_then(|p| p.as_str()).filter(|p| !p.is_empty()).map(|s| s.to_string()),
    })
}

/// Full-length audio for a Deezer track from a service that has it.
pub async fn stream_url(id: &str, hq: u8, fmt: &str) -> Result<String, String> {
    let i = info(id).await?;
    let q = format!("{} {}", i.a, i.t);
    // Yandex first when it is connected: the catalogue overlaps Deezer's best
    // and it streams in the quality the user picked.
    if let Ok(Some(tok)) = crate::tokens::read_token("ym") {
        if !tok.trim().is_empty() {
            if let Ok(hits) = crate::api::ym_search(&tok, &q).await {
                if let Some(h) = crate::matching::best(&hits, &i.t, &i.a, i.d) {
                    if hq == 2 {
                        if let Ok(u) = crate::api::ym_lossless_url(&tok, &h.id).await {
                            return Ok(u);
                        }
                    }
                    if let Ok(u) = crate::api::ym_stream_url(&tok, &h.id, hq > 0).await {
                        return Ok(u);
                    }
                }
            }
        }
    }
    if let Ok(hits) = crate::ytm::search(&q).await {
        if let Some(h) = crate::matching::best(&hits, &i.t, &i.a, i.d) {
            if let Ok(p) = crate::ytm::stream(&h.id, hq > 0, fmt).await {
                return Ok(format!("{}#mwua={}", p.url, p.client));
            }
        }
    }
    if let Ok(hits) = crate::api::sc_search("", &q).await {
        if let Some(h) = crate::matching::best(&hits, &i.t, &i.a, i.d) {
            if let Ok(u) = crate::api::sc_stream_url("", &h.id).await {
                return Ok(u);
            }
        }
    }
    // The 30-second preview is the last resort; the fragment tells the
    // frontend (through the X-Meowave-Preview header) that it is one.
    i.preview
        .map(|p| format!("{p}#mwpreview=1"))
        .ok_or_else(|| "этот трек не нашёлся ни на одном сервисе".to_string())
}

/// Public profile of an artist, for the artist page when Spotify has nothing.
pub async fn artist(name: &str) -> Result<Value, String> {
    let s = get(&format!("/search/artist?q={}&limit=5", urlencoding::encode(name))).await?;
    let want = crate::matching::fold(name);
    let list = s.get("data").and_then(|d| d.as_array()).cloned().unwrap_or_default();
    let hit = list
        .iter()
        .find(|a| a.get("name").and_then(|n| n.as_str()).map(|n| crate::matching::fold(n) == want).unwrap_or(false))
        .or_else(|| list.first())
        .cloned()
        .ok_or("Deezer does not know this artist")?;
    let id = hit.get("id").map(|i| i.to_string()).unwrap_or_default();
    let (p_top, p_rel, p_alb) = (
        format!("/artist/{id}/top?limit=10"),
        format!("/artist/{id}/related?limit=12"),
        format!("/artist/{id}/albums?limit=20"),
    );
    let (top, related, albums) = tokio::join!(get(&p_top), get(&p_rel), get(&p_alb));
    let top: Vec<Track> = top.map(|v| tracks_in(&v)).unwrap_or_default();
    let related: Vec<Value> = related
        .ok()
        .and_then(|v| v.get("data").and_then(|d| d.as_array()).cloned())
        .unwrap_or_default()
        .iter()
        .map(|a| {
            serde_json::json!({
                "name": a.get("name"),
                "art": a.get("picture_xl").or_else(|| a.get("picture_big")),
            })
        })
        .collect();
    let albums: Vec<Value> = albums
        .ok()
        .and_then(|v| v.get("data").and_then(|d| d.as_array()).cloned())
        .unwrap_or_default()
        .iter()
        .map(|a| {
            serde_json::json!({
                "kind": "album", "s": "dz",
                "id": a.get("id").map(|i| i.to_string()),
                "t": a.get("title"),
                "sub": a.get("release_date"),
                "art": a.get("cover_xl").or_else(|| a.get("cover_big")),
            })
        })
        .collect();
    Ok(serde_json::json!({
        "source": "dz",
        "id": id,
        "name": hit.get("name"),
        "avatar": hit.get("picture_xl").or_else(|| hit.get("picture_big")),
        "header": hit.get("picture_xl"),
        "followers": hit.get("nb_fan"),
        "top": top,
        "related": related,
        "albums": albums,
    }))
}
