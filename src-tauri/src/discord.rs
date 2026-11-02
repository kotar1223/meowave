//! Discord Rich Presence over the Discord desktop client's local IPC socket.
//!
//! The protocol is documented well enough by the community (the official SDK
//! is a C library): a unix domain socket (macOS/Linux) or a named pipe
//! (Windows) at run/discord-ipc-<n>, length-prefixed JSON frames. Handshake
//! first, then one Presence::Set frame per update.
//!
//! Rate limits: Discord accepts roughly five updates per twenty seconds, so
//! the caller is throttled here to one update per 15 s with a dirty flag —
//! the same cadence well-known clients use.
//!
//! Dependency policy: no discord-sdk crate. The protocol is one write of a
//! small JSON frame; a full async SDK would drag tokio-tungstenite and friends
//! into a Tauri app that already ships a runtime. This module is blocking, on
//! its own thread, behind a Mutex — the frontend calls fire-and-forget.

use rand::Rng;
use serde_json::json;
use std::io::{Read, Write};
use std::sync::Mutex;

const OPCODE_HANDSHAKE: u32 = 0;
const OPCODE_FRAME: u32 = 1;
const OPCODE_CLOSE: u32 = 2;
/// Rate limit: Discord allows 5 updates per 20 seconds. 15 s is 4 per window,
/// inside the budget with margin. A shorter interval does not "lose less":
/// it turns every fast track switch into a guaranteed 429, because the
/// presence endpoint is the one place where being early costs more than being
/// late. Debouncing below means a switch inside the window is still delivered,
/// just at the window edge.
const MIN_INTERVAL: std::time::Duration = std::time::Duration::from_secs(15);

#[cfg(unix)]
struct Ipc {
    stream: std::os::unix::net::UnixStream,
}

#[cfg(windows)]
struct Ipc {
    // A named-pipe client opens through the ordinary filesystem API, so
    // std::fs::File is enough — no winapi crate, no async runtime plumbing.
    stream: std::fs::File,
}

impl Ipc {
    #[cfg(unix)]
    fn connect() -> Option<Self> {
        // The client creates run/discord-ipc-0 first; higher numbers appear
        // when several clients run (canary, ptb). XDG_RUNTIME_DIR first, /tmp
        // as the historical fallback — the SDK checks the same two.
        let bases: Vec<String> = vec![
            std::env::var("XDG_RUNTIME_DIR").unwrap_or_default(),
            "/tmp".into(),
        ]
        .into_iter()
        .filter(|b| !b.is_empty())
        .collect();
        for base in &bases {
            for n in 0..10 {
                let path = format!("{base}/discord-ipc-{n}");
                if let Ok(stream) = std::os::unix::net::UnixStream::connect(&path) {
                    return Some(Self { stream });
                }
            }
        }
        None
    }

    #[cfg(windows)]
    fn connect() -> Option<Self> {
        // Same socket namespace as the official SDK: the first Discord client
        // owns \\.\pipe\discord-ipc-0, secondary installs take the next slot.
        for n in 0..10 {
            let path = format!(r"\\.\pipe\discord-ipc-{n}");
            if let Ok(stream) = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&path)
            {
                return Some(Self { stream });
            }
        }
        None
    }

    fn write_frame(&mut self, opcode: u32, payload: &serde_json::Value) -> Result<(), String> {
        let body = payload.to_string();
        let mut frame = Vec::with_capacity(8 + body.len());
        frame.extend_from_slice(&opcode.to_le_bytes());
        frame.extend_from_slice(&(body.len() as u32).to_le_bytes());
        frame.extend_from_slice(body.as_bytes());
        self.stream
            .write_all(&frame)
            .and_then(|_| self.stream.flush())
            .map_err(|e| format!("ipc write: {e}"))
    }

    fn read_frame(&mut self) -> Result<(u32, serde_json::Value), String> {
        let mut header = [0u8; 8];
        self.stream
            .read_exact(&mut header)
            .map_err(|e| format!("ipc read: {e}"))?;
        let opcode = u32::from_le_bytes(header[0..4].try_into().unwrap());
        let len = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;
        let mut buf = vec![0u8; len];
        self.stream
            .read_exact(&mut buf)
            .map_err(|e| format!("ipc read: {e}"))?;
        let v = serde_json::from_slice(&buf).unwrap_or(serde_json::Value::Null);
        Ok((opcode, v))
    }

    fn handshake(&mut self, client_id: &str) -> Result<(), String> {
        self.write_frame(
            OPCODE_HANDSHAKE,
            &json!({
                "v": 1,
                "client_id": client_id,
            }),
        )?;
        let (op, v) = self.read_frame()?;
        if op == OPCODE_CLOSE {
            return Err(format!("handshake refused: {v}"));
        }
        Ok(())
    }
}

