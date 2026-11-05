//! The user's own accounts on YouTube Music, SoundCloud and Deezer: liked
//! tracks and playlists to bring into the library, and a personal shelf for
//! the home sheet.
//!
//! Signing in happens on the service's own page, in a separate app window
//! with a browser profile of its own and no access to the app's IPC. Rust
//! polls that window's cookie jar; once the session cookie is there and the
//! service confirms whose it is, only that credential is kept (in the
//! keychain, see tokens.rs) and the window closes. Playback never depends on
//! it: all three services stream without an account, so a session that
//! expires costs the import and the personal shelves, nothing else.
//!
//! Round 6: the sign-in opens in the user's own browser first
//! (`acc_login_browser`, see browser.rs); the app window is the fallback for
//! a machine without a Chromium-family browser. Where a service refuses both
//! (Google sometimes declines embedded browsers) the same credential can be
//! pasted by hand, see `acc_paste`.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::api::{client, Track, BROWSER_UA};
use crate::feeds::{Card, Shelf};

struct Spec {
    id: &'static str,
    /// Keychain entry, see tokens.rs.
    key: &'static str,
    login: &'static str,
    /// The page whose cookies carry the session.
    jar: &'static str,
    /// Google declines a sign-in from what it takes for an embedded browser;
    /// a desktop Firefox identity gets the regular page.
    ua: Option<&'static str>,
}

const SPECS: &[Spec] = &[
    Spec {
        id: "ytm",
        key: "ytm_cookie",
        login: "https://accounts.google.com/ServiceLogin?service=youtube&passive=true&continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26next%3Dhttps%253A%252F%252Fmusic.youtube.com%252F",
        jar: "https://music.youtube.com/",
        ua: Some("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0"),
    },
    Spec {
        id: "sc",
        key: "sc_oauth",
        login: "https://soundcloud.com/signin",
        jar: "https://soundcloud.com/",
        ua: None,
    },
    Spec {
        id: "dz",
        key: "dz_arl",
        login: "https://www.deezer.com/login",
        jar: "https://www.deezer.com/",
        ua: None,
    },
];

/// Id of the "liked tracks" pseudo-playlist, the same for every service.
pub const LIKED: &str = "me:liked";

/// The cookies a signed YouTube request needs. The rest of the jar (consent,
/// preferences, tracking) is not kept.
const YTM_KEEP: &[&str] = &[
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "__Secure-1PSID",
    "__Secure-3PSID",
    "__Secure-1PAPISID",
    "__Secure-3PAPISID",
    "__Secure-1PSIDTS",
    "__Secure-3PSIDTS",
];

fn spec(id: &str) -> Result<&'static Spec, String> {
    SPECS
        .iter()
        .find(|s| s.id == id)
        .ok_or_else(|| format!("no account sign-in for {id}"))
}

fn name_of(id: &str) -> &str {
    match id {
        "ytm" => "YouTube Music",
        "sc" => "SoundCloud",
        "dz" => "Deezer",
        other => other,
    }
}

/// The stored credential, if the user connected this service.
pub fn credential(service: &str) -> Option<String> {
    let key = spec(service).ok()?.key;
    crate::tokens::read_token(key)
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
}

fn need(service: &str) -> Result<String, String> {
    spec(service)?;
    credential(service).ok_or_else(|| format!("{}: not signed in", name_of(service)))
}

/// The credential out of cookie pairs: a window's jar or a pasted header.
fn extract(service: &str, pairs: &[(String, String)]) -> Option<String> {
    let get = |n: &str| {
        pairs
            .iter()
            .find(|(k, v)| k == n && !v.is_empty())
            .map(|(_, v)| v.clone())
    };
    match service {
        "ytm" => {
            get("SAPISID").or_else(|| get("__Secure-3PAPISID"))?;
            // Without the session id itself a signed request is a guest one.
            get("SID").or_else(|| get("__Secure-3PSID"))?;
            let kept: Vec<String> = YTM_KEEP
                .iter()
                .filter_map(|n| get(n).map(|v| format!("{n}={v}")))
                .collect();
            Some(kept.join("; "))
        }
        "sc" => get("oauth_token"),
        "dz" => get("arl"),
        _ => None,
    }
}

/// What a user pastes: a whole `Cookie:` header, `name=value`, or for
/// SoundCloud and Deezer the bare value.
fn parse_paste(service: &str, raw: &str) -> Result<String, String> {
    let raw = raw.trim().trim_matches('"').trim();
    let raw = raw
        .strip_prefix("Cookie:")
        .or_else(|| raw.strip_prefix("cookie:"))
        .unwrap_or(raw)
        .trim();
    let pairs: Vec<(String, String)> = raw
        .split(';')
        .filter_map(|p| p.trim().split_once('='))
        .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
        .collect();
    if let Some(c) = extract(service, &pairs) {
        return Ok(c);
    }
    if matches!(service, "sc" | "dz") && !raw.contains('=') {
        let v = raw.strip_prefix("OAuth ").unwrap_or(raw).trim();
        if v.len() >= 16 && !v.contains(char::is_whitespace) {
            return Ok(v.to_string());
        }
    }
    Err(format!("paste: no {} session in the text", name_of(service)))
}

