//! A link dropped or pasted into the player becomes something playable.
//!
//! Understands track, album and playlist links from YouTube / YouTube Music,
//! Spotify, Yandex Music, SoundCloud and Deezer, including their short-link
//! forms (youtu.be, on.soundcloud.com, link.deezer.com, spotify.link), which
//! are followed to the page they redirect to first.

use serde::Serialize;

use crate::api::{client, Track, BROWSER_UA};

#[derive(Serialize)]
pub struct Resolved {
    /// "track" for one song, "list" for an album or playlist.
    pub kind: String,
    pub service: String,
    pub title: String,
    pub tracks: Vec<Track>,
}

fn param<'a>(url: &'a str, key: &str) -> Option<&'a str> {
    let q = url.split_once('?')?.1;
    let q = q.split('#').next().unwrap_or(q);
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key && !v.is_empty()).then_some(v)
    })
}

fn after<'a>(url: &'a str, marker: &str) -> Option<&'a str> {
    let rest = url.split(marker).nth(1)?;
    let id = rest.split(['?', '/', '#', '&']).next()?.trim();
    (!id.is_empty()).then_some(id)
}

/// Follows a short link's redirects to the real page.
async fn expand(url: &str) -> String {
    let short = ["youtu.be/", "on.soundcloud.com", "link.deezer.com", "deezer.page.link", "spotify.link", "spoti.fi"];
    if url.contains("youtu.be/") {
        // youtu.be/<id> needs no network round trip.
        return url.to_string();
    }
    if !short.iter().any(|s| url.contains(s)) {
        return url.to_string();
    }
    if let Ok(c) = client() {
        if let Ok(r) = c.get(url).header(reqwest::header::USER_AGENT, BROWSER_UA).send().await {
            let final_url = r.url().to_string();
            // Deezer's share pages carry the target in a meta refresh instead
            // of a redirect.
            if final_url.contains("deezer") && !final_url.contains("/track/") && !final_url.contains("/album/") && !final_url.contains("/playlist/") {
                if let Ok(body) = r.text().await {
                    for kind in ["track", "album", "playlist"] {
                        let m = format!("deezer.com/{kind}/");
                        if let Some(p) = body.find(&m) {
                            let id: String = body[p + m.len()..].chars().take_while(|c| c.is_ascii_digit()).collect();
                            if !id.is_empty() {
                                return format!("https://www.deezer.com/{kind}/{id}");
                            }
                        }
                    }
                }
            }
            return final_url;
        }
    }
    url.to_string()
}

fn one(service: &str, t: Track) -> Resolved {
    Resolved { kind: "track".into(), service: service.into(), title: t.t.clone(), tracks: vec![t] }
}

fn list(service: &str, title: &str, tracks: Vec<Track>) -> Result<Resolved, String> {
    if tracks.is_empty() {
        return Err("в этой ссылке не нашлось треков".into());
    }
    if tracks.len() == 1 {
        let t = tracks.into_iter().next().unwrap();
        return Ok(one(service, t));
    }
    Ok(Resolved { kind: "list".into(), service: service.into(), title: title.into(), tracks })
}

async fn ym_track_by_id(id: &str) -> Result<Track, String> {
    let token = crate::tokens::read_token("ym").ok().flatten().unwrap_or_default();
    let mut rb = client()?
        .get(format!("{}/tracks/{id}", crate::api::YM_API))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621");
    if !token.trim().is_empty() {
        rb = rb.header("Authorization", format!("OAuth {}", token.trim().trim_start_matches("OAuth ")));
    }
    let v: serde_json::Value = rb
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Yandex Music: {e}"))?
        .json()
        .await
        .map_err(|e| format!("bad response: {e}"))?;
    v.pointer("/result/0")
        .and_then(crate::api::ym_track_pub)
        .ok_or_else(|| "Яндекс Музыка не нашла этот трек".into())
}

async fn dz_list(kind: &str, id: &str) -> Result<Resolved, String> {
    if kind == "track" {
        let v: serde_json::Value = client()?
            .get(format!("https://api.deezer.com/track/{id}"))
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"))?;
        let t = crate::dz::track_of(&v).ok_or("Deezer не нашёл этот трек")?;
        return Ok(one("dz", t));
    }
    let o = crate::dz::open(kind, id).await?;
    list("dz", &o.title, o.tracks)
}