struct State {
    conn: Option<Ipc>,
    last: std::time::Instant,
    last_payload: String,
    enabled: bool,
    template: String,
    /// Application id entered in Settings. Empty = fall back to the
    /// environment / build-time value.
    client_id: String,
    pending: Option<(serde_json::Value, String)>,
    debounce_active: bool,
    /// Last error reported by Discord or the socket, for the settings panel.
    last_error: String,
}

impl State {
    fn new() -> Self {
        State {
            conn: None,
            last: std::time::Instant::now()
                .checked_sub(MIN_INTERVAL)
                .unwrap_or_else(std::time::Instant::now),
            last_payload: String::new(),
            enabled: false,
            template: String::new(),
            client_id: String::new(),
            pending: None,
            debounce_active: false,
            last_error: String::new(),
        }
    }
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

/// Application id from the Discord Developer Portal. Order: the id typed in
/// Settings, then DISCORD_CLIENT_ID from the environment at runtime, then the
/// same variable baked in at build time (`DISCORD_CLIENT_ID=... npm run build`).
/// A presence belongs to *a* registered app; its name is what Discord shows as
/// "Listening to <name>".
fn client_id(st: &State) -> Option<String> {
    let valid = |s: &str| s.len() >= 15 && s.len() <= 22 && s.chars().all(|c| c.is_ascii_digit());
    let from_state = st.client_id.trim().to_string();
    if valid(&from_state) {
        return Some(from_state);
    }
    if let Ok(v) = std::env::var("DISCORD_CLIENT_ID") {
        let v = v.trim().to_string();
        if valid(&v) {
            return Some(v);
        }
    }
    option_env!("DISCORD_CLIENT_ID")
        .map(|s| s.trim().to_string())
        .filter(|s| valid(s))
}

/// Mints the nonce Discord echoes back. Not security, just frame matching.
fn nonce() -> String {
    let mut raw = [0u8; 16];
    rand::thread_rng().fill(&mut raw[..]);
    format!(
        "{:02x}{:02x}{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}-{:02x}{:02x}{:02x}{:02x}{:02x}{:02x}",
        raw[0], raw[1], raw[2], raw[3], raw[4], raw[5], raw[6], raw[7], raw[8], raw[9], raw[10],
        raw[11], raw[12], raw[13], raw[14], raw[15]
    )
}

/// Expands the user's template. Unknown placeholders stay as written so a
/// typo is visible in Discord instead of silently disappearing.
fn render(template: &str, vars: &serde_json::Value) -> String {
    let get = |k: &str| -> String {
        match vars.get(k) {
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(serde_json::Value::Number(n)) => n.to_string(),
            Some(serde_json::Value::Bool(b)) => b.to_string(),
            _ => String::new(),
        }
    };
    let mut out = template.to_string();
    for key in [
        "title", "artist", "album", "service", "status", "elapsed", "remaining", "quality",
    ] {
        out = out.replace(&format!("{{{key}}}"), &get(key));
    }
    // Collapse runs of separators left by empty fields: "Artist — " / " ·  · ".
    while out.contains("  ") {
        out = out.replace("  ", " ");
    }
    for sep in ["— -", "· ·", "— ·", "· —", "— —"] {
        out = out.replace(sep, "—");
    }
    out.trim()
        .trim_start_matches(['—', '·'])
        .trim_end_matches(['—', '·'])
        .trim()
        .to_string()
}

/// Discord rejects the whole activity when a text field is shorter than 2 or
/// longer than 128 characters, so every string goes through here.
fn fit(s: &str) -> Option<String> {
    let s = s.trim();
    if s.chars().count() < 2 {
        return None;
    }
    if s.chars().count() <= 128 {
        return Some(s.to_string());
    }
    let mut cut: String = s.chars().take(127).collect();
    cut.push('…');
    Some(cut)
}

/// Only public https URLs (≤256 chars) work as external images; local blobs,
/// data: URIs and the app's own relay would make Discord drop the asset.
fn image_url(v: Option<&serde_json::Value>) -> Option<String> {
    let u = v?.as_str()?.trim();
    if u.starts_with("https://") && u.len() <= 256 && !u.contains("localhost") && !u.contains("127.0.0.1") {
        Some(u.to_string())
    } else {
        None
    }
}

fn presence_payload(d: &serde_json::Value, rendered: &str) -> serde_json::Value {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|x| x.as_secs())
        .unwrap_or(0) as i64;