/* ─────────────────────────── state ─────────────────────────── */

#[derive(Serialize, Clone, Default)]
pub struct AccState {
    pub service: String,
    pub connected: bool,
    pub user: Option<String>,
    pub avatar: Option<String>,
    /// Set when the service did not confirm the session (expired, network).
    pub error: Option<String>,
}

/// Confirmed profiles, so that opening Settings does not ask every service
/// who the user is each time.
static SEEN: Mutex<Vec<(AccState, Instant)>> = Mutex::new(Vec::new());

fn remember(st: AccState) {
    if let Ok(mut g) = SEEN.lock() {
        g.retain(|(s, _)| s.service != st.service);
        g.push((st, Instant::now()));
    }
}

fn forget(service: &str) {
    if let Ok(mut g) = SEEN.lock() {
        g.retain(|(s, _)| s.service != service);
    }
}

fn cached(service: &str) -> Option<AccState> {
    let g = SEEN.lock().ok()?;
    g.iter()
        .find(|(s, at)| s.service == service && at.elapsed() < Duration::from_secs(900))
        .map(|(s, _)| s.clone())
}

async fn profile(service: &str, cred: &str) -> Result<(String, Option<String>), String> {
    match service {
        "ytm" => crate::ytm::account(cred).await,
        "sc" => sc_me(cred).await.map(|me| (me.name, me.avatar)),
        "dz" => dz_session(cred, true).await.map(|s| (s.name, s.avatar)),
        other => Err(format!("no account sign-in for {other}")),
    }
}

async fn state_of(service: &str) -> AccState {
    let Some(cred) = credential(service) else {
        return AccState { service: service.into(), ..Default::default() };
    };
    if let Some(s) = cached(service) {
        return s;
    }
    match profile(service, &cred).await {
        Ok((user, avatar)) => {
            let st = AccState { service: service.into(), connected: true, user: Some(user), avatar, error: None };
            remember(st.clone());
            st
        }
        // Still connected: a network hiccup must not look like a sign-out.
        Err(e) => AccState { service: service.into(), connected: true, user: None, avatar: None, error: Some(e) },
    }
}

#[tauri::command]
pub async fn acc_status(service: String) -> Result<AccState, String> {
    spec(&service)?;
    Ok(state_of(&service).await)
}

/* ─────────────────────────── sign-in ─────────────────────────── */

#[tauri::command]
pub async fn acc_login(app: AppHandle, service: String) -> Result<(), String> {
    let sp = spec(&service)?;
    let label = format!("acc-{}", sp.id);
    if let Some(w) = app.get_webview_window(&label) {
        // Desktop only: a mobile webview window has no minimised state
        // (this line alone broke the iOS build).
        #[cfg(desktop)]
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let url: tauri::Url = sp.login.parse().map_err(|e| format!("bad sign-in address: {e}"))?;
    let mut b = tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(url))
        .title(format!("{} · Meowave", name_of(sp.id)))
        .inner_size(500.0, 740.0)
        .min_inner_size(380.0, 520.0)
        .focused(true);
    #[cfg(desktop)]
    {
        b = b.center();
    }
    // A profile of its own per service: the app's storage is not shared
    // with a third-party page, and signing out can drop the whole session.
    if let Ok(root) = crate::paths::root() {
        b = b.data_directory(root.join("accounts").join(sp.id));
    }
    if let Some(ua) = sp.ua {
        b = b.user_agent(ua);
    }
    b.build().map_err(|e| format!("could not open the sign-in window: {e}"))?;
    tauri::async_runtime::spawn(watch(app, sp, label));
    Ok(())
}

