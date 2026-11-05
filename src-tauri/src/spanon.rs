//! Spotify without an account: artist profiles for the artist page.
//!
//! The embed player hands every anonymous visitor a short-lived web token, and
//! with it the same GraphQL endpoint the web player uses ("pathfinder")
//! answers `queryArtistOverview`: header image, avatar, gallery, monthly
//! listeners, biography, top tracks with play counts, releases and related
//! artists — the artist card the user sees on Spotify. The persisted-query hash
//! is a build constant of the web player; when Spotify rotates it the request
//! fails with PersistedQueryNotFound and the current one is read back out of
//! the web player's own bundle.
//!
//! Search works the same way: the web player's `searchSuggestions` query
//! answers an anonymous token with full track cards (title, artists, album,
//! cover, length). The public Web API (`api.spotify.com/v1/search`) is not
//! used without an account — the embed client's quota there is spent
//! (429 QUOTA_EXCEEDED) for everyone.
//!
//! Not available this way: Canvas loops. The canvas query answers null for an
//! anonymous token, so the page animates the header image instead of
//! pretending to have a video.

use serde_json::{json, Value};
use std::sync::Mutex;

use crate::api::{client, BROWSER_UA};

static TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);
static HASH: Mutex<Option<String>> = Mutex::new(None);
static HASHES: Mutex<Vec<(String, String)>> = Mutex::new(Vec::new());
const DEFAULT_HASH: &str = "9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6";
const SUGGEST_HASH: &str = "f244254b94c0e824d458ac216e0f8406a73f2f69a9ff52831a2f78fa774ff6ce";

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn next_data(html: &str) -> Option<Value> {
    let start = html.find("<script id=\"__NEXT_DATA__\"")?;
    let after = &html[start..];
    let body = &after[after.find('>')? + 1..];
    let end = body.find("</script>")?;
    serde_json::from_str(&body[..end]).ok()
}

/// Anonymous web token, cached until a minute before it expires.
pub async fn anon_token() -> Result<String, String> {
    if let Ok(g) = TOKEN.lock() {
        if let Some((t, exp)) = g.as_ref() {
            if *exp > now_ms() + 60_000 {
                return Ok(t.clone());
            }
        }
    }
    let html = client()?
        .get("https://open.spotify.com/embed/artist/0TnOYISbd1XYRBk9myaseg")
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Spotify: {e}"))?;
    let data = next_data(&html).ok_or("Spotify embed page changed: no __NEXT_DATA__")?;
    let session = data
        .pointer("/props/pageProps/state/settings/session")
        .ok_or("Spotify embed page changed: no session")?;
    let tok = session
        .get("accessToken")
        .and_then(|t| t.as_str())
        .ok_or("Spotify gave no anonymous token")?
        .to_string();
    let exp = session
        .get("accessTokenExpirationTimestampMs")
        .and_then(|e| e.as_u64())
        .unwrap_or(now_ms() + 30 * 60_000);
    if let Ok(mut g) = TOKEN.lock() {
        *g = Some((tok.clone(), exp));
    }
    Ok(tok)
}

/// The current persisted-query hash of `queryArtistOverview`, read out of the
/// web player bundle.
async fn scrape_hash() -> Result<String, String> {
    let h = scrape_hash_for("queryArtistOverview").await?;
    if let Ok(mut g) = HASH.lock() {
        *g = Some(h.clone());
    }
    Ok(h)
}

/// The current persisted-query hash of any web-player operation.
async fn scrape_hash_for(op: &str) -> Result<String, String> {
    let c = client()?;
    let html = c
        .get("https://open.spotify.com/")
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .text()
        .await
        .map_err(|e| format!("Spotify: {e}"))?;
    let marker = "https://open.spotifycdn.com/cdn/build/web-player/web-player.";
    let mut scripts = Vec::new();
    let mut from = 0;
    while let Some(p) = html[from..].find(marker) {
        let s = from + p;
        let end = html[s..].find(".js").map(|e| s + e + 3).unwrap_or(s);
        if end > s {
            scripts.push(html[s..end].to_string());
        }
        from = s + marker.len();
    }
    let needle = format!("\"{op}\",\"query\",\"");
    for src in scripts {
        let js = match c.get(&src).header(reqwest::header::USER_AGENT, BROWSER_UA).send().await {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => continue,
        };
        if let Some(p) = js.find(&needle) {
            let h = &js[p + needle.len()..];
            let hash: String = h.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
            if hash.len() == 64 {
                if let Ok(mut g) = HASHES.lock() {
                    g.retain(|(k, _)| k != op);
                    g.push((op.to_string(), hash.clone()));
                }
                return Ok(hash);
            }
        }
    }
    Err(format!("could not find `{op}` in the Spotify web player"))
}

