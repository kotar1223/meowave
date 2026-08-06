//! Local audio files.
//!
//! The webview cannot read arbitrary disk paths, and Tauri's asset protocol
//! would need every folder whitelisted up front. So local tracks travel the
//! same road as the streaming services: the frontend gets
//! `/stream/local/<id>` from the proxy and never sees a path.
//!
//! Metadata comes from the file name rather than ID3 tags — one less
//! dependency, and "Artist - Title.mp3" covers the overwhelming majority of
//! real libraries. Anything unparseable keeps the bare file name as its title.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

/// id -> absolute path. Rebuilt from the frontend's saved list on every start,
/// so ids must be stable across runs: they're derived from the path itself.
static FILES: Mutex<Option<HashMap<String, PathBuf>>> = Mutex::new(None);

pub const EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "oga", "m4a", "aac", "opus", "webm"];

#[derive(Serialize, Clone)]
pub struct LocalTrack {
    pub id: String,
    /// Always "local" — the frontend treats it as one more service.
    pub s: String,
    pub t: String,
    pub a: String,
    pub al: String,
    pub d: u32,
    pub art: Option<String>,
    pub mode: String,
    /// Shown in the UI so the user can tell two same-named files apart.
    pub path: String,
}

fn id_for(path: &Path) -> String {
    format!("{:x}", md5::compute(path.to_string_lossy().as_bytes()))
}

pub fn path_of(id: &str) -> Option<PathBuf> {
    FILES.lock().ok()?.as_ref()?.get(id).cloned()
}

fn remember(id: String, path: PathBuf) {
    if let Ok(mut g) = FILES.lock() {
        g.get_or_insert_with(HashMap::new).insert(id, path);
    }
}

/// "01 - Artist - Title.mp3" / "Artist - Title.flac" / "Title.wav"
fn parse_name(stem: &str) -> (String, String) {
    let cleaned = stem.trim();
    // Drop a leading track number: "07 ", "07. ", "07 - "
    let no_num = {
        let bytes = cleaned.as_bytes();
        let digits = bytes.iter().take_while(|b| b.is_ascii_digit()).count();
        if digits > 0 && digits <= 3 && cleaned.len() > digits {
            cleaned[digits..].trim_start_matches([' ', '.', '-', '_']).trim()
        } else {
            cleaned
        }
    };
    // Downloaded files routinely use underscores where the original had
    // spaces ("artist__feat._Sqwore__320kbps"), which produced titles that
    // looked like corrupted text. Collapse them first, and strip the quality
    // and source tags that add nothing to a track name.
    let spaced = no_num.replace('_', " ");
    let mut s = spaced.as_str().trim().to_string();
    for tag in [
        "320kbps", "256kbps", "192kbps", "128kbps", "320 kbps", "(Official Video)",
        "(Official Audio)", "[Official Video]", "(Lyrics)", "(Audio)", "HD", "HQ",
    ] {
        // Case-insensitive removal without pulling in a regex dependency.
        loop {
            let Some(at) = s.to_lowercase().find(&tag.to_lowercase()) else {
                break;
            };
            s.replace_range(at..at + tag.len(), "");
        }
    }
    // Tidy up what the removals left behind.
    let s = s
        .replace("()", "")
        .replace("[]", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let s = s.trim().trim_matches(['-', '–', ' ', '.']).trim().to_string();
    let cleaned = if s.is_empty() { no_num.to_string() } else { s };

    // " - " is the conventional separator, but a bare "-" is common too.
    let split = cleaned
        .split_once(" - ")
        .or_else(|| cleaned.split_once(" — "))
        .or_else(|| cleaned.split_once(" – "));
    match split {
        Some((a, t)) if !a.trim().is_empty() && !t.trim().is_empty() => {
            (a.trim().to_string(), t.trim().to_string())
        }
        _ => ("—".to_string(), cleaned),
    }
}

/// Test-only shim: parse_name is private, and the filename parser is the
/// only metadata source, so it needs direct coverage.
#[cfg(test)]
pub fn parse_name_pub(s: &str) -> (String, String) { parse_name(s) }

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn track_from(path: &Path) -> Option<LocalTrack> {
    if !is_audio(path) || !path.is_file() {
        return None;
    }
    let stem = path.file_stem()?.to_string_lossy().to_string();
    let (a, t) = parse_name(&stem);
    let id = id_for(path);
    remember(id.clone(), path.to_path_buf());
    Some(LocalTrack {
        id,
        s: "local".into(),
        t,
        a,
        al: path
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        // Duration needs a decoder; the <audio> element reports the real value
        // once it loads metadata, and the frontend writes it back over this 0.
        d: 0,
        art: None,
        mode: "local".into(),
        path: path.to_string_lossy().to_string(),
    })
}

/// Registers explicit files (from the picker) and returns them as tracks.
#[tauri::command]
pub fn local_add(paths: Vec<String>) -> Vec<LocalTrack> {
    paths
        .iter()
        .filter_map(|p| track_from(Path::new(p)))
        .collect()
}

/// Walks a folder (one level of recursion is plenty for album/artist layouts).
#[tauri::command]
pub fn local_scan(folder: String, depth: Option<u8>) -> Result<Vec<LocalTrack>, String> {
    let root = PathBuf::from(&folder);
    if !root.is_dir() {
        return Err("not a folder".into());
    }
    let mut out = Vec::new();
    walk(&root, depth.unwrap_or(3), &mut out);
    out.sort_by(|x, y| x.path.to_lowercase().cmp(&y.path.to_lowercase()));
    Ok(out)
}

fn walk(dir: &Path, depth: u8, out: &mut Vec<LocalTrack>) {
    // A deep music folder can hold tens of thousands of files; stop early
    // rather than freeze the UI waiting for a full traversal.
    if out.len() >= 5000 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if depth > 0 {
                walk(&path, depth - 1, out);
            }
        } else if let Some(tr) = track_from(&path) {
            out.push(tr);
        }
    }
}