/// Polls the sign-in window until its jar holds a session the service
/// confirms, then keeps the credential and closes the window.
async fn watch(app: AppHandle, sp: &'static Spec, label: String) {
    let Ok(jar) = sp.jar.parse::<tauri::Url>() else { return };
    let mut jar_errors = 0;
    let mut tried = String::new();
    // Ten minutes: enough for a password manager, a code by SMS, a captcha.
    for n in 0..400u32 {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let Some(win) = app.get_webview_window(&label) else {
            let _ = app.emit("acc-changed", json!({ "service": sp.id, "ok": false, "closed": true }));
            return;
        };
        let (w, j) = (win.clone(), jar.clone());
        // The cookie call waits on the UI thread; it must not run on it.
        let cookies = match tauri::async_runtime::spawn_blocking(move || w.cookies_for_url(j)).await {
            Ok(Ok(c)) => c,
            _ => {
                jar_errors += 1;
                if jar_errors > 6 {
                    let _ = app.emit("acc-changed", json!({ "service": sp.id, "ok": false, "error": "cookies" }));
                    return;
                }
                continue;
            }
        };
        let pairs: Vec<(String, String)> = cookies
            .iter()
            .map(|c| (c.name().to_string(), c.value().to_string()))
            .collect();
        let Some(cred) = extract(sp.id, &pairs) else { continue };
        // A refused session is asked about again only now and then: the
        // page may still be finishing the sign-in.
        if cred == tried && n % 6 != 0 {
            continue;
        }
        match profile(sp.id, &cred).await {
            Ok((user, avatar)) => {
                if let Err(e) = crate::tokens::set_service_token(sp.key.into(), cred) {
                    let _ = app.emit("acc-changed", json!({ "service": sp.id, "ok": false, "error": e }));
                    return;
                }
                remember(AccState { service: sp.id.into(), connected: true, user: Some(user.clone()), avatar, error: None });
                let _ = app.emit("acc-changed", json!({ "service": sp.id, "ok": true, "user": user }));
                let _ = win.close();
                if let Some(main) = app.get_webview_window("main") {
                    let _ = main.set_focus();
                }
                return;
            }
            Err(_) => tried = cred,
        }
    }
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.close();
    }
    let _ = app.emit("acc-changed", json!({ "service": sp.id, "ok": false, "error": "timeout" }));
}

/* ─────────────────── sign-in in the user's browser ─────────────────── */

/// Services whose browser sign-in is under way.
static IN_BROWSER: Mutex<Vec<&'static str>> = Mutex::new(Vec::new());

fn browser_dir(id: &str) -> Result<std::path::PathBuf, String> {
    Ok(crate::paths::root()?.join("accounts").join(format!("{id}-browser")))
}

/// Round 6: the sign-in page opens in the user's own browser (a Chromium:
/// the default one, else Chrome or Edge — see browser.rs) instead of an app
/// window. Answers the browser's name, or an empty string when that sign-in
/// is already open. Fails with "no-browser" when there is no Chromium on the
/// machine, so the frontend falls back to `acc_login`.
#[tauri::command]
pub async fn acc_login_browser(app: AppHandle, service: String) -> Result<String, String> {
    let sp = spec(&service)?;
    if IN_BROWSER.lock().map(|g| g.contains(&sp.id)).unwrap_or(false) {
        return Ok(String::new());
    }
    let b = crate::browser::find().ok_or("no-browser")?;
    let dir = browser_dir(sp.id)?;
    let name = b.name.to_string();
    let session = tauri::async_runtime::spawn_blocking(move || crate::browser::launch(&b, &dir, sp.login))
        .await
        .map_err(|e| e.to_string())??;
    if let Ok(mut g) = IN_BROWSER.lock() {
        g.push(sp.id);
    }
    std::thread::spawn(move || watch_browser(app, sp, session));
    Ok(name)
}

/// Reads the browser's cookie jar until the service confirms a session,
/// keeps the credential and closes the browser; gives up when the user
/// closes it or after ten minutes.
fn watch_browser(app: AppHandle, sp: &'static Spec, mut s: crate::browser::Session) {
    let host = sp
        .jar
        .parse::<tauri::Url>()
        .ok()
        .and_then(|u| u.host_str().map(str::to_string))
        .unwrap_or_default();
    let t0 = Instant::now();
    let (mut tried, mut n, mut empty) = (String::new(), 0u32, 0u32);
    let outcome = loop {
        std::thread::sleep(Duration::from_millis(1500));
        n += 1;
        if t0.elapsed() > Duration::from_secs(600) {
            break json!({ "service": sp.id, "ok": false, "error": "timeout" });
        }
        // Every window closed (or the browser itself): the user gave up.
        match s.has_pages() {
            Ok(true) => empty = 0,
            Ok(false) if empty < 1 => {
                empty += 1;
                continue;
            }
            _ => break json!({ "service": sp.id, "ok": false, "closed": true }),
        }
        let Ok(jar) = s.cookies() else {
            break json!({ "service": sp.id, "ok": false, "closed": true });
        };
        let pairs: Vec<(String, String)> = jar
            .into_iter()
            .filter(|(_, _, d)| crate::browser::domain_matches(d, &host))
            .map(|(k, v, _)| (k, v))
            .collect();
        let Some(cred) = extract(sp.id, &pairs) else { continue };
        // A refused session is asked about again only now and then: the
        // page may still be finishing the sign-in.
        if cred == tried && n % 6 != 0 {
            continue;
        }
        match tauri::async_runtime::block_on(profile(sp.id, &cred)) {
            Ok((user, avatar)) => {
                if let Err(e) = crate::tokens::set_service_token(sp.key.into(), cred) {
                    break json!({ "service": sp.id, "ok": false, "error": e });
                }
                remember(AccState { service: sp.id.into(), connected: true, user: Some(user.clone()), avatar, error: None });
                break json!({ "service": sp.id, "ok": true, "user": user });
            }
            Err(_) => tried = cred,
        }
    };
    s.close();
    if let Ok(mut g) = IN_BROWSER.lock() {
        g.retain(|x| *x != sp.id);
    }
    let ok = outcome.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
    let _ = app.emit("acc-changed", outcome);
    if ok {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.set_focus();
        }
    }
}

