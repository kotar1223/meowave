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
//! Not available this way: Canvas loops. The canvas query answers null for an
//! anonymous token, so the page animates the header image instead of
//! pretending to have a video.

use serde_json::{json, Value};
use std::sync::Mutex;

use crate::api::{client, BROWSER_UA};

static TOKEN: Mutex<Option<(String, u64)>> = Mutex::new(None);
static HASH: Mutex<Option<String>> = Mutex::new(None);
const DEFAULT_HASH: &str = "9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6";

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
    let needle = "\"queryArtistOverview\",\"query\",\"";
    for src in scripts {
        let js = match c.get(&src).header(reqwest::header::USER_AGENT, BROWSER_UA).send().await {
            Ok(r) => r.text().await.unwrap_or_default(),
            Err(_) => continue,
        };
        if let Some(p) = js.find(needle) {
            let h = &js[p + needle.len()..];
            let hash: String = h.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
            if hash.len() == 64 {
                if let Ok(mut g) = HASH.lock() {
                    *g = Some(hash.clone());
                }
                return Ok(hash);
            }
        }
    }
    Err("could not find the artist query in the Spotify web player".into())
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
    let tok = anon_token().await?;
    let v: Value = client()?
        .get(format!(
            "https://api.spotify.com/v1/search?type=artist&limit=5&q={}",
            urlencoding::encode(name)
        ))
        .header("Authorization", format!("Bearer {tok}"))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Spotify search: {e}"))?
        .json()
        .await
        .map_err(|e| format!("Spotify search: {e}"))?;
    let items = v.pointer("/artists/items").and_then(|i| i.as_array()).cloned().unwrap_or_default();
    let want = crate::matching::fold(name);
    let want = want.trim();
    items
        .iter()
        .find(|a| a.get("name").and_then(|n| n.as_str()).map(|n| crate::matching::fold(n).trim() == want).unwrap_or(false))
        .or_else(|| items.first())
        .and_then(|a| a.get("id").and_then(|i| i.as_str()))
        .map(|s| s.to_string())
        .ok_or_else(|| "Spotify does not know this artist".into())
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
    fn unescapes_bios() {
        assert_eq!(super::html_unescape("sh0w &#x1f525; &amp; <a href=\"x\">Name</a>"), "sh0w 🔥 & Name");
    }
}