    // Only explicit start/end (sent while playing) produce a running timer —
    // falling back to the frontend's `_start` kept the clock ticking on pause.
    let start = d.get("start").and_then(|v| v.as_i64()).or_else(|| {
        d.get("elapsed").and_then(|v| v.as_i64()).map(|e| {
            if e > 1_000_000_000 { e } else { now.saturating_sub(e) }
        })
    });

    let end = d.get("end").and_then(|v| v.as_i64()).or_else(|| {
        d.get("remaining").and_then(|v| v.as_i64()).map(|r| {
            if r > 1_000_000_000 { r } else { now + r }
        })
    });

    let mut timestamps = serde_json::Map::new();
    if let Some(s) = start {
        timestamps.insert("start".into(), json!(s * 1000));
    }
    if let Some(e) = end {
        timestamps.insert("end".into(), json!(e * 1000));
    }

    let mut activity = serde_json::Map::new();
    // 2 = "Listening to …" — the music-player look (progress bar on profile).
    activity.insert("type".into(), json!(2));
    let title = d.get("title").and_then(|v| v.as_str()).unwrap_or("");
    let details = fit(rendered).or_else(|| fit(title)).unwrap_or_else(|| "Meowave".into());
    activity.insert("details".into(), json!(details));
    if let Some(state) = d
        .get("artist")
        .and_then(|v| v.as_str())
        .and_then(fit)
        .filter(|a| a != &details)
        .or_else(|| d.get("status").and_then(|v| v.as_str()).and_then(fit))
    {
        activity.insert("state".into(), json!(state));
    }
    if !timestamps.is_empty() {
        activity.insert("timestamps".into(), serde_json::Value::Object(timestamps));
    }
    let mut assets = serde_json::Map::new();
    if let Some(img) = image_url(d.get("art")) {
        assets.insert("large_image".into(), json!(img));
        if let Some(t) = d
            .get("album")
            .and_then(|v| v.as_str())
            .and_then(fit)
            .or_else(|| fit(title))
        {
            assets.insert("large_text".into(), json!(t));
        }
    }
    if let Some(img) = image_url(d.get("service_icon")) {
        assets.insert("small_image".into(), json!(img));
        if let Some(t) = d.get("service").and_then(|v| v.as_str()).and_then(fit) {
            assets.insert("small_text".into(), json!(t));
        }
    }
    if !assets.is_empty() {
        activity.insert("assets".into(), serde_json::Value::Object(assets));
    }
    if let Some(url) = image_url(d.get("url")) {
        activity.insert(
            "buttons".into(),
            json!([{ "label": d.get("url_label").and_then(|v| v.as_str()).and_then(fit).unwrap_or_else(|| "Open".into()), "url": url }]),
        );
    }
    json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": serde_json::Value::Object(activity)
        },
        "nonce": nonce()
    })
}

/// Reads Discord's reply to a command and turns an ERROR event into Err.
/// Unix sockets get a read timeout; the Windows pipe is answered promptly by
/// the client, and the call already runs off the UI thread.
fn read_reply(conn: &mut Ipc) -> Result<(), String> {
    #[cfg(unix)]
    let _ = conn
        .stream
        .set_read_timeout(Some(std::time::Duration::from_secs(3)));
    let (op, v) = conn.read_frame()?;
    if op == OPCODE_CLOSE {
        return Err(format!("Discord закрыл соединение: {v}"));
    }
    if v.get("evt").and_then(|e| e.as_str()) == Some("ERROR") {
        let msg = v
            .pointer("/data/message")
            .and_then(|m| m.as_str())
            .unwrap_or("unknown error");
        return Err(format!("Discord: {msg}"));
    }
    Ok(())
}