#[tauri::command]
pub async fn acc_paste(service: String, value: String) -> Result<AccState, String> {
    let sp = spec(&service)?;
    let cred = parse_paste(sp.id, &value)?;
    let (user, avatar) = profile(sp.id, &cred).await?;
    crate::tokens::set_service_token(sp.key.into(), cred)?;
    let st = AccState { service, connected: true, user: Some(user), avatar, error: None };
    remember(st.clone());
    Ok(st)
}

#[tauri::command]
pub async fn acc_logout(app: AppHandle, service: String) -> Result<(), String> {
    let sp = spec(&service)?;
    crate::tokens::delete_service_token(sp.key.into())?;
    forget(sp.id);
    if sp.id == "dz" {
        if let Ok(mut g) = DZ.lock() {
            *g = None;
        }
    }
    if let Some(w) = app.get_webview_window(&format!("acc-{}", sp.id)) {
        let _ = w.close();
    }
    // The sign-in profile still remembers the site's session; dropping it
    // lets the next sign-in pick another account. Best effort: the browser
    // process can hold its files a moment after the window closes.
    if let Ok(root) = crate::paths::root() {
        for dir in [root.join("accounts").join(sp.id), root.join("accounts").join(format!("{}-browser", sp.id))] {
            tauri::async_runtime::spawn(async move {
                for _ in 0..6 {
                    if !dir.exists() || std::fs::remove_dir_all(&dir).is_ok() {
                        break;
                    }
                    tokio::time::sleep(Duration::from_secs(2)).await;
                }
            });
        }
    }
    Ok(())
}

/* ─────────────────────────── library ─────────────────────────── */

#[derive(Serialize, Clone)]
pub struct AccList {
    pub id: String,
    pub name: String,
    pub total: Option<u32>,
    pub art: Option<String>,
    pub liked: bool,
}

/// "Playlist • Someone • 25 tracks" → 25. Views, years and durations are not
/// track counts.
fn count_in(sub: &str) -> Option<u32> {
    sub.split('•').rev().find_map(|p| {
        let low = p.to_lowercase();
        if !["track", "трек", "song", "песн"].iter().any(|w| low.contains(w)) {
            return None;
        }
        let d: String = p.chars().filter(|c| c.is_ascii_digit()).collect();
        d.parse().ok()
    })
}

async fn lists_with(service: &str, cred: &str, hl: &str) -> Result<Vec<AccList>, String> {
    let ru = hl == "ru";
    let mut out = vec![AccList {
        id: LIKED.into(),
        name: if ru { "Любимые треки" } else { "Liked songs" }.into(),
        total: None,
        art: None,
        liked: true,
    }];
    match service {
        "ytm" => {
            for c in crate::ytm::signed_playlists(cred, hl).await? {
                out.push(AccList { total: count_in(&c.sub), id: c.id, name: c.t, art: c.art, liked: false });
            }
        }
        "sc" => out.extend(sc_lists(cred).await?),
        "dz" => out.extend(dz_lists(cred).await?),
        other => return Err(format!("no account sign-in for {other}")),
    }
    Ok(out)
}

async fn tracks_with(service: &str, cred: &str, id: &str) -> Result<Vec<Track>, String> {
    let liked = id == LIKED;
    match service {
        "ytm" => crate::ytm::signed_tracks(cred, if liked { "LM" } else { id }).await,
        "sc" if liked => sc_likes(cred).await,
        "sc" => sc_playlist(cred, id).await,
        "dz" if liked => dz_loved(cred).await,
        "dz" => dz_playlist(cred, id).await,
        other => Err(format!("no account sign-in for {other}")),
    }
}

/// The liked tracks pseudo-list first, then the account's playlists.
#[tauri::command]
pub async fn acc_lists(service: String, lang: Option<String>) -> Result<Vec<AccList>, String> {
    let cred = need(&service)?;
    lists_with(&service, &cred, &lang.unwrap_or_else(|| "ru".into())).await
}

#[tauri::command]
pub async fn acc_tracks(service: String, id: String) -> Result<Vec<Track>, String> {
    let cred = need(&service)?;
    tracks_with(&service, &cred, &id).await
}

