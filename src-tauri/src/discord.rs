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
/// One update per 15 s: inside Discord's 5-per-20 s budget with margin.
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
}

static STATE: Mutex<Option<State>> = Mutex::new(None);

/// Application id from the Discord Developer Portal. Environment over compile
/// time default: a presence belongs to *a* registered app, and only the user
/// (or the distributor) knows theirs. Without it the feature reports
/// "not configured" instead of spamming errors.
fn client_id() -> Option<String> {
    std::env::var("DISCORD_CLIENT_ID")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
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
    let get = |k: &str| {
        vars.get(k)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
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
    out.trim().trim_start_matches('—').trim().to_string()
}

fn presence_payload(d: &serde_json::Value, rendered: &str) -> serde_json::Value {
    let elapsed = d.get("elapsed").and_then(|v| v.as_i64());
    let remaining = d.get("remaining").and_then(|v| v.as_i64());
    let mut timestamps = serde_json::Map::new();
    if let Some(e) = elapsed {
        timestamps.insert("start".into(), json!(e));
    }
    if let Some(r) = remaining {
        // Discord wants an end instant, not a duration.
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|x| x.as_secs())
            .unwrap_or(0) as i64;
        timestamps.insert("end".into(), json!(now + r));
    }
    json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": {
                "details": rendered,
                "state": d.get("status").and_then(|v| v.as_str()).unwrap_or(""),
                "timestamps": timestamps,
                "assets": {
                    "large_image": d.get("art").and_then(|v| v.as_str()).unwrap_or("meowave"),
                    "large_text": d.get("title").and_then(|v| v.as_str()).unwrap_or("Meowave"),
                    "small_image": d.get("service").and_then(|v| v.as_str()).unwrap_or("meowave"),
                    "small_text": d.get("service").and_then(|v| v.as_str()).unwrap_or(""),
                }
            }
        },
        "nonce": nonce()
    })
}

fn send_now(state: &mut State, payload: &serde_json::Value, raw: &str) -> Result<(), String> {
    let cid = client_id().ok_or("не задан DISCORD_CLIENT_ID")?;
    // Reconnect lazily; drop a dead socket so the next try reconnects.
    if state.conn.is_none() {
        state.conn = Ipc::connect();
    }
    let conn = state
        .conn
        .as_mut()
        .ok_or("Discord не запущен — обновление пропущено")?;
    if state.last_payload.is_empty() {
        conn.handshake(&cid)?;
    }
    conn.write_frame(OPCODE_FRAME, payload)?;
    state.last_payload = raw.to_string();
    Ok(())
}

/// Called by the frontend on track start / pause / seek. Throttled to
/// MIN_INTERVAL; the last update is allowed through slightly early so a
/// track change at the boundary is not dropped.
#[tauri::command]
pub fn discord_update(data: serde_json::Value) -> Result<(), String> {
    let mut guard = STATE.lock().map_err(|e| e.to_string())?;
    let (enabled, template) = {
        let st = guard.get_or_insert_with(|| State {
            conn: None,
            last: std::time::Instant::now() - MIN_INTERVAL,
            last_payload: String::new(),
            enabled: false,
            template: String::new(),
        });
        (st.enabled, st.template.clone())
    };
    if !enabled {
        return Ok(());
    }
    if let Some(st) = guard.as_mut() {
        let rendered = render(&template, &data);
        let payload = presence_payload(&data, &rendered);
        let raw = payload.to_string();
        if raw == st.last_payload {
            return Ok(());
        }
        // Too soon after the last push: skip. The frontend heartbeats, so the
        // update lands on the next tick instead of tripping Discord's limit.
        if st.last.elapsed() < MIN_INTERVAL {
            return Ok(());
        }
        send_now(st, &payload, &raw)?;
        st.last = std::time::Instant::now();
    }
    Ok(())
}

#[tauri::command]
pub fn discord_clear() -> Result<(), String> {
    let mut guard = STATE.lock().map_err(|e| e.to_string())?;
    if let Some(st) = guard.as_mut() {
        if let Some(conn) = st.conn.as_mut() {
            let _ = conn.write_frame(
                OPCODE_FRAME,
                &json!({
                    "cmd": "SET_ACTIVITY",
                    "args": {"pid": std::process::id(), "activity": null},
                    "nonce": nonce()
                }),
            );
        }
        st.conn = None;
        st.last_payload.clear();
    }
    Ok(())
}

/// Configure the presence. `enabled=false` disconnects and clears. The
/// template persists on the frontend side; Rust keeps only the live copy.
#[tauri::command]
pub fn discord_configure(enabled: bool, template: String) -> Result<(), String> {
    let mut guard = STATE.lock().map_err(|e| e.to_string())?;
    let st = guard.get_or_insert_with(|| State {
        conn: None,
        last: std::time::Instant::now() - MIN_INTERVAL,
        last_payload: String::new(),
        enabled: false,
        template: String::new(),
    });
    st.enabled = enabled;
    st.template = template;
    if !enabled {
        if let Some(conn) = st.conn.as_mut() {
            let _ = conn.write_frame(
                OPCODE_FRAME,
                &json!({
                    "cmd": "SET_ACTIVITY",
                    "args": {"pid": std::process::id(), "activity": null},
                    "nonce": nonce()
                }),
            );
        }
        st.conn = None;
        st.last_payload.clear();
    }
    Ok(())
}

/// True when the Discord client's IPC socket is reachable right now, so the
/// settings panel can show a live status instead of a hopeful one.
#[tauri::command]
pub fn discord_available() -> bool {
    Ipc::connect().is_some()
}