fn known_hash(op: &str, default: &str) -> String {
    HASHES
        .lock()
        .ok()
        .and_then(|g| g.iter().find(|(k, _)| k == op).map(|(_, h)| h.clone()))
        .unwrap_or_else(|| default.to_string())
}

fn drop_token() {
    if let Ok(mut g) = TOKEN.lock() {
        *g = None;
    }
}

/// One persisted query against the web player's GraphQL endpoint with the
/// anonymous token: a rotated hash is read back from the bundle once, an
/// expired or refused token is fetched again once.
async fn pathfinder(op: &str, default_hash: &str, variables: Value) -> Result<Value, String> {
    let mut hash = known_hash(op, default_hash);
    let mut fresh_token = false;
    let mut fresh_hash = false;
    loop {
        let tok = anon_token().await?;
        let body = json!({
            "variables": variables,
            "operationName": op,
            "extensions": { "persistedQuery": { "version": 1, "sha256Hash": hash } }
        });
        let resp = client()?
            .post("https://api-partner.spotify.com/pathfinder/v2/query")
            .header("Authorization", format!("Bearer {tok}"))
            .header("app-platform", "WebPlayer")
            .header("Content-Type", "application/json;charset=UTF-8")
            .header(reqwest::header::USER_AGENT, BROWSER_UA)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        let status = resp.status();
        if (status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN) && !fresh_token {
            drop_token();
            fresh_token = true;
            continue;
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err("Spotify: too many requests, try again in a minute".into());
        }
        let v: Value = resp.json().await.map_err(|e| format!("Spotify: {e}"))?;
        if v.get("data").map(|d| !d.is_null()).unwrap_or(false) {
            return Ok(v);
        }
        if v.to_string().contains("PersistedQueryNotFound") && !fresh_hash {
            fresh_hash = true;
            hash = scrape_hash_for(op).await?;
            continue;
        }
        return Err(format!(
            "Spotify: {}",
            v.pointer("/errors/0/message").and_then(|m| m.as_str()).unwrap_or("empty answer")
        ));
    }
}

fn suggest_vars(q: &str) -> Value {
    json!({
        "query": q, "limit": 30, "numberOfTopResults": 30, "offset": 0,
        "includeAuthors": false, "includeAlbumPreReleases": false,
        "includeEpisodeContentRatingsV2": false
    })
}

/// The largest cover up to 640 px (the 300 px one when sizes are missing).
fn cover_of(sources: Option<&Value>) -> Option<String> {
    let arr = sources?.as_array()?;
    arr.iter()
        .filter_map(|s| Some((s.get("width").and_then(|w| w.as_u64()).unwrap_or(300), s.get("url")?.as_str()?)))
        .filter(|(w, _)| *w <= 640)
        .max_by_key(|(w, _)| *w)
        .map(|(_, u)| u.to_string())
}

/// One track card of a `searchV2` answer, as the app's track.
fn track_of(d: &Value) -> Option<crate::api::Track> {
    if d.get("__typename").and_then(|t| t.as_str()) != Some("Track") {
        return None;
    }
    let name = d.get("name")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    let id = d
        .get("id")
        .and_then(|i| i.as_str())
        .map(|s| s.to_string())
        .or_else(|| d.get("uri")?.as_str()?.rsplit(':').next().map(|s| s.to_string()))?;
    let artists: Vec<&str> = d
        .pointer("/artists/items")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().filter_map(|x| x.pointer("/profile/name")?.as_str()).collect())
        .unwrap_or_default();
    Some(crate::api::Track {
        id,
        s: "sp".into(),
        t: name.to_string(),
        a: if artists.is_empty() { "—".into() } else { artists.join(", ") },
        al: d.pointer("/albumOfTrack/name").and_then(|a| a.as_str()).unwrap_or("").to_string(),
        d: (d.pointer("/duration/totalMilliseconds").and_then(|m| m.as_u64()).unwrap_or(0) / 1000) as u32,
        art: cover_of(d.pointer("/albumOfTrack/coverArt/sources")),
        mode: "web".into(),
    })
}