fn send_now(state: &mut State, payload: &serde_json::Value, raw: &str) -> Result<(), String> {
    let res = send_inner(state, payload, raw);
    state.last_error = res.as_ref().err().cloned().unwrap_or_default();
    res
}

fn send_inner(state: &mut State, payload: &serde_json::Value, raw: &str) -> Result<(), String> {
    let cid = client_id(state).ok_or("Не задан Application ID Discord (Настройки → Discord)")?;
    let fresh = state.conn.is_none();
    // Reconnect lazily; drop a dead socket so the next try reconnects.
    if fresh {
        state.conn = Ipc::connect();
    }
    let conn = match state.conn.as_mut() {
        Some(c) => c,
        None => return Err("Discord не запущен — обновление пропущено".into()),
    };
    if fresh {
        if let Err(e) = conn.handshake(&cid) {
            state.conn = None;
            state.last_payload.clear();
            return Err(e);
        }
    }
    if let Err(e) = conn.write_frame(OPCODE_FRAME, payload).and_then(|_| read_reply(conn)) {
        // A socket error means Discord went away; a Discord ERROR keeps the
        // connection but must not be remembered as "already sent".
        if !e.starts_with("Discord:") {
            state.conn = None;
        }
        state.last_payload.clear();
        return Err(e);
    }
    state.last_payload = raw.to_string();
    Ok(())
}

fn clear_activity(st: &mut State) {
    st.pending = None;
    st.debounce_active = false;
    if let Some(conn) = st.conn.as_mut() {
        let ok = conn
            .write_frame(
                OPCODE_FRAME,
                &json!({
                    "cmd": "SET_ACTIVITY",
                    "args": {"pid": std::process::id()},
                    "nonce": nonce()
                }),
            )
            .and_then(|_| read_reply(conn));
        if ok.is_err() {
            st.conn = None;
        }
    }
    st.last_payload.clear();
}

fn update_blocking(data: serde_json::Value, force: bool) -> Result<(), String> {
    let mut guard = STATE.lock().map_err(|e| e.to_string())?;
    let st = guard.get_or_insert_with(State::new);
    if !st.enabled {
        return Ok(());
    }
    let rendered = render(&st.template, &data);
    let payload = presence_payload(&data, &rendered);
    // Compare without the random nonce, otherwise every call looks new.
    let mut cmp = payload.clone();
    if let Some(o) = cmp.as_object_mut() {
        o.remove("nonce");
    }
    let raw = cmp.to_string();
    if raw == st.last_payload && !force {
        st.pending = None;
        return Ok(());
    }
    // If an update arrives before MIN_INTERVAL, store it in `pending` and
    // spin a background timer to flush it as soon as the throttle window passes.
    if st.last.elapsed() < MIN_INTERVAL && !force {
        st.pending = Some((payload, raw));
        if !st.debounce_active {
            st.debounce_active = true;
            std::thread::spawn(move || {
                loop {
                    let delay = {
                        let Ok(g) = STATE.lock() else { break };
                        let Some(st) = g.as_ref() else { break };
                        if st.pending.is_none() || !st.enabled {
                            break;
                        }
                        let elapsed = st.last.elapsed();
                        if elapsed >= MIN_INTERVAL {
                            std::time::Duration::ZERO
                        } else {
                            MIN_INTERVAL - elapsed
                        }
                    };
                    if delay > std::time::Duration::ZERO {
                        std::thread::sleep(delay + std::time::Duration::from_millis(20));
                    }
                    let Ok(mut g) = STATE.lock() else { break };
                    let Some(st) = g.as_mut() else { break };
                    if st.last.elapsed() < MIN_INTERVAL {
                        continue;
                    }
                    if !st.enabled {
                        st.pending = None;
                    } else if let Some((p, r)) = st.pending.take() {
                        if r != st.last_payload {
                            let _ = send_now(st, &p, &r);
                            st.last = std::time::Instant::now();
                        }
                    }
                    break;
                }
                // Every exit path has to clear the flag. Leaving it set
                // strands the next throttled update: it sees
                // `debounce_active` still true, skips spawning a thread,
                // and the pending payload is never delivered.
                if let Ok(mut g) = STATE.lock() {
                    if let Some(st) = g.as_mut() {
                        if !st.enabled {
                            st.pending = None;
                        }
                        st.debounce_active = false;
                    }
                }
            });
        }
        return Ok(());
    }
    st.pending = None;
    let res = send_now(st, &payload, &raw);
    st.last = std::time::Instant::now();
    res
}

