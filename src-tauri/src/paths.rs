//! Where Meowave keeps its files on disk.
//!
//! Everything lives under `%LOCALAPPDATA%\Meowave` (Local, not Roaming — the
//! cache can grow to hundreds of megabytes and roaming profiles copy over the
//! network at every logon). Secrets are the exception: OAuth tokens stay in the
//! Credential Manager, see `tokens.rs`.
//!
//!   %LOCALAPPDATA%\Meowave\
//!     account.json      profile snapshot, so the UI can paint before the network answers
//!     settings.json     UI state that isn't worth a round trip
//!     badges.json       owned badges, so the profile renders offline
//!     queue.json        the playback queue
//!     proxy.json        proxy configuration, see proxy.rs
//!     cache\            reported and cleared from the settings screen

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const APP_DIR: &str = "Meowave";

/// Root data directory, created on first call.
pub fn root() -> Result<PathBuf, String> {
    let base = if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .ok_or_else(|| "LOCALAPPDATA is not set".to_string())?
    } else if cfg!(target_os = "macos") {
        home()?.join("Library").join("Application Support")
    } else {
        // XDG: honour the override, fall back to the spec default. `home()?`
        // rather than `unwrap_or_default()` — an empty base made the data
        // directory relative to the working directory, so settings silently
        // landed in whatever folder the app was launched from.
        match std::env::var_os("XDG_DATA_HOME") {
            Some(x) => PathBuf::from(x),
            None => home()?.join(".local").join("share"),
        }
    };
    let dir = base.join(APP_DIR);
    fs::create_dir_all(&dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    Ok(dir)
}

fn home() -> Result<PathBuf, String> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| "no home directory".to_string())
}

fn cache_root() -> Result<PathBuf, String> {
    let d = root()?.join("cache");
    fs::create_dir_all(&d).map_err(|e| format!("cannot create {}: {e}", d.display()))?;
    Ok(d)
}


/// Only these names are writable from the frontend, so a bug (or a hostile
/// page, if a webview ever loads remote content) can't scribble anywhere else.
const STORE_FILES: &[&str] = &["account", "settings", "badges", "queue"];

fn store_path(name: &str) -> Result<PathBuf, String> {
    if !STORE_FILES.contains(&name) {
        return Err(format!("unknown store: {name}"));
    }
    Ok(root()?.join(format!("{name}.json")))
}

/// Write to a temp file, then rename over the target. A crash mid-write leaves
/// the old file intact instead of a truncated one.
fn write_atomic(path: &Path, data: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
        f.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn store_read(name: String) -> Result<Option<String>, String> {
    let path = store_path(&name)?;
    match fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn store_write(name: String, json: String) -> Result<(), String> {
    // Parse before writing so we never persist something we can't read back.
    serde_json::from_str::<serde_json::Value>(&json).map_err(|e| format!("not json: {e}"))?;
    write_atomic(&store_path(&name)?, &json)
}

#[tauri::command]
pub fn store_delete(name: String) -> Result<(), String> {
    match fs::remove_file(store_path(&name)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// Absolute path to the data directory — shown in Settings so the user can find
/// their files without hunting through AppData.
#[tauri::command]
pub fn data_dir() -> Result<String, String> {
    Ok(root()?.to_string_lossy().to_string())
}

fn dir_size(path: &Path) -> u64 {
    let Ok(entries) = fs::read_dir(path) else {
        return 0;
    };
    entries
        .flatten()
        .map(|e| match e.file_type() {
            Ok(t) if t.is_dir() => dir_size(&e.path()),
            Ok(_) => e.metadata().map(|m| m.len()).unwrap_or(0),
            Err(_) => 0,
        })
        .sum()
}

#[tauri::command]
pub fn cache_size() -> Result<u64, String> {
    Ok(dir_size(&cache_root()?))
}

#[tauri::command]
pub fn cache_clear() -> Result<(), String> {
    let c = cache_root()?;
    fs::remove_dir_all(&c).map_err(|e| e.to_string())?;
    fs::create_dir_all(&c).map_err(|e| e.to_string())
}

// cache_put / cache_get used to live here. They returned a filesystem path for
// the frontend to use as an `asset://` URL, but the asset protocol is not
// enabled (no `protocol-asset` feature, no `assetProtocol` scope), so the path
// was unusable and nothing ever called them. Covers are cached by the webview's
// own HTTP cache instead.