/// Tracks out of the top results of a `searchSuggestions` answer.
fn tracks_of(v: &Value) -> Vec<crate::api::Track> {
    let mut out: Vec<crate::api::Track> = Vec::new();
    for it in v.pointer("/data/searchV2/topResultsV2/itemsV2").and_then(|i| i.as_array()).into_iter().flatten() {
        if let Some(t) = it.pointer("/item/data").and_then(track_of) {
            if !out.iter().any(|x| x.id == t.id) {
                out.push(t);
            }
        }
    }
    out
}

/// Spotify search without an account (see the module notes).
pub async fn search_tracks(q: &str) -> Result<Vec<crate::api::Track>, String> {
    let v = pathfinder("searchSuggestions", SUGGEST_HASH, suggest_vars(q)).await?;
    Ok(tracks_of(&v))
}

async fn overview(uri: &str) -> Result<Value, String> {
    let tok = anon_token().await?;
    let mut hash = HASH.lock().ok().and_then(|g| g.clone()).unwrap_or_else(|| DEFAULT_HASH.to_string());
    for attempt in 0..2 {
        let body = json!({
            "variables": { "uri": uri, "locale": "", "includePrerelease": true },
            "operationName": "queryArtistOverview",
            "extensions": { "persistedQuery": { "version": 1, "sha256Hash": hash } }
        });
        let v: Value = client()?
            .post("https://api-partner.spotify.com/pathfinder/v2/query")
            .header("Authorization", format!("Bearer {tok}"))
            .header("app-platform", "WebPlayer")
            .header("Content-Type", "application/json;charset=UTF-8")
            .header(reqwest::header::USER_AGENT, BROWSER_UA)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Spotify: {e}"))?;
        if let Some(a) = v.pointer("/data/artistUnion") {
            if a.get("__typename").and_then(|t| t.as_str()) == Some("Artist") {
                return Ok(a.clone());
            }
            return Err("Spotify does not know this artist".into());
        }
        let missing = v.to_string().contains("PersistedQueryNotFound");
        if missing && attempt == 0 {
            hash = scrape_hash().await?;
            continue;
        }
        return Err(format!("Spotify: {}", v.pointer("/errors/0/message").and_then(|m| m.as_str()).unwrap_or("no artist data")));
    }
    Err("Spotify: no artist data".into())
}

async fn find_artist(name: &str) -> Result<String, String> {
    let v = pathfinder("searchSuggestions", SUGGEST_HASH, suggest_vars(name)).await?;
    let want = crate::matching::fold(name);
    let want = want.trim();
    let mut first: Option<String> = None;
    for it in v.pointer("/data/searchV2/topResultsV2/itemsV2").and_then(|i| i.as_array()).into_iter().flatten() {
        let d = match it.pointer("/item/data") {
            Some(d) if d.get("__typename").and_then(|t| t.as_str()) == Some("Artist") => d,
            _ => continue,
        };
        let id = match d.get("uri").and_then(|u| u.as_str()).and_then(|u| u.strip_prefix("spotify:artist:")) {
            Some(id) => id.to_string(),
            None => continue,
        };
        let n = d.pointer("/profile/name").and_then(|n| n.as_str()).unwrap_or("");
        if crate::matching::fold(n).trim() == want {
            return Ok(id);
        }
        first.get_or_insert(id);
    }
    first.ok_or_else(|| "Spotify does not know this artist".into())
}

fn src_url(v: Option<&Value>, prefer_big: bool) -> Option<String> {
    let arr = v?.as_array()?;
    let pick = if prefer_big {
        arr.iter().max_by_key(|s| {
            s.get("width").or_else(|| s.get("maxWidth")).and_then(|w| w.as_u64()).unwrap_or(0)
        })
    } else {
        arr.first()
    };
    pick.and_then(|s| s.get("url")).and_then(|u| u.as_str()).map(|s| s.to_string())
}