/// Re-registers paths saved by the frontend on a previous run, so
/// `/stream/local/<id>` keeps resolving after a restart.
#[tauri::command]
pub fn local_rehydrate(paths: Vec<String>) -> usize {
    let mut n = 0;
    for p in paths {
        let path = PathBuf::from(&p);
        if path.is_file() {
            remember(id_for(&path), path);
            n += 1;
        }
    }
    n
}

/// Content type from the extension — the proxy has to declare one and there's
/// no server to ask.
pub fn mime_of(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
        .as_str()
    {
        "mp3" => "audio/mpeg",
        "flac" => "audio/flac",
        "wav" => "audio/wav",
        "ogg" | "oga" | "opus" => "audio/ogg",
        "m4a" | "aac" => "audio/mp4",
        "webm" => "audio/webm",
        _ => "application/octet-stream",
    }
}

/// Saves a track to disk through the same resolver playback uses.
///
/// Downloading is deliberately a Rust command rather than a link in the
/// webview: the service URLs are signed and short-lived, several of them refuse
/// a request without the right User-Agent, and handing the raw URL to the
/// browser opened an external window instead of saving a file. Going through
/// the local proxy means the bytes arrive on exactly the path that is already
/// known to work for playback.
#[tauri::command]
pub async fn download_track(
    service: String,
    id: String,
    name: String,
    folder: Option<String>,
    port: u16,
    hq: bool,
) -> Result<String, String> {
    // Sanitise: `name` is built from a track title, which routinely contains
    // characters Windows rejects outright, and could otherwise walk out of the
    // target directory.
    let stem: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect();
    let stem = stem.trim().trim_end_matches('.').to_string();
    let stem = if stem.is_empty() { "track".to_string() } else { stem };
    let stem: String = stem.chars().take(120).collect();

    let dir = match folder {
        Some(f) if !f.trim().is_empty() => std::path::PathBuf::from(f),
        _ => {
            let base = std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(std::path::PathBuf::from)
                .ok_or("no home directory")?;
            base.join("Music").join("Meowave")
        }
    };
    std::fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;

    let url = format!(
        "http://127.0.0.1:{port}/stream/{}/{}?hq={}",
        urlencoding::encode(&service),
        urlencoding::encode(&id),
        if hq { 1 } else { 0 }
    );

    let resp = crate::api::client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() && resp.status().as_u16() != 206 {
        return Err(format!("service returned {}", resp.status()));
    }

    // Extension from the content type: the proxy knows what it actually served,
    // and a .mp3 holding webm confuses every other player.
    //
    // YouTube serves Opus-in-WebM, which is why downloads arrived as .webm.
    // The extension was honest, but a .webm audio file will not open in most
    // players or car stereos, so it reads as a broken download. If ffmpeg is
    // available the container is remuxed/encoded to mp3 below; if not, the
    // real extension is kept rather than lying about the contents.
    let ext = match resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
    {
        t if t.contains("webm") => "webm",
        t if t.contains("mp4") || t.contains("m4a") || t.contains("aac") => "m4a",
        t if t.contains("flac") => "flac",
        t if t.contains("ogg") => "ogg",
        t if t.contains("wav") => "wav",
        _ => "mp3",
    };

    // Never overwrite: a second download of the same title gets a suffix.
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem} ({n}).{ext}"));
        n += 1;
        if n > 999 {
            return Err("too many files with that name".into());
        }
    }

    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.is_empty() {
        return Err("service returned an empty stream".into());
    }
    std::fs::write(&path, &bytes).map_err(|e| format!("cannot write {}: {e}", path.display()))?;

    // Convert to mp3 when the source container is one general-purpose players
    // choke on. Failure is not an error: the original file is already written
    // and playable in Meowave, so a missing ffmpeg costs compatibility, not the
    // download.
    if matches!(ext, "webm" | "m4a") {
        if let Some(mp3) = to_mp3(&path) {
            return Ok(mp3.to_string_lossy().to_string());
        }
    }
    Ok(path.to_string_lossy().to_string())
}