/// "Your library" for the home sheet: liked tracks, then playlists. Empty
/// when the user is not signed in or the service did not answer.
pub async fn shelves(service: &str, hl: &str) -> Vec<Shelf> {
    let Some(cred) = credential(service) else { return vec![] };
    let Ok(lists) = lists_with(service, &cred, hl).await else { return vec![] };
    let ru = hl == "ru";
    let cards: Vec<Card> = lists
        .into_iter()
        .map(|l| {
            let sub = match (l.liked, l.total) {
                (true, _) => if ru { "Ваши лайки" } else { "Your likes" }.to_string(),
                (_, Some(n)) => if ru { format!("{n} треков") } else { format!("{n} tracks") },
                _ => if ru { "Ваш плейлист" } else { "Your playlist" }.to_string(),
            };
            let mut c = Card::new("playlist", service, &l.id, &l.name, &sub, l.art);
            if l.liked {
                c.color = Some("#e5466f".into());
            }
            c
        })
        .collect();
    vec![Shelf { title: if ru { "Ваша библиотека" } else { "Your library" }.into(), s: service.into(), cards }]
}

/// A playlist opened from the sheet, read as the signed-in user, which also
/// reaches private ones. `None`: not signed in, read it as a guest.
pub async fn open(service: &str, id: &str) -> Option<Result<Vec<Track>, String>> {
    if spec(service).is_err() {
        return None;
    }
    if id == LIKED {
        return Some(match credential(service) {
            Some(c) => tracks_with(service, &c, id).await,
            None => Err(format!("{}: not signed in", name_of(service))),
        });
    }
    // SoundCloud's own stations and mixes are not account playlists.
    if service == "sc" && !id.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let cred = credential(service)?;
    Some(tracks_with(service, &cred, id).await)
}

/* ─────────────────────────── SoundCloud ─────────────────────────── */

const SC_EXPIRED: &str = "SoundCloud: the session has expired, sign in again";

/// A signed api-v2 call; `path` may also be a whole `next_href`.
pub async fn sc_call(token: &str, path: &str) -> Result<Value, String> {
    let c = client()?;
    let mut cid = crate::api::sc_client_id().await?;
    for attempt in 0..2 {
        let base = if path.starts_with("https://") {
            path.to_string()
        } else {
            format!("https://api-v2.soundcloud.com{path}")
        };
        let sep = if base.contains('?') { '&' } else { '?' };
        let r = c
            .get(format!("{base}{sep}client_id={cid}"))
            .header(reqwest::header::USER_AGENT, BROWSER_UA)
            .header("Authorization", format!("OAuth {token}"))
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?;
        match r.status().as_u16() {
            // A rotated client_id answers 401 as well: one retry with a fresh one.
            401 if attempt == 0 => {
                crate::api::sc_drop_id();
                cid = crate::api::sc_client_id().await?;
                continue;
            }
            401 | 403 => return Err(SC_EXPIRED.into()),
            _ => {}
        }
        return r
            .error_for_status()
            .map_err(|e| format!("SoundCloud: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"));
    }
    Err(SC_EXPIRED.into())
}

struct ScMe {
    id: String,
    name: String,
    avatar: Option<String>,
}

async fn sc_me(token: &str) -> Result<ScMe, String> {
    let v = sc_call(token, "/me").await?;
    let id = v
        .get("id")
        .map(|i| i.to_string().trim_matches('"').to_string())
        .filter(|i| !i.is_empty() && i != "null")
        .ok_or("SoundCloud: no profile in the answer")?;
    let name = v
        .get("username")
        .and_then(|n| n.as_str())
        .filter(|n| !n.trim().is_empty())
        .unwrap_or("SoundCloud")
        .to_string();
    let avatar = v
        .get("avatar_url")
        .and_then(|a| a.as_str())
        .map(|a| a.replace("-large.", "-t200x200."));
    Ok(ScMe { id, name, avatar })
}

/// Walks a paged collection (`next_href`) up to `max` items.
async fn sc_walk(token: &str, first: String, max: usize) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    let mut next = Some(first);
    while let Some(url) = next.take() {
        let v = sc_call(token, &url).await?;
        let items = v.get("collection").and_then(|c| c.as_array()).cloned().unwrap_or_default();
        let empty = items.is_empty();
        out.extend(items);
        if out.len() >= max || empty {
            break;
        }
        next = v.get("next_href").and_then(|n| n.as_str()).map(|s| s.to_string());
    }
    out.truncate(max);
    Ok(out)
}

async fn sc_likes(token: &str) -> Result<Vec<Track>, String> {
    let me = sc_me(token).await?;
    let items = sc_walk(token, format!("/users/{}/track_likes?limit=200&linked_partitioning=1", me.id), 5000).await?;
    Ok(items
        .iter()
        .filter_map(|it| it.get("track"))
        .filter_map(crate::api::sc_track)
        .collect())
}