fn release(it: &Value) -> Option<Value> {
    let r = it.pointer("/releases/items/0").unwrap_or(it);
    let id = r.get("id").and_then(|i| i.as_str())?;
    let year = r.pointer("/date/year").and_then(|y| y.as_u64()).map(|y| y.to_string()).unwrap_or_default();
    let ty = r.get("type").and_then(|t| t.as_str()).unwrap_or("").to_lowercase();
    let sub: Vec<String> = vec![year, ty].into_iter().filter(|x| !x.is_empty()).collect();
    let sub = sub.join(" · ");
    Some(json!({
        "kind": "album", "s": "sp", "id": id,
        "t": r.get("name"),
        "sub": sub,
        "art": src_url(r.pointer("/coverArt/sources"), true),
    }))
}

fn html_unescape(s: &str) -> String {
    let mut out = s
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">");
    // Numeric entities ("&#x1f525;", "&#8217;").
    while let Some(p) = out.find("&#") {
        let Some(end) = out[p..].find(';').map(|e| p + e) else { break };
        let code = &out[p + 2..end];
        let n = if let Some(h) = code.strip_prefix('x').or_else(|| code.strip_prefix('X')) {
            u32::from_str_radix(h, 16).ok()
        } else {
            code.parse::<u32>().ok()
        };
        let rep = n.and_then(char::from_u32).map(|c| c.to_string()).unwrap_or_default();
        out.replace_range(p..=end, &rep);
    }
    // Links in biographies come as <a href="spotify:…">name</a>; keep the text.
    let mut clean = String::with_capacity(out.len());
    let mut in_tag = false;
    for ch in out.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            c if !in_tag => clean.push(c),
            _ => {}
        }
    }
    clean
}