/// Locates ffmpeg without requiring it to be installed system-wide.
fn ffmpeg_bin() -> Option<std::path::PathBuf> {
    // Next to our own executable first: that is where a bundled copy would be.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let local = dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
            if local.exists() {
                return Some(local);
            }
        }
    }
    // Then PATH.
    let probe = std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg("ffmpeg")
        .output()
        .ok()?;
    if !probe.status.success() {
        return None;
    }
    let first = String::from_utf8_lossy(&probe.stdout)
        .lines()
        .next()?
        .trim()
        .to_string();
    if first.is_empty() {
        None
    } else {
        Some(std::path::PathBuf::from(first))
    }
}

/// Transcodes to mp3 and removes the source. Returns None if ffmpeg is absent
/// or the conversion fails, leaving the original untouched.
fn to_mp3(src: &std::path::Path) -> Option<std::path::PathBuf> {
    let ff = ffmpeg_bin()?;
    let dst = src.with_extension("mp3");
    let status = std::process::Command::new(ff)
        .args(["-y", "-loglevel", "error", "-i"])
        .arg(src)
        // 192k CBR: transparent enough for a re-encode of a lossy source, and
        // universally supported.
        .args(["-vn", "-codec:a", "libmp3lame", "-b:a", "192k"])
        .arg(&dst)
        .status()
        .ok()?;
    if status.success() && dst.exists() {
        let _ = std::fs::remove_file(src);
        Some(dst)
    } else {
        let _ = std::fs::remove_file(&dst);
        None
    }
}

/// Whether mp3 conversion is possible on this machine, so the UI can say so
/// instead of silently producing .webm files.
#[tauri::command]
pub fn has_ffmpeg() -> bool {
    ffmpeg_bin().is_some()
}

/// Opens a URL in the user's default browser.
///
/// A backup for the opener plugin: if its permission or registration is ever
/// missing, links must still open somewhere real instead of silently doing
/// nothing. Only http(s) is accepted — handing an arbitrary scheme to the
/// shell would let a crafted URL launch a local program.
#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err("only http(s) links can be opened".into());
    }
    if u.contains('\n') || u.contains('\r') {
        return Err("invalid url".into());
    }
    #[cfg(target_os = "windows")]
    {
        // `cmd /c start` would need escaping of & and ^; ShellExecute via
        // rundll32 avoids the shell entirely.
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", u])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open").arg(u).spawn().map_err(|e| e.to_string())?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open").arg(u).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
