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
    match no_num.split_once(" - ") {
        Some((a, t)) if !a.trim().is_empty() && !t.trim().is_empty() => {
            (a.trim().to_string(), t.trim().to_string())
        }
        _ => ("—".to_string(), no_num.to_string()),
    }
}

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