/// Resolves a music link into tracks.
#[tauri::command]
pub async fn link_resolve(url: String) -> Result<Resolved, String> {
    let raw = url.trim().trim_matches(['<', '>', '"', '\'']).to_string();
    if raw.is_empty() {
        return Err("пустая ссылка".into());
    }
    let u = expand(&raw).await;
    let low = u.to_lowercase();

    // YouTube and YouTube Music.
    if low.contains("youtube.com") || low.contains("youtu.be") {
        let vid = param(&u, "v")
            .map(|s| s.to_string())
            .or_else(|| after(&u, "youtu.be/").map(|s| s.to_string()))
            .or_else(|| after(&u, "/shorts/").map(|s| s.to_string()))
            .or_else(|| after(&u, "/embed/").map(|s| s.to_string()));
        let list_id = param(&u, "list").map(|s| s.to_string());
        // A watch link inside a mix ("&list=RD…") is still one song.
        if let Some(l) = list_id.filter(|l| vid.is_none() || !(l.starts_with("RD") || l.starts_with("UL"))) {
            let mut tracks = crate::ytm::playlist(&l).await.unwrap_or_default();
            if tracks.is_empty() {
                tracks = crate::ytm::watch_playlist(&l, vid.as_deref()).await?;
            }
            return list("ytm", "", tracks);
        }
        if let Some(v) = vid {
            return Ok(one("ytm", crate::ytm::track_meta(&v).await?));
        }
        // /browse/MPREb_… album pages.
        if let Some(b) = after(&u, "/browse/") {
            let o = crate::feeds::feeds_open("ytm".into(), "album".into(), b.to_string(), None).await?;
            return list("ytm", &o.title, o.tracks);
        }
        return Err("не понял эту ссылку YouTube".into());
    }

    // Spotify: open.spotify.com/{track|album|playlist}/id and spotify: URIs.
    if low.contains("spotify.com") || low.starts_with("spotify:") {
        let tracks = crate::api::spotify_public_playlist_tracks(u.clone()).await?;
        let is_track = low.contains("/track/") || low.starts_with("spotify:track:");
        if is_track {
            if let Some(t) = tracks.into_iter().next() {
                return Ok(one("sp", t));
            }
            return Err("Spotify не отдал этот трек".into());
        }
        return list("sp", "", tracks);
    }

    // Yandex Music: /album/1/track/2, /track/2, /album/1, /users/x/playlists/3.
    if low.contains("music.yandex.") || low.contains("yandex.ru/music") {
        if let Some(tid) = after(&u, "/track/") {
            return Ok(one("ym", ym_track_by_id(tid).await?));
        }
        let tracks = crate::api::ym_public_playlist_tracks(u.clone()).await?;
        return list("ym", "", tracks);
    }

    // SoundCloud.
    if low.contains("soundcloud.com") {
        let cid = crate::api::sc_client_id().await?;
        let clean = u.split('?').next().unwrap_or(&u).to_string();
        let v: serde_json::Value = client()?
            .get(format!(
                "https://api-v2.soundcloud.com/resolve?url={}&client_id={cid}",
                urlencoding::encode(&clean)
            ))
            .header(reqwest::header::USER_AGENT, BROWSER_UA)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?
            .error_for_status()
            .map_err(|e| format!("SoundCloud: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"))?;
        match v.get("kind").and_then(|k| k.as_str()) {
            Some("track") => {
                let t = crate::api::sc_track(&v).ok_or("SoundCloud не отдал этот трек")?;
                return Ok(one("sc", t));
            }
            Some("playlist") | Some("system-playlist") => {
                let tracks = crate::api::sc_playlist_tracks(clean).await?;
                let title = v.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                return list("sc", &title, tracks);
            }
            _ => return Err("эта ссылка SoundCloud — не трек и не плейлист".into()),
        }
    }

    // Deezer: deezer.com/(xx/)track|album|playlist/id.
    if low.contains("deezer.com") {
        for kind in ["track", "album", "playlist"] {
            if let Some(id) = after(&u, &format!("/{kind}/")) {
                return dz_list(kind, id).await;
            }
        }
        return Err("не понял эту ссылку Deezer".into());
    }

    Err("ссылка не похожа на трек или плейлист из поддерживаемых сервисов".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_params_and_path_ids() {
        assert_eq!(param("https://music.youtube.com/watch?v=abc123&list=RDx", "v"), Some("abc123"));
        assert_eq!(after("https://youtu.be/xyz?si=1", "youtu.be/"), Some("xyz"));
        assert_eq!(after("https://www.deezer.com/en/track/3135556?utm=1", "/track/"), Some("3135556"));
        assert_eq!(after("https://music.yandex.ru/album/1/track/2", "/track/"), Some("2"));
    }
}