fn sc_list(p: &Value) -> Option<AccList> {
    let id = p.get("id")?.to_string().trim_matches('"').to_string();
    let name = p.get("title")?.as_str()?.to_string();
    let total = p.get("track_count").and_then(|n| n.as_u64()).map(|n| n as u32);
    let art = p
        .get("artwork_url")
        .and_then(|a| a.as_str())
        .map(|a| a.replace("-large.", "-t500x500."));
    Some(AccList { id, name, total, art, liked: false })
}

async fn sc_lists(token: &str) -> Result<Vec<AccList>, String> {
    let me = sc_me(token).await?;
    // The library's own list (created and liked); the profile's playlists
    // when that endpoint is not there.
    let mut lists: Vec<AccList> = sc_walk(token, format!("/users/{}/playlists_liked_and_owned?limit=50&linked_partitioning=1", me.id), 400)
        .await
        .unwrap_or_default()
        .iter()
        .filter_map(|it| it.get("playlist"))
        .filter_map(sc_list)
        .collect();
    if lists.is_empty() {
        lists = sc_walk(token, format!("/users/{}/playlists_without_albums?limit=50&linked_partitioning=1", me.id), 400)
            .await?
            .iter()
            .filter_map(sc_list)
            .collect();
    }
    let mut seen = HashSet::new();
    lists.retain(|l| seen.insert(l.id.clone()));
    Ok(lists)
}

async fn sc_playlist(token: &str, id: &str) -> Result<Vec<Track>, String> {
    let v = sc_call(token, &format!("/playlists/{id}?representation=full")).await?;
    let list = v.get("tracks").and_then(|t| t.as_array()).cloned().unwrap_or_default();
    let order: Vec<String> = list
        .iter()
        .filter_map(|t| t.get("id"))
        .map(|i| i.to_string().trim_matches('"').to_string())
        .collect();
    let mut have: HashMap<String, Track> = HashMap::new();
    let mut stubs = Vec::new();
    for t in &list {
        if t.get("title").and_then(|x| x.as_str()).is_some() {
            if let Some(tr) = crate::api::sc_track(t) {
                have.insert(tr.id.clone(), tr);
            }
        } else if let Some(i) = t.get("id") {
            stubs.push(i.to_string().trim_matches('"').to_string());
        }
    }
    // Past the first few, a playlist lists bare ids; they come back in batches.
    for chunk in stubs.chunks(50) {
        let got = sc_call(token, &format!("/tracks?ids={}", chunk.join(","))).await?;
        for t in got.as_array().into_iter().flatten() {
            if let Some(tr) = crate::api::sc_track(t) {
                have.insert(tr.id.clone(), tr);
            }
        }
    }
    Ok(order.iter().filter_map(|i| have.remove(i)).collect())
}

/* ─────────────────────────── Deezer ─────────────────────────── */

/// The web player's own gateway; the public API cannot read a private library.
const GW: &str = "https://www.deezer.com/ajax/gw-light.php";

#[derive(Clone)]
struct DzSession {
    arl: String,
    sid: String,
    token: String,
    uid: String,
    name: String,
    avatar: Option<String>,
    at: Instant,
}

static DZ: Mutex<Option<DzSession>> = Mutex::new(None);