fn shape(a: &Value) -> Value {
    let name = a.pointer("/profile/name").and_then(|n| n.as_str()).unwrap_or("").to_string();
    let top: Vec<Value> = a
        .pointer("/discography/topTracks/items")
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|it| {
            let tr = it.get("track")?;
            let id = tr.get("id").and_then(|i| i.as_str())?;
            let artists = tr
                .pointer("/artists/items")
                .and_then(|x| x.as_array())
                .map(|xs| xs.iter().filter_map(|x| x.pointer("/profile/name").and_then(|n| n.as_str())).collect::<Vec<_>>().join(", "))
                .unwrap_or_else(|| name.clone());
            Some(json!({
                "id": id, "s": "sp", "mode": "web",
                "t": tr.get("name"),
                "a": artists,
                "al": "",
                "d": tr.pointer("/duration/totalMilliseconds").and_then(|d| d.as_u64()).unwrap_or(0) / 1000,
                "art": src_url(tr.pointer("/albumOfTrack/coverArt/sources"), true),
                "plays": tr.get("playcount").and_then(|p| p.as_str()).and_then(|p| p.parse::<u64>().ok()),
                "exp": tr.pointer("/contentRating/label").and_then(|l| l.as_str()) == Some("EXPLICIT"),
            }))
        })
        .collect();
    let releases = |path: &str| -> Vec<Value> {
        a.pointer(path)
            .and_then(|i| i.as_array())
            .map(|xs| xs.iter().filter_map(release).collect())
            .unwrap_or_default()
    };
    let related: Vec<Value> = a
        .pointer("/relatedContent/relatedArtists/items")
        .and_then(|i| i.as_array())
        .map(|xs| {
            xs.iter()
                .map(|x| {
                    json!({
                        "id": x.get("id"),
                        "name": x.pointer("/profile/name"),
                        "art": src_url(x.pointer("/visuals/avatarImage/sources"), true),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let gallery: Vec<String> = a
        .pointer("/visuals/gallery/items")
        .and_then(|i| i.as_array())
        .map(|xs| xs.iter().filter_map(|x| src_url(x.get("sources"), true)).collect())
        .unwrap_or_default();
    let cities: Vec<Value> = a
        .pointer("/stats/topCities/items")
        .and_then(|i| i.as_array())
        .map(|xs| {
            xs.iter()
                .map(|c| json!({ "city": c.get("city"), "country": c.get("country"), "n": c.get("numberOfListeners") }))
                .collect()
        })
        .unwrap_or_default();
    let bio = a
        .pointer("/profile/biography/text")
        .and_then(|b| b.as_str())
        .map(html_unescape)
        .unwrap_or_default();
    json!({
        "source": "sp",
        "id": a.get("id"),
        "name": name,
        "verified": a.pointer("/profile/verified").or_else(|| a.pointer("/onPlatformReputationTrait/verification/isVerified")),
        "avatar": src_url(a.pointer("/visuals/avatarImage/sources"), true),
        "header": src_url(a.pointer("/headerImage/data/sources"), true),
        "color": a.pointer("/visuals/avatarImage/extractedColors/colorRaw/hex"),
        "gallery": gallery,
        "followers": a.pointer("/stats/followers"),
        "monthly": a.pointer("/stats/monthlyListeners"),
        "rank": a.pointer("/stats/worldRank"),
        "cities": cities,
        "bio": bio,
        "top": top,
        "albums": releases("/discography/albums/items"),
        "singles": releases("/discography/singles/items"),
        "popular": releases("/discography/popularReleasesAlbums/items"),
        "related": related,
    })
}

/// Artist card for the artist page: Spotify first (richest), Deezer second.
#[tauri::command]
pub async fn artist_profile(name: String, sp_id: Option<String>) -> Result<Value, String> {
    let name = name.trim().to_string();
    let sp = async {
        let id = match sp_id.clone().filter(|s| !s.is_empty()) {
            Some(id) => id,
            None => find_artist(&name).await?,
        };
        overview(&format!("spotify:artist:{id}")).await.map(|a| shape(&a))
    }
    .await;
    match sp {
        Ok(v) => Ok(v),
        Err(e) => {
            eprintln!("[meowave] artist_profile spotify: {e}");
            crate::dz::artist(&name).await.map_err(|dz| format!("{e}; {dz}"))
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn reads_search_cards() {
        let v: serde_json::Value = serde_json::from_str(r#"{"data":{"searchV2":{"topResultsV2":{"itemsV2":[
          {"item":{"__typename":"SearchAutoCompleteEntity","data":{}}},
          {"item":{"__typename":"TrackResponseWrapper","data":{"__typename":"Track","id":"2nLtzopw4rPReszdYBJU6h","name":"Numb",
            "uri":"spotify:track:2nLtzopw4rPReszdYBJU6h","duration":{"totalMilliseconds":187520},
            "albumOfTrack":{"name":"Meteora","coverArt":{"sources":[{"height":300,"width":300,"url":"https://i.scdn.co/a300"},{"height":64,"width":64,"url":"https://i.scdn.co/a64"},{"height":640,"width":640,"url":"https://i.scdn.co/a640"}]}},
            "artists":{"items":[{"profile":{"name":"Linkin Park"}},{"profile":{"name":"JAY-Z"}}]}}}},
          {"item":{"__typename":"TrackResponseWrapper","data":{"__typename":"Track","id":"2nLtzopw4rPReszdYBJU6h","name":"Numb","uri":"spotify:track:2nLtzopw4rPReszdYBJU6h"}}},
          {"item":{"__typename":"ArtistResponseWrapper","data":{"__typename":"Artist","uri":"spotify:artist:6XyY86QOPPrYVGvF9ch6wz","profile":{"name":"Linkin Park"}}}}
        ]}}}}"#).unwrap();
        let t = super::tracks_of(&v);
        assert_eq!(t.len(), 1, "duplicates and non-tracks are skipped");
        assert_eq!(t[0].t, "Numb");
        assert_eq!(t[0].a, "Linkin Park, JAY-Z");
        assert_eq!(t[0].al, "Meteora");
        assert_eq!(t[0].d, 187);
        assert_eq!(t[0].art.as_deref(), Some("https://i.scdn.co/a640"));
        assert_eq!(t[0].s, "sp");
    }

    #[test]
    fn unescapes_bios() {
        assert_eq!(super::html_unescape("sh0w &#x1f525; &amp; <a href=\"x\">Name</a>"), "sh0w 🔥 & Name");
    }
}
