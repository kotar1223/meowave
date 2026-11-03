//! What the platforms themselves recommend: "My Wave" sessions and the
//! curated collections behind the home sheet.
//!
//! The old wave was Meowave's own guess — related tracks of whatever had just
//! played. Here every service answers with its own recommender: Yandex Music's
//! rotor (the same session API the app uses for «Моя волна», fed back with
//! what was played and skipped so it learns), YouTube Music's song radio,
//! SoundCloud's track stations and Deezer's radios.

use serde::Serialize;
use serde_json::{json, Value};

use crate::api::{client, Track, BROWSER_UA, YM_API};

/// One tile in a collection shelf.
#[derive(Serialize, Clone, Debug)]
pub struct Card {
    /// "track" | "album" | "playlist" | "browse" | "radio" | "artist" | "chart"
    pub kind: String,
    pub s: String,
    pub id: String,
    pub t: String,
    pub sub: String,
    pub art: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub track: Option<Track>,
}

impl Card {
    pub fn new(kind: &str, s: &str, id: &str, t: &str, sub: &str, art: Option<String>) -> Self {
        Card {
            kind: kind.into(),
            s: s.into(),
            id: id.into(),
            t: t.into(),
            sub: sub.into(),
            art,
            color: None,
            track: None,
        }
    }
    pub fn track(tr: Track) -> Self {
        Card {
            kind: "track".into(),
            s: tr.s.clone(),
            id: tr.id.clone(),
            t: tr.t.clone(),
            sub: tr.a.clone(),
            art: tr.art.clone(),
            color: None,
            track: Some(tr),
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct Shelf {
    pub title: String,
    pub s: String,
    pub cards: Vec<Card>,
}

/// An opened collection: a track list, nested shelves (a mood page), or both.
#[derive(Serialize, Default)]
pub struct Opened {
    pub title: String,
    pub tracks: Vec<Track>,
    pub shelves: Vec<Shelf>,
}

/* ═══════════════════ Yandex Music: My Wave ═══════════════════ */

fn ym_post(path: &str, token: &str) -> Result<reqwest::RequestBuilder, String> {
    let t = token.trim().strip_prefix("OAuth ").unwrap_or(token.trim());
    Ok(client()?
        .post(format!("{YM_API}{path}"))
        .header("Authorization", format!("OAuth {t}"))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
        .header("Accept-Language", "ru"))
}

fn ym_get(path: &str, token: &str) -> Result<reqwest::RequestBuilder, String> {
    let t = token.trim().strip_prefix("OAuth ").unwrap_or(token.trim());
    let mut b = client()?
        .get(format!("{YM_API}{path}"))
        .header("X-Yandex-Music-Client", "YandexMusicAndroid/24023621")
        .header("Accept-Language", "ru");
    if !t.is_empty() {
        b = b.header("Authorization", format!("OAuth {t}"));
    }
    Ok(b)
}

fn ym_token() -> Result<String, String> {
    crate::tokens::read_token("ym")?
        .filter(|t| !t.trim().is_empty())
        .ok_or_else(|| "Яндекс Музыка не подключена".to_string())
}

async fn ym_json(rb: reqwest::RequestBuilder) -> Result<Value, String> {
    let resp = rb.send().await.map_err(|e| format!("network: {e}"))?;
    let status = resp.status();
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    if !status.is_success() {
        let msg = body
            .pointer("/error/message")
            .or_else(|| body.pointer("/error/name"))
            .and_then(|m| m.as_str())
            .unwrap_or("");
        return Err(format!("Yandex Music HTTP {}{}", status.as_u16(), if msg.is_empty() { String::new() } else { format!(": {msg}") }));
    }
    Ok(body)
}

/// A rotor track as the frontend's track object, plus the album id the
/// feedback calls need ("trackId:albumId").
fn ym_wave_track(v: &Value) -> Option<Value> {
    let tr = crate::api::ym_track_pub(v)?;
    let mut out = serde_json::to_value(tr).ok()?;
    if let Some(al) = v.pointer("/albums/0/id") {
        let al = match al {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
        out["alid"] = Value::String(al);
    }
    // Rotor marks tracks the account cannot play; skip them up front instead
    // of failing on them one by one.
    if v.get("available").and_then(|a| a.as_bool()) == Some(false) {
        return None;
    }
    Some(out)
}

#[derive(Serialize)]
pub struct WaveBatch {
    pub tracks: Vec<Value>,
    pub session: Option<String>,
    pub batch: Option<String>,
    /// "session" (new rotor API) or "station" (old one, used as a fallback).
    pub api: String,
}

fn batch_of(v: &Value, api: &str) -> WaveBatch {
    let r = v.get("result").unwrap_or(v);
    let tracks = r
        .get("sequence")
        .and_then(|s| s.as_array())
        .map(|seq| {
            seq.iter()
                .filter_map(|it| it.get("track").and_then(ym_wave_track))
                .collect()
        })
        .unwrap_or_default();
    WaveBatch {
        tracks,
        session: r.get("radioSessionId").and_then(|s| s.as_str()).map(|s| s.to_string()),
        batch: r.get("batchId").and_then(|s| s.as_str()).map(|s| s.to_string()),
        api: api.into(),
    }
}

/// The station id of the seed list: "user:onyourwave" for My Wave,
/// "track:123" for a song's own radio.
fn station_of(seeds: &[String]) -> String {
    seeds
        .iter()
        .find(|s| !s.starts_with("setting"))
        .cloned()
        .unwrap_or_else(|| "user:onyourwave".into())
}

/// Starts a rotor session. `seeds` is the station plus the mood settings
/// (`settingMoodEnergy:calm`, `settingDiversity:discover`, `settingLanguage:any`).
#[tauri::command]
pub async fn wave_ym_start(seeds: Vec<String>, queue: Option<Vec<String>>) -> Result<WaveBatch, String> {
    let token = ym_token()?;
    let seeds = if seeds.is_empty() { vec!["user:onyourwave".to_string()] } else { seeds };
    let body = json!({
        "seeds": seeds,
        "includeTracksInResponse": true,
        "includeWaveModel": true,
        "interactive": true,
        "queue": queue.unwrap_or_default(),
    });
    match ym_json(ym_post("/rotor/session/new", &token)?.json(&body)).await {
        Ok(v) => {
            let b = batch_of(&v, "session");
            if !b.tracks.is_empty() {
                return Ok(b);
            }
        }
        Err(e) => eprintln!("[meowave] rotor session/new: {e}"),
    }
    // Old station API: same recommender, simpler protocol.
    let station = station_of(&seeds);
    let v = ym_json(ym_get(&format!("/rotor/station/{station}/tracks?settings2=true"), &token)?).await?;
    let b = batch_of(&v, "station");
    if b.tracks.is_empty() {
        return Err("Яндекс Музыка не вернула треков для волны".into());
    }
    Ok(b)
}

/// Next batch of an open session. `queue` lists what has already been played
/// ("trackId:albumId", newest last) so the recommender does not repeat itself.
#[tauri::command]
pub async fn wave_ym_more(
    session: Option<String>,
    seeds: Vec<String>,
    queue: Vec<String>,
) -> Result<WaveBatch, String> {
    let token = ym_token()?;
    if let Some(sid) = session.filter(|s| !s.is_empty()) {
        let body = json!({ "queue": queue });
        match ym_json(ym_post(&format!("/rotor/session/{sid}/tracks"), &token)?.json(&body)).await {
            Ok(v) => {
                let mut b = batch_of(&v, "session");
                if b.session.is_none() {
                    b.session = Some(sid.clone());
                }
                if !b.tracks.is_empty() {
                    return Ok(b);
                }
            }
            Err(e) => eprintln!("[meowave] rotor session tracks: {e}"),
        }
        // A session expires after a while; a fresh one continues the wave.
        return wave_ym_start(seeds, Some(queue)).await;
    }
    let station = station_of(&seeds);
    let last = queue.last().map(|q| format!("&queue={}", urlencoding::encode(q))).unwrap_or_default();
    let v = ym_json(ym_get(&format!("/rotor/station/{station}/tracks?settings2=true{last}"), &token)?).await?;
    Ok(batch_of(&v, "station"))
}

fn iso_now() -> (String, f64) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs() as i64;
    let ms = now.subsec_millis();
    // Civil date from days since the epoch (Howard Hinnant's algorithm).
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (
        format!(
            "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{ms:03}Z",
            rem / 3600,
            (rem / 60) % 60,
            rem % 60
        ),
        now.as_secs_f64(),
    )
}

/// Tells the rotor what happened: "radioStarted", "trackStarted",
/// "trackFinished", "skip". This is what makes the wave adapt — without it the
/// session keeps recommending blind.
#[tauri::command]
pub async fn wave_ym_feedback(
    session: Option<String>,
    batch: Option<String>,
    seeds: Vec<String>,
    kind: String,
    track: Option<String>,
    played: Option<f64>,
) -> Result<(), String> {
    let token = ym_token()?;
    let (iso, epoch) = iso_now();
    let played = played.unwrap_or(0.0).max(0.0);
    if let Some(sid) = session.filter(|s| !s.is_empty()) {
        let mut ev = json!({ "type": kind, "timestamp": iso });
        if let Some(t) = &track {
            ev["trackId"] = Value::String(t.clone());
        }
        if kind == "trackFinished" || kind == "skip" {
            ev["totalPlayedSeconds"] = json!(played);
        }
        if kind == "radioStarted" {
            ev["from"] = Value::String("mobile-radio-user-onyourwave".into());
        }
        let mut body = json!({ "event": ev });
        if let Some(b) = &batch {
            body["batchId"] = Value::String(b.clone());
        }
        ym_json(ym_post(&format!("/rotor/session/{sid}/feedback"), &token)?.json(&body)).await?;
        return Ok(());
    }
    let station = station_of(&seeds);
    let mut body = json!({ "type": kind, "timestamp": epoch, "from": "mobile-radio-user-onyourwave" });
    if let Some(t) = &track {
        body["trackId"] = Value::String(t.clone());
    }
    if kind == "trackFinished" || kind == "skip" {
        body["totalPlayedSeconds"] = json!(played);
    }
    let q = batch.map(|b| format!("?batch-id={}", urlencoding::encode(&b))).unwrap_or_default();
    ym_json(ym_post(&format!("/rotor/station/{station}/feedback{q}"), &token)?.json(&body)).await?;
    Ok(())
}

/// A Yandex song's own radio ("track:<id>"), as plain tracks — used when the
/// wave continues from a Yandex track outside My Wave.
pub async fn ym_track_radio(id: &str) -> Result<Vec<Track>, String> {
    let token = ym_token()?;
    let tid = id.split(':').next().unwrap_or(id);
    let b = wave_ym_start(vec![format!("track:{tid}")], None).await?;
    let _ = token;
    Ok(b
        .tracks
        .into_iter()
        .filter_map(|v| serde_json::from_value::<Track>(v).ok())
        .collect())
}

/* ═══════════════════ collections ═══════════════════ */

fn sc_tracks_of(list: &[Value]) -> (Vec<Track>, Vec<String>) {
    let mut full = Vec::new();
    let mut stubs = Vec::new();
    for t in list {
        if t.get("title").and_then(|x| x.as_str()).is_some() {
            if let Some(tr) = crate::api::sc_track(t) {
                full.push(tr);
            }
        } else if let Some(id) = t.get("id") {
            stubs.push(id.to_string().trim_matches('"').to_string());
        }
    }
    (full, stubs)
}

async fn sc_fill(c: &reqwest::Client, cid: &str, stubs: &[String], out: &mut Vec<Track>) {
    for chunk in stubs.chunks(50).take(4) {
        let url = format!("https://api-v2.soundcloud.com/tracks?ids={}&client_id={cid}", chunk.join(","));
        if let Ok(r) = c.get(&url).header(reqwest::header::USER_AGENT, BROWSER_UA).send().await {
            if let Ok(items) = r.json::<Vec<Value>>().await {
                out.extend(items.iter().filter_map(crate::api::sc_track));
            }
        }
    }
}

async fn sc_get(path: &str) -> Result<Value, String> {
    let c = client()?;
    let mut cid = crate::api::sc_client_id().await?;
    for attempt in 0..2 {
        let sep = if path.contains('?') { '&' } else { '?' };
        let url = format!("https://api-v2.soundcloud.com{path}{sep}client_id={cid}");
        let r = c
            .get(&url)
            .header(reqwest::header::USER_AGENT, BROWSER_UA)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        if r.status().as_u16() == 401 && attempt == 0 {
            crate::api::sc_drop_id();
            cid = crate::api::sc_client_id().await?;
            continue;
        }
        return r
            .error_for_status()
            .map_err(|e| format!("SoundCloud: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"));
    }
    Err("SoundCloud rejected the request".into())
}

async fn sc_home() -> Result<Vec<Shelf>, String> {
    let v = sc_get("/mixed-selections?limit=10").await?;
    let mut shelves = Vec::new();
    for sel in v.get("collection").and_then(|c| c.as_array()).cloned().unwrap_or_default() {
        let title = sel.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
        // Promotional voice notes and other non-music selections.
        let urn = sel.get("urn").and_then(|u| u.as_str()).unwrap_or("");
        if urn.contains("promo") {
            continue;
        }
        let mut cards = Vec::new();
        for it in sel.pointer("/items/collection").and_then(|c| c.as_array()).cloned().unwrap_or_default() {
            let kind = it.get("kind").and_then(|k| k.as_str()).unwrap_or("");
            let t = it.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            if t.is_empty() {
                continue;
            }
            let art = it
                .get("artwork_url")
                .or_else(|| it.get("calculated_artwork_url"))
                .and_then(|a| a.as_str())
                .map(|a| a.replace("-large.", "-t500x500."));
            let sub = it
                .pointer("/user/username")
                .and_then(|u| u.as_str())
                .or_else(|| it.get("short_description").and_then(|d| d.as_str()))
                .unwrap_or("SoundCloud")
                .to_string();
            match kind {
                "system-playlist" => {
                    let id = it.get("urn").and_then(|u| u.as_str()).unwrap_or("").to_string();
                    cards.push(Card::new("playlist", "sc", &id, &t, &sub, art));
                }
                "playlist" => {
                    let id = it.get("id").map(|i| i.to_string()).unwrap_or_default();
                    cards.push(Card::new("playlist", "sc", &id, &t, &sub, art));
                }
                _ => {}
            }
        }
        if !cards.is_empty() {
            shelves.push(Shelf { title, s: "sc".into(), cards });
        }
    }
    Ok(shelves)
}

async fn sc_open(id: &str) -> Result<Opened, String> {
    let path = if id.starts_with("soundcloud:system-playlists") {
        format!("/system-playlists/{}", urlencoding::encode(id))
    } else {
        format!("/playlists/{id}")
    };
    let v = sc_get(&path).await?;
    let list = v.get("tracks").and_then(|t| t.as_array()).cloned().unwrap_or_default();
    let (mut tracks, stubs) = sc_tracks_of(&list);
    if !stubs.is_empty() {
        let c = client()?;
        let cid = crate::api::sc_client_id().await?;
        sc_fill(&c, &cid, &stubs, &mut tracks).await;
    }
    Ok(Opened {
        title: v.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
        tracks,
        shelves: vec![],
    })
}

/// SoundCloud's own station for a track — what its "Station" button plays.
pub async fn sc_station(id: &str) -> Result<Vec<Track>, String> {
    let v = sc_get(&format!("/stations/soundcloud:track-stations:{id}/tracks?limit=50")).await?;
    let list = v.get("collection").and_then(|c| c.as_array()).cloned().unwrap_or_default();
    let (mut tracks, stubs) = sc_tracks_of(&list);
    if !stubs.is_empty() {
        let c = client()?;
        let cid = crate::api::sc_client_id().await?;
        sc_fill(&c, &cid, &stubs, &mut tracks).await;
    }
    tracks.retain(|t| t.id != id);
    Ok(tracks)
}

async fn ytm_home(hl: &str) -> Result<Vec<Shelf>, String> {
    let mut out = Vec::new();
    let mut last_err = None;
    for bid in ["FEmusic_explore", "FEmusic_charts"] {
        match crate::ytm::browse_shelves(bid, None, hl).await {
            Ok(mut s) => out.append(&mut s),
            Err(e) => last_err = Some(e),
        }
    }
    // Top artists and the header buttons ("New releases", "Charts") are links
    // to pages we render ourselves; keep the shelves that hold music.
    out.retain(|s| !s.title.is_empty() || s.cards.iter().all(|c| c.kind == "browse"));
    out.retain(|s| s.cards.iter().any(|c| c.kind != "artist"));
    if out.is_empty() {
        return Err(last_err.unwrap_or_else(|| "YouTube Music returned no collections".into()));
    }
    Ok(out)
}

async fn ym_home() -> Result<Vec<Shelf>, String> {
    let token = ym_token()?;
    let v = ym_json(ym_get(
        "/landing3?blocks=personalplaylists,new-releases,new-playlists,chart,mixes",
        &token,
    )?)
    .await?;
    let mut shelves = Vec::new();
    for b in v.pointer("/result/blocks").and_then(|b| b.as_array()).cloned().unwrap_or_default() {
        let title = b.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
        let mut cards = Vec::new();
        for e in b.get("entities").and_then(|e| e.as_array()).cloned().unwrap_or_default() {
            let et = e.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let data = e.get("data").cloned().unwrap_or(Value::Null);
            // personal-playlist entities wrap the playlist once more.
            let d = data.get("data").cloned().unwrap_or(data.clone());
            let cover = |x: &Value| -> Option<String> {
                x.pointer("/cover/uri")
                    .or_else(|| x.get("coverUri"))
                    .or_else(|| x.pointer("/cover/itemsUri/0"))
                    .and_then(|u| u.as_str())
                    .map(|u| format!("https://{}", u.replace("%%", "400x400")))
            };
            match et {
                "personal-playlist" | "playlist" => {
                    let uid = d.get("uid").or_else(|| d.pointer("/owner/uid")).map(|u| u.to_string().trim_matches('"').to_string());
                    let kind = d.get("kind").map(|k| k.to_string().trim_matches('"').to_string());
                    if let (Some(uid), Some(kind)) = (uid, kind) {
                        let t = d.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                        let sub = d.pointer("/owner/name").and_then(|t| t.as_str()).unwrap_or("Яндекс Музыка").to_string();
                        cards.push(Card::new("playlist", "ym", &format!("{uid}:{kind}"), &t, &sub, cover(&d)));
                    }
                }
                "album" => {
                    let id = d.get("id").map(|i| i.to_string().trim_matches('"').to_string()).unwrap_or_default();
                    let t = d.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    let sub = d
                        .get("artists")
                        .and_then(|a| a.as_array())
                        .map(|a| a.iter().filter_map(|x| x.get("name").and_then(|n| n.as_str())).collect::<Vec<_>>().join(", "))
                        .unwrap_or_default();
                    if !id.is_empty() {
                        cards.push(Card::new("album", "ym", &id, &t, &sub, cover(&d)));
                    }
                }
                "chart-item" => {
                    if let Some(tr) = d.get("track").and_then(crate::api::ym_track_pub) {
                        cards.push(Card::track(tr));
                    }
                }
                "mix-link" => {
                    let t = d.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    let url = d.get("url").and_then(|t| t.as_str()).unwrap_or("").to_string();
                    if !url.is_empty() {
                        let mut c = Card::new("browse", "ym", &url, &t, "", None);
                        c.color = d.get("backgroundColor").and_then(|x| x.as_str()).map(|x| x.to_string());
                        cards.push(c);
                    }
                }
                _ => {}
            }
        }
        if !cards.is_empty() {
            shelves.push(Shelf { title, s: "ym".into(), cards });
        }
    }
    if shelves.is_empty() {
        return Err("Яндекс Музыка не вернула подборок".into());
    }
    Ok(shelves)
}

async fn ym_open(kind: &str, id: &str) -> Result<Opened, String> {
    let token = crate::tokens::read_token("ym").ok().flatten().unwrap_or_default();
    match kind {
        "playlist" => {
            let (uid, k) = id.split_once(':').ok_or("bad playlist id")?;
            let v = ym_json(ym_get(&format!("/users/{uid}/playlists/{k}"), &token)?).await?;
            let tracks = v
                .pointer("/result/tracks")
                .and_then(|t| t.as_array())
                .map(|a| a.iter().filter_map(|it| crate::api::ym_track_pub(it.get("track").unwrap_or(it))).collect())
                .unwrap_or_default();
            Ok(Opened {
                title: v.pointer("/result/title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                tracks,
                shelves: vec![],
            })
        }
        "album" => {
            let v = ym_json(ym_get(&format!("/albums/{id}/with-tracks"), &token)?).await?;
            let mut tracks = Vec::new();
            for vol in v.pointer("/result/volumes").and_then(|t| t.as_array()).cloned().unwrap_or_default() {
                for tr in vol.as_array().cloned().unwrap_or_default() {
                    if let Some(t) = crate::api::ym_track_pub(&tr) {
                        tracks.push(t);
                    }
                }
            }
            Ok(Opened {
                title: v.pointer("/result/title").and_then(|t| t.as_str()).unwrap_or("").to_string(),
                tracks,
                shelves: vec![],
            })
        }
        "chart" => {
            let v = ym_json(ym_get("/landing3/chart", &token)?).await?;
            let tracks = v
                .pointer("/result/chart/tracks")
                .and_then(|t| t.as_array())
                .map(|a| a.iter().filter_map(|it| crate::api::ym_track_pub(it.get("track").unwrap_or(it))).collect())
                .unwrap_or_default();
            Ok(Opened { title: "Чарт".into(), tracks, shelves: vec![] })
        }
        _ => Err(format!("unsupported Yandex collection: {kind}")),
    }
}

/// Shelves for the home sheet from one service.
#[tauri::command]
pub async fn feeds_home(service: String, lang: Option<String>) -> Result<Vec<Shelf>, String> {
    let hl = lang.unwrap_or_else(|| "ru".into());
    match service.as_str() {
        "ytm" => ytm_home(&hl).await,
        "sc" => sc_home().await,
        "dz" => crate::dz::home().await,
        "ym" => ym_home().await,
        other => Err(format!("no collections for {other}")),
    }
}

/// Contents of one card: tracks for a playlist/album/radio, shelves for a
/// mood or genre page.
#[tauri::command]
pub async fn feeds_open(service: String, kind: String, id: String, lang: Option<String>) -> Result<Opened, String> {
    let hl = lang.unwrap_or_else(|| "ru".into());
    match service.as_str() {
        "ytm" => match kind.as_str() {
            "browse" => {
                let (bid, params) = id.split_once('|').unwrap_or((id.as_str(), ""));
                let shelves = crate::ytm::browse_shelves(bid, Some(params), &hl).await?;
                Ok(Opened { title: String::new(), tracks: vec![], shelves })
            }
            "album" | "playlist" => {
                let mut tracks = crate::ytm::playlist(&id).await.unwrap_or_default();
                if tracks.is_empty() {
                    tracks = crate::ytm::watch_playlist(&id, None).await?;
                }
                Ok(Opened { title: String::new(), tracks, shelves: vec![] })
            }
            "radio" => Ok(Opened { title: String::new(), tracks: crate::ytm::radio(&id).await?, shelves: vec![] }),
            other => Err(format!("unsupported YouTube Music collection: {other}")),
        },
        "sc" => sc_open(&id).await,
        "dz" => crate::dz::open(&kind, &id).await,
        "ym" => ym_open(&kind, &id).await,
        other => Err(format!("no collections for {other}")),
    }
}

#[cfg(test)]
mod live {
    /// Network smoke test of every new feed; run with `cargo test -- --ignored live_feeds`.
    #[tokio::test]
    #[ignore]
    async fn live_feeds() {
        for s in ["ytm", "sc", "dz"] {
            match super::feeds_home(s.into(), None).await {
                Ok(sh) => {
                    println!("[{s}] {} shelves", sh.len());
                    for x in sh.iter().take(8) {
                        println!("   {} ({}): {}", x.title, x.cards.len(), x.cards.iter().take(3).map(|c| format!("{}:{}", c.kind, c.t)).collect::<Vec<_>>().join(" | "));
                    }
                    if let Some(c) = sh.iter().flat_map(|x| x.cards.iter()).find(|c| c.kind != "track" && c.kind != "artist") {
                        match super::feeds_open(s.into(), c.kind.clone(), c.id.clone(), None).await {
                            Ok(o) => println!("   open {}:{} -> {} tracks, {} shelves; first: {:?}", c.kind, c.t, o.tracks.len(), o.shelves.len(), o.tracks.first().map(|t| format!("{} — {} ({}s)", t.a, t.t, t.d))),
                            Err(e) => println!("   open {} FAILED: {e}", c.t),
                        }
                    }
                }
                Err(e) => println!("[{s}] FAILED: {e}"),
            }
        }
        match crate::ytm::radio("dQw4w9WgXcQ").await {
            Ok(r) => println!("ytm radio: {} tracks, first {:?}", r.len(), r.first().map(|t| &t.t)),
            Err(e) => println!("ytm radio FAILED: {e}"),
        }
        match super::sc_station("1360580203").await {
            Ok(r) => println!("sc station: {} tracks", r.len()),
            Err(e) => println!("sc station FAILED: {e}"),
        }
        match crate::spanon::artist_profile("Daft Punk".into(), None).await {
            Ok(v) => println!("artist: {} monthly={} top={} albums={} related={} header={}", v["name"], v["monthly"], v["top"].as_array().map(|a| a.len()).unwrap_or(0), v["albums"].as_array().map(|a| a.len()).unwrap_or(0), v["related"].as_array().map(|a| a.len()).unwrap_or(0), v["header"]),
            Err(e) => println!("artist FAILED: {e}"),
        }
        for u in [
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=x",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8",
            "https://soundcloud.com/glowstickjones/a_02_main-theme-tda-version",
            "https://www.deezer.com/track/3135556",
            "https://www.deezer.com/album/302127",
        ] {
            match crate::links::link_resolve(u.into()).await {
                Ok(r) => println!("link {u} -> {} {} tracks, first {:?}", r.kind, r.tracks.len(), r.tracks.first().map(|t| format!("{} — {}", t.a, t.t))),
                Err(e) => println!("link {u} FAILED: {e}"),
            }
        }
        match crate::dz::stream_url("3135556", 1, "best").await {
            Ok(u) => println!("dz stream -> {}", &u[..u.len().min(90)]),
            Err(e) => println!("dz stream FAILED: {e}"),
        }
    }
}