fn as_id(v: Option<&Value>) -> Option<String> {
    match v? {
        Value::String(s) if !s.is_empty() => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

fn as_num(v: Option<&Value>) -> Option<u64> {
    match v? {
        Value::Number(n) => n.as_u64(),
        Value::String(s) => s.trim().parse().ok(),
        _ => None,
    }
}

/// Opens a gateway session for an `arl`: the user, the form token every
/// later call must carry, and the `sid` cookie that token belongs to.
async fn dz_session(arl: &str, fresh: bool) -> Result<DzSession, String> {
    if !fresh {
        if let Ok(g) = DZ.lock() {
            if let Some(s) = g.as_ref().filter(|s| s.arl == arl && s.at.elapsed() < Duration::from_secs(1200)) {
                return Ok(s.clone());
            }
        }
    }
    let r = client()?
        .post(format!("{GW}?method=deezer.getUserData&input=3&api_version=1.0&api_token="))
        .header(reqwest::header::USER_AGENT, BROWSER_UA)
        .header("Cookie", format!("arl={arl}"))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Deezer: {e}"))?;
    let sid = r
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|h| h.to_str().ok())
        .find_map(|c| c.strip_prefix("sid=").map(|v| v.split(';').next().unwrap_or("").to_string()))
        .unwrap_or_default();
    let v: Value = r.json().await.map_err(|e| format!("bad response: {e}"))?;
    let user = v.pointer("/results/USER");
    let uid = as_id(user.and_then(|u| u.get("USER_ID")))
        .filter(|u| u != "0")
        .ok_or("Deezer: the arl is not valid or has expired")?;
    let token = v.pointer("/results/checkForm").and_then(|t| t.as_str()).unwrap_or("").to_string();
    let name = user
        .and_then(|u| u.get("BLOG_NAME"))
        .and_then(|n| n.as_str())
        .filter(|n| !n.trim().is_empty())
        .unwrap_or("Deezer")
        .to_string();
    let avatar = user
        .and_then(|u| u.get("USER_PICTURE"))
        .and_then(|p| p.as_str())
        .filter(|p| !p.is_empty())
        .map(|h| format!("https://e-cdns-images.dzcdn.net/images/user/{h}/250x250-000000-80-0-0.jpg"));
    let s = DzSession { arl: arl.into(), sid, token, uid, name, avatar, at: Instant::now() };
    if let Ok(mut g) = DZ.lock() {
        *g = Some(s.clone());
    }
    Ok(s)
}

async fn dz_call(arl: &str, method: &str, body: Value) -> Result<Value, String> {
    let mut s = dz_session(arl, false).await?;
    for attempt in 0..2 {
        let mut cookie = format!("arl={arl}");
        if !s.sid.is_empty() {
            cookie.push_str(&format!("; sid={}", s.sid));
        }
        let v: Value = client()?
            .post(format!("{GW}?method={method}&input=3&api_version=1.0&api_token={}", s.token))
            .header(reqwest::header::USER_AGENT, BROWSER_UA)
            .header("Cookie", cookie)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("network: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Deezer: {e}"))?
            .json()
            .await
            .map_err(|e| format!("bad response: {e}"))?;
        let failed = match v.get("error") {
            Some(Value::Object(m)) => !m.is_empty(),
            Some(Value::Array(a)) => !a.is_empty(),
            _ => false,
        };
        if !failed {
            return Ok(v.get("results").cloned().unwrap_or(Value::Null));
        }
        // A stale form token: open a fresh session once.
        if attempt == 0 {
            s = dz_session(arl, true).await?;
            continue;
        }
        return Err(format!("Deezer: {}", v.get("error").map(|e| e.to_string()).unwrap_or_default()));
    }
    Err("Deezer rejected the request".into())
}

/// A gateway song row. User-uploaded files (negative ids) are not in the
/// catalogue and cannot be matched, so they are left out.
fn dz_song(v: &Value) -> Option<Track> {
    let id = as_id(v.get("SNG_ID")).filter(|i| !i.starts_with('-'))?;
    let mut t = v.get("SNG_TITLE")?.as_str()?.trim().to_string();
    if t.is_empty() {
        return None;
    }
    if let Some(ver) = v.get("VERSION").and_then(|x| x.as_str()).map(str::trim).filter(|x| !x.is_empty()) {
        t = format!("{t} {ver}");
    }
    let art = v
        .get("ALB_PICTURE")
        .and_then(|p| p.as_str())
        .filter(|p| !p.is_empty())
        .map(|h| format!("https://e-cdns-images.dzcdn.net/images/cover/{h}/500x500-000000-80-0-0.jpg"));
    Some(Track {
        id,
        s: "dz".into(),
        t,
        a: v.get("ART_NAME").and_then(|a| a.as_str()).unwrap_or("—").to_string(),
        al: v.get("ALB_TITLE").and_then(|a| a.as_str()).unwrap_or("").to_string(),
        d: as_num(v.get("DURATION")).unwrap_or(0) as u32,
        art,
        mode: "local".into(),
    })
}

fn dz_list(p: &Value) -> Option<AccList> {
    // The favourites playlist is the liked tracks list, shown on its own.
    let fav = p.get("IS_FAVORITE").is_some_and(|f| f.as_bool() == Some(true) || f.as_str() == Some("1") || f.as_u64() == Some(1));
    if fav {
        return None;
    }
    let id = as_id(p.get("PLAYLIST_ID"))?;
    let name = p.get("TITLE")?.as_str()?.to_string();
    let kind = p.get("PICTURE_TYPE").and_then(|k| k.as_str()).filter(|k| !k.is_empty()).unwrap_or("playlist");
    let art = p
        .get("PLAYLIST_PICTURE")
        .and_then(|h| h.as_str())
        .filter(|h| !h.is_empty())
        .map(|h| format!("https://e-cdns-images.dzcdn.net/images/{kind}/{h}/500x500-000000-80-0-0.jpg"));
    Some(AccList { id, name, total: as_num(p.get("NB_SONG")).map(|n| n as u32), art, liked: false })
}

async fn dz_loved(arl: &str) -> Result<Vec<Track>, String> {
    let s = dz_session(arl, false).await?;
    let r = dz_call(arl, "deezer.pageProfile", json!({ "USER_ID": s.uid, "tab": "loved", "nb": 5000 })).await?;
    Ok(r.pointer("/TAB/loved/data")
        .and_then(|d| d.as_array())
        .map(|a| a.iter().filter_map(dz_song).collect())
        .unwrap_or_default())
}