async fn off_main<T: Send + 'static>(f: impl FnOnce() -> T + Send + 'static) -> Result<T, String> {
    // Sync commands run on the main thread in Tauri; the IPC handshake and
    // reply reads block, so they live on the blocking pool instead.
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())
}

/// Called by the frontend on track start / pause / seek. Throttled to
/// MIN_INTERVAL; the last update is allowed through slightly early so a
/// track change at the boundary is not dropped.
#[tauri::command]
pub async fn discord_update(data: serde_json::Value) -> Result<(), String> {
    off_main(move || update_blocking(data, false)).await?
}

/// "Check" button: bypasses the throttle once and reports Discord's answer.
#[tauri::command]
pub async fn discord_test(data: serde_json::Value) -> Result<(), String> {
    off_main(move || update_blocking(data, true)).await?
}

#[tauri::command]
pub async fn discord_clear() -> Result<(), String> {
    off_main(|| {
        let mut guard = STATE.lock().map_err(|e| e.to_string())?;
        if let Some(st) = guard.as_mut() {
            clear_activity(st);
        }
        Ok(())
    })
    .await?
}

/// Configure the presence. `enabled=false` clears and disconnects. The
/// template and the application id persist on the frontend side; Rust keeps
/// only the live copy. A changed id forces a fresh handshake.
#[tauri::command]
pub async fn discord_configure(
    enabled: bool,
    template: String,
    client_id: Option<String>,
) -> Result<(), String> {
    off_main(move || {
        let mut guard = STATE.lock().map_err(|e| e.to_string())?;
        let st = guard.get_or_insert_with(State::new);
        st.enabled = enabled;
        st.template = template;
        if let Some(id) = client_id {
            let id = id.trim().to_string();
            if id != st.client_id {
                st.client_id = id;
                clear_activity(st);
                st.conn = None;
            }
        }
        if !enabled {
            clear_activity(st);
            st.conn = None;
        }
        Ok(())
    })
    .await?
}

/// Live status for the settings panel: is the client reachable, is an
/// application id configured, and what went wrong last time.
#[tauri::command]
pub async fn discord_status() -> Result<serde_json::Value, String> {
    off_main(|| {
        let running = Ipc::connect().is_some();
        let guard = STATE.lock().map_err(|e| e.to_string())?;
        let (has_id, connected, err) = match guard.as_ref() {
            Some(st) => (client_id(st).is_some(), st.conn.is_some(), st.last_error.clone()),
            None => (
                client_id(&State::new()).is_some(),
                false,
                String::new(),
            ),
        };
        Ok(json!({ "running": running, "hasId": has_id, "connected": connected, "error": err }))
    })
    .await?
}

/// True when the Discord client's IPC socket is reachable right now, so the
/// settings panel can show a live status instead of a hopeful one.
#[tauri::command]
pub async fn discord_available() -> bool {
    off_main(|| Ipc::connect().is_some()).await.unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_numeric_and_string_vars() {
        let vars = json!({
            "title": "Song Title",
            "artist": "Artist Name",
            "elapsed": 45,
            "remaining": "03:15"
        });
        let res = render("{artist} — {title} [{elapsed}] ({remaining})", &vars);
        assert_eq!(res, "Artist Name — Song Title [45] (03:15)");
    }

    #[test]
    fn test_presence_payload_start_timestamp() {
        let d = json!({
            "start": 1740000000i64,
            "end": 1740000200i64,
            "status": "Listening",
            "art": "cover.jpg",
            "title": "Song",
            "service": "ytm"
        });
        let payload = presence_payload(&d, "Song");
        let start = payload.pointer("/args/activity/timestamps/start").and_then(|v| v.as_i64());
        assert_eq!(start, Some(1740000000000i64));
    }

    #[test]
    fn test_presence_payload_relative_elapsed() {
        let d = json!({
            "elapsed": 30i64,
            "remaining": 150i64
        });
        let payload = presence_payload(&d, "Song");
        let start = payload.pointer("/args/activity/timestamps/start").and_then(|v| v.as_i64()).unwrap();
        let end = payload.pointer("/args/activity/timestamps/end").and_then(|v| v.as_i64()).unwrap();
        assert!(start > 1_000_000_000_000);
        assert!(end > start);
    }
}