async fn dz_lists(arl: &str) -> Result<Vec<AccList>, String> {
    let s = dz_session(arl, false).await?;
    let r = dz_call(arl, "deezer.pageProfile", json!({ "USER_ID": s.uid, "tab": "playlists", "nb": 200 })).await?;
    Ok(r.pointer("/TAB/playlists/data")
        .and_then(|d| d.as_array())
        .map(|a| a.iter().filter_map(dz_list).collect())
        .unwrap_or_default())
}

async fn dz_playlist(arl: &str, id: &str) -> Result<Vec<Track>, String> {
    let r = dz_call(arl, "playlist.getSongs", json!({ "PLAYLIST_ID": id, "nb": -1 })).await?;
    Ok(r.get("data")
        .and_then(|d| d.as_array())
        .map(|a| a.iter().filter_map(dz_song).collect())
        .unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pairs(s: &str) -> Vec<(String, String)> {
        s.split(';')
            .filter_map(|p| p.trim().split_once('='))
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    #[test]
    fn ytm_keeps_only_the_session() {
        let jar = pairs("PREF=f6=40; SID=s1; HSID=h; SSID=x; APISID=a; SAPISID=sp; VISITOR_INFO1_LIVE=v; __Secure-3PSID=t3");
        let c = extract("ytm", &jar).unwrap();
        assert_eq!(c, "SID=s1; HSID=h; SSID=x; APISID=a; SAPISID=sp; __Secure-3PSID=t3");
        // A guest jar (consent and visitor cookies only) is not a session.
        assert!(extract("ytm", &pairs("PREF=1; VISITOR_INFO1_LIVE=v; YSC=y")).is_none());
        assert!(extract("ytm", &pairs("SAPISID=sp; PREF=1")).is_none());
    }

    #[test]
    fn pasted_values() {
        let c = parse_paste("ytm", "Cookie: YSC=1; SID=abc; SAPISID=zzz").unwrap();
        assert_eq!(c, "SID=abc; SAPISID=zzz");
        assert!(parse_paste("ytm", "hello").is_err());
        assert_eq!(parse_paste("sc", "OAuth 2-290000-123456789-AbCdEfGhIjKl").unwrap(), "2-290000-123456789-AbCdEfGhIjKl");
        assert_eq!(parse_paste("sc", "sc_anonymous_id=1; oauth_token=2-1-2-abc").unwrap(), "2-1-2-abc");
        assert_eq!(parse_paste("dz", "  \"0123456789abcdef0123\"  ").unwrap(), "0123456789abcdef0123");
        assert_eq!(parse_paste("dz", "arl=feedbeef; sid=1").unwrap(), "feedbeef");
        assert!(parse_paste("dz", "short").is_err());
        assert!(parse_paste("dz", "two words here and more").is_err());
    }

    #[test]
    fn counts_and_rows() {
        assert_eq!(count_in("Playlist • Me • 25 tracks"), Some(25));
        assert_eq!(count_in("Плейлист • Я • 1 203 трека"), Some(1203));
        assert_eq!(count_in("Playlist • Me • 12K views"), None);
        assert_eq!(count_in("Auto playlist"), None);
        let row = json!({"SNG_ID":"3135556","SNG_TITLE":"Harder, Better","VERSION":"(Remastered)","ART_NAME":"Daft Punk","ALB_TITLE":"Discovery","DURATION":"224","ALB_PICTURE":"2e018122cb56986277102d2041a592c8"});
        let t = dz_song(&row).unwrap();
        assert_eq!((t.id.as_str(), t.t.as_str(), t.a.as_str(), t.d), ("3135556", "Harder, Better (Remastered)", "Daft Punk", 224));
        assert!(t.art.unwrap().contains("/cover/2e018122cb56986277102d2041a592c8/"));
        assert!(dz_song(&json!({"SNG_ID":"-5","SNG_TITLE":"upload"})).is_none());
        let pl = json!({"PLAYLIST_ID":"908622995","TITLE":"Road","NB_SONG":"41","PLAYLIST_PICTURE":"abc","PICTURE_TYPE":"playlist"});
        let l = dz_list(&pl).unwrap();
        assert_eq!((l.id.as_str(), l.total), ("908622995", Some(41)));
        assert!(dz_list(&json!({"PLAYLIST_ID":"1","TITLE":"Loved","IS_FAVORITE":true})).is_none());
        let sc = json!({"id":123,"title":"Mix","track_count":7,"artwork_url":"https://i1.sndcdn.com/a-large.jpg"});
        let l = sc_list(&sc).unwrap();
        assert_eq!((l.id.as_str(), l.total, l.art.as_deref()), ("123", Some(7), Some("https://i1.sndcdn.com/a-t500x500.jpg")));
    }
}
