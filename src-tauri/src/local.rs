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

pub const EXTENSIONS: &[&str] = &[
    "mp3", "flac", "wav", "ogg", "oga", "m4a", "aac", "opus", "webm",
];

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
            cleaned[digits..]
                .trim_start_matches([' ', '.', '-', '_'])
                .trim()
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
        "320kbps",
        "256kbps",
        "192kbps",
        "128kbps",
        "320 kbps",
        "(Official Video)",
        "(Official Audio)",
        "[Official Video]",
        "(Lyrics)",
        "(Audio)",
        "(HD)",
        "[HD]",
        "(HQ)",
        "[HQ]",
    ] {
        // Case-insensitive removal without pulling in a regex dependency.
        //
        // Two bugs lived here. First, the byte offset came from `to_lowercase()`
        // and was then applied to the original string: for any name containing
        // non-ASCII characters whose lowercase form has a different UTF-8 length
        // that offset lands mid-character and `replace_range` panics, taking the
        // whole scan with it. Matching on a per-iteration lowercase copy of the
        // *current* string is only safe when the two share a byte layout, so the
        // match is now located by scanning char boundaries directly.
        //
        // Second, bare "HD"/"HQ" matched inside ordinary words — "Shdow",
        // "HQuartet" — so those tags are only stripped when bracketed.
        let needle = tag.to_lowercase();
        loop {
            let hay = s.to_lowercase();
            let Some(lower_at) = hay.find(&needle) else {
                break;
            };
            // Map the match back to the original string by counting chars, not
            // bytes: char counts are stable across case folding for every
            // alphabet this touches.
            let char_at = hay[..lower_at].chars().count();
            let char_len = tag.chars().count();
            let Some(start) = s.char_indices().nth(char_at).map(|(i, _)| i) else {
                break;
            };
            let end = s
                .char_indices()
                .nth(char_at + char_len)
                .map(|(i, _)| i)
                .unwrap_or(s.len());
            if start >= end {
                break;
            }
            s.replace_range(start..end, "");
        }
    }
    // Tidy up what the removals left behind.
    let s = s
        .replace("()", "")
        .replace("[]", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let s = s
        .trim()
        .trim_matches(['-', '–', ' ', '.'])
        .trim()
        .to_string();
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
pub fn parse_name_pub(s: &str) -> (String, String) {
    parse_name(s)
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
    out.sort_by_key(|x| x.path.to_lowercase());
    Ok(out)
}

fn walk(dir: &Path, depth: u8, out: &mut Vec<LocalTrack>) {
    // A deep music folder can hold tens of thousands of files; stop early
    // rather than freeze the UI waiting for a full traversal.
    if out.len() >= 5000 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
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

/// Rejects a download target that we should not be writing into.
///
/// `folder` arrives from the frontend. It is normally a directory the user
/// picked, but nothing in the IPC boundary guarantees that, so the checks are:
/// absolute, not a system location, and at most one new level deep. The last
/// rule is what stops `create_dir_all` from materialising a whole tree in an
/// arbitrary place while still allowing the "one subfolder per playlist" case,
/// where the parent is the directory the user just chose.
fn validate_dir(dir: &Path) -> Result<(), String> {
    if !dir.is_absolute() {
        return Err("the download folder must be an absolute path".into());
    }
    if dir.components().any(|c| c.as_os_str() == "..") {
        return Err("the download folder must not contain ..".into());
    }
    if dir.is_dir() {
        return protect_system_dir(dir);
    }
    let parent = dir.parent().ok_or("invalid download folder")?;
    if !parent.is_dir() {
        return Err(format!(
            "{} does not exist; pick the download folder again",
            parent.display()
        ));
    }
    protect_system_dir(dir)
}

/// Writing into the OS's own directories is never what the user meant.
fn protect_system_dir(dir: &Path) -> Result<(), String> {
    let lower = dir.to_string_lossy().to_lowercase().replace('/', "\\");
    const DENY: &[&str] = &[
        "c:\\windows",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata",
        "/etc",
        "/bin",
        "/sbin",
        "/usr",
        "/system",
        "/library",
    ];
    let unixy = dir.to_string_lossy().to_lowercase();
    for bad in DENY {
        let hit = if bad.starts_with('/') {
            unixy == *bad || unixy.starts_with(&format!("{bad}/"))
        } else {
            lower == *bad || lower.starts_with(&format!("{bad}\\"))
        };
        if hit {
            return Err("that folder belongs to the system".into());
        }
    }
    Ok(())
}

/// Saves a track to disk through the same resolver playback uses.
///
/// Downloading is deliberately a Rust command rather than a link in the
/// webview: the service URLs are signed and short-lived, several of them refuse
/// a request without the right User-Agent, and handing the raw URL to the
/// browser opened an external window instead of saving a file. Going through
/// the local proxy means the bytes arrive on exactly the path that is already
/// known to work for playback.
///
/// The proxy port is read from our own state, never from the caller. It used to
/// be an argument, which turned this command into "fetch any localhost port and
/// write the response to a file of your choosing".
#[tauri::command]
pub async fn download_track(
    service: String,
    id: String,
    name: String,
    folder: Option<String>,
    hq: bool,
    // Container the caller's webview can decode ("mp4" / "webm" / "best").
    // YouTube Music ships both, and a Mac without Opus support should not end
    // up with a .webm it cannot open — see ytm::pick_format.
    fmt: Option<String>,
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
    let stem = if stem.is_empty() {
        "track".to_string()
    } else {
        stem
    };
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
    validate_dir(&dir)?;
    {
        let target = dir.clone();
        tokio::task::spawn_blocking(move || std::fs::create_dir_all(&target))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    }

    let port = crate::stream_port_value().ok_or("the audio proxy is not running")?;
    let fmt = fmt.unwrap_or_else(|| "best".to_string());
    let url = format!(
        "http://127.0.0.1:{port}/stream/{}/{}?k={}&hq={}&fmt={}",
        urlencoding::encode(&service),
        urlencoding::encode(&id),
        crate::stream::token(),
        if hq { 1 } else { 0 },
        urlencoding::encode(&fmt)
    );

    // media_client: a download is a body read that lasts as long as the file
    // takes, and client()'s total deadline cut every long track off.
    let mut resp = crate::api::media_client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() && resp.status().as_u16() != 206 {
        // The proxy explains resolve failures in the body ("no access to this
        // track"); surfacing that instead of a bare status code is the
        // difference between "SoundCloud deleted this upload" and a mystery
        // "502" for a track that still shows up in search.
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        let reason = body.trim().chars().take(180).collect::<String>();
        return Err(if reason.is_empty() {
            format!("service returned {status}")
        } else {
            format!("service returned {status}: {reason}")
        });
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

    // Never overwrite: a second download of the same title gets a suffix. The
    // mp3 that to_mp3 will produce is reserved at the same time, otherwise a
    // .webm download could transcode over an unrelated existing .mp3.
    let needs_mp3 = matches!(ext, "webm" | "m4a");
    let (path, mp3_path) = reserve_names(&dir, &stem, ext, needs_mp3)?;

    // Streamed to disk. `resp.bytes()` held the entire track in memory first,
    // which for a FLAC album is hundreds of megabytes for no reason.
    let mut file = tokio::fs::File::create(&path)
        .await
        .map_err(|e| format!("cannot write {}: {e}", path.display()))?;
    let mut written: u64 = 0;
    loop {
        let chunk = match resp.chunk().await {
            Ok(Some(c)) => c,
            Ok(None) => break,
            Err(e) => {
                drop(file);
                let _ = tokio::fs::remove_file(&path).await;
                return Err(format!("download failed: {e}"));
            }
        };
        use tokio::io::AsyncWriteExt;
        if let Err(e) = file.write_all(&chunk).await {
            drop(file);
            let _ = tokio::fs::remove_file(&path).await;
            return Err(format!("cannot write {}: {e}", path.display()));
        }
        written += chunk.len() as u64;
    }
    {
        use tokio::io::AsyncWriteExt;
        file.flush().await.map_err(|e| e.to_string())?;
    }
    drop(file);

    if written == 0 {
        let _ = tokio::fs::remove_file(&path).await;
        return Err("service returned an empty stream".into());
    }

    // Convert to mp3 when the source container is one general-purpose players
    // choke on. Failure is not an error: the original file is already written
    // and playable in Meowave, so a missing ffmpeg costs compatibility, not the
    // download.
    if let Some(dst) = mp3_path {
        let src = path.clone();
        let converted = tokio::task::spawn_blocking(move || to_mp3(&src, &dst))
            .await
            .map_err(|e| e.to_string())?;
        if let Some(mp3) = converted {
            return Ok(mp3.to_string_lossy().to_string());
        }
    }
    Ok(path.to_string_lossy().to_string())
}

/// Picks a free `<stem>.<ext>`, and — when a transcode will follow — a free
/// `.mp3` beside it, so neither step can clobber an existing file.
fn reserve_names(
    dir: &Path,
    stem: &str,
    ext: &str,
    also_mp3: bool,
) -> Result<(PathBuf, Option<PathBuf>), String> {
    for n in 1..=999u32 {
        let suffix = if n == 1 {
            String::new()
        } else {
            format!(" ({n})")
        };
        let main = dir.join(format!("{stem}{suffix}.{ext}"));
        if main.exists() {
            continue;
        }
        if !also_mp3 {
            return Ok((main, None));
        }
        let mp3 = dir.join(format!("{stem}{suffix}.mp3"));
        if mp3.exists() {
            continue;
        }
        return Ok((main, Some(mp3)));
    }
    Err("too many files with that name".into())
}


#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn new_command<S: AsRef<std::ffi::OsStr>>(program: S) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Downloads a track and bakes the current sound settings into the file.
///
/// The plain download saves what the service sent. This one applies what the
/// user is actually hearing: the ten-band equaliser and the playback rate.
/// That is the whole point of a "speedup" or "slowed" export — the effect has
/// to survive leaving Meowave, and a normal download loses it because those
/// live in the Web Audio graph, not in the bytes.
///
/// Speed alteration can preserve pitch (via `atempo`) or alter pitch (via
/// `asetrate`/`aresample`), matching the frontend where `preservesPitch = false`
/// gives classic Nightcore / Slowed behaviour.
// The arguments arrive from the frontend by name, so a parameter struct would
// only move the same nine fields behind one more type.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn download_processed(
    service: String,
    id: String,
    name: String,
    folder: Option<String>,
    hq: bool,
    // Ten gains in dB, matching FREQ in the frontend. Empty means flat.
    gains: Vec<f32>,
    rate: f32,
    preserve_pitch: Option<bool>,
    // Appended to the file name, e.g. "speed up", so the export is
    // recognisable next to the original in a file manager.
    suffix: Option<String>,
    // Same container preference as download_track; forwarded unchanged.
    fmt: Option<String>,
) -> Result<String, String> {
    if !has_ffmpeg_async().await {
        return Err("ffmpeg-missing".into());
    }

    // Reuse the plain path for fetching: same proxy, same signing, same retry.
    let src = download_track(service, id, name, folder, hq, fmt).await?;
    let src = std::path::PathBuf::from(src);

    let filters = build_filters(&gains, rate, preserve_pitch.unwrap_or(false));
    if filters.is_empty() {
        // Nothing to apply; the untouched download is the correct answer
        // rather than a pointless re-encode that only loses quality.
        return Ok(src.to_string_lossy().to_string());
    }

    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("track")
        .to_string();
    let tag = suffix
        .unwrap_or_default()
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if (c as u32) < 0x20 => '_',
            c => c,
        })
        .collect::<String>()
        .trim()
        .to_string();
    let dir = src.parent().map(|p| p.to_path_buf()).unwrap_or_default();

    let base = if tag.is_empty() {
        format!("{stem} (processed)")
    } else {
        format!("{stem} ({tag})")
    };
    let (dst, _) = reserve_names(&dir, &base, "mp3", false)?;

    // ffmpeg is a long-running child process; on the runtime's own worker it
    // froze every other command for the duration of the transcode.
    let ff = ffmpeg_bin_async().await.ok_or("ffmpeg-missing")?;
    let ok = {
        let (src, dst, filters) = (src.clone(), dst.clone(), filters.clone());
        tokio::task::spawn_blocking(move || {
            new_command(ff)
                .args(["-y", "-loglevel", "error", "-i"])
                .arg(&src)
                .args(["-vn", "-af", &filters])
                .args(["-codec:a", "libmp3lame", "-b:a", "256k"])
                .arg(&dst)
                .status()
                .map(|s| s.success())
                .map_err(|e| format!("ffmpeg failed to start: {e}"))
        })
        .await
        .map_err(|e| e.to_string())??
    };

    if !ok || !dst.exists() {
        let _ = tokio::fs::remove_file(&dst).await;
        // The unprocessed file is still on disk and still playable, so this is
        // a partial success, not a lost download.
        return Err(format!(
            "processing failed; the original is at {}",
            src.display()
        ));
    }

    Ok(dst.to_string_lossy().to_string())
}

/// Builds the ffmpeg filter chain for the equaliser and the rate.
///
/// Kept separate so the "nothing to do" case is obvious: a flat EQ at 1.0×
/// produces an empty chain and the caller skips the re-encode entirely.
fn build_filters(gains: &[f32], rate: f32, preserve_pitch: bool) -> String {
    // Same centre frequencies as the frontend's FREQ array. They have to match,
    // or the exported file will not sound like what was playing.
    const FREQ: [u32; 10] = [32, 60, 150, 400, 1000, 2400, 4000, 8000, 12000, 16000];
    let mut parts: Vec<String> = Vec::new();

    for (i, f) in FREQ.iter().enumerate() {
        let g = gains.get(i).copied().unwrap_or(0.0);
        // Below a tenth of a dB is inaudible and only costs a filter stage.
        if g.abs() < 0.1 {
            continue;
        }
        // width_type=q with q=1.05 mirrors the BiquadFilterNode settings used
        // for playback, so the exported curve matches the live one.
        parts.push(format!("equalizer=f={f}:width_type=q:w=1.05:g={g:.2}"));
    }

    let r = if rate.is_finite() { rate } else { 1.0 };
    if (r - 1.0).abs() > 0.005 {
        let r = r.clamp(0.25, 4.0);
        if preserve_pitch {
            // atempo is limited to 0.5..=2.0, so anything wider is split into
            // several stages whose product is the requested rate.
            let mut left = r;
            while left > 2.0 {
                parts.push("atempo=2.0".into());
                left /= 2.0;
            }
            while left < 0.5 {
                parts.push("atempo=0.5".into());
                left /= 0.5;
            }
            parts.push(format!("atempo={left:.4}"));
        } else {
            let base_sr: u32 = 44100;
            let target_sr = ((base_sr as f32) * r).round() as u32;
            parts.push(format!("aresample={base_sr},asetrate={target_sr},aresample={base_sr}"));
        }
    }

    parts.join(",")
}

/// Locates ffmpeg without requiring it to be installed system-wide.
///
/// Cached: the PATH probe spawns a process, and this is called on every
/// download and by `has_ffmpeg` on every settings render.
fn ffmpeg_bin() -> Option<std::path::PathBuf> {
    static FOUND: Mutex<Option<Option<std::path::PathBuf>>> = Mutex::new(None);
    if let Ok(guard) = FOUND.lock() {
        if let Some(cached) = guard.as_ref() {
            return cached.clone();
        }
    }
    let found = locate_ffmpeg();
    if let Ok(mut guard) = FOUND.lock() {
        *guard = Some(found.clone());
    }
    found
}

fn locate_ffmpeg() -> Option<std::path::PathBuf> {
    // The bundled copy first. `externalBin` in tauri.conf.json installs it right
    // next to our own executable with the target-triple suffix stripped, so the
    // installed layout is meowave.exe + ffmpeg.exe in one directory.
    //
    // Preferred over PATH deliberately: a version we ship is a version we have
    // verified has libmp3lame, atempo and equalizer (see
    // scripts/fetch-ffmpeg.mjs). A system ffmpeg can be an ancient build, or a
    // shell shim, or something else entirely named ffmpeg.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let local = dir.join(if cfg!(windows) { "ffmpeg.exe" } else { "ffmpeg" });
            if local.is_file() {
                return Some(local);
            }
            // `cargo tauri dev` runs from target/debug, where the sidecar is not
            // copied; fall back to the checkout so processing works in dev too.
            #[cfg(debug_assertions)]
            for up in [2usize, 3] {
                let mut root = dir.to_path_buf();
                for _ in 0..up {
                    root = match root.parent() {
                        Some(p) => p.to_path_buf(),
                        None => break,
                    };
                }
                let candidate = root.join("ffmpeg").join(if cfg!(windows) {
                    "ffmpeg-x86_64-pc-windows-msvc.exe"
                } else {
                    "ffmpeg"
                });
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    // Common fixed locations on Unix, probed before PATH: a GUI launch on
    // macOS does not inherit a shell profile, so Homebrew's prefix
    // (/opt/homebrew/bin) never reaches `which`. The same list covers the
    // usual Linux install roots.
    #[cfg(unix)]
    for p in [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/snap/bin/ffmpeg",
    ] {
        let candidate = std::path::PathBuf::from(p);
        if candidate.is_file() {
            return Some(candidate);
        }
    }
    // Then PATH.
    let probe = new_command(if cfg!(windows) { "where" } else { "which" })
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

/// `ffmpeg_bin` from async context: the first call spawns `where`/`which`.
async fn ffmpeg_bin_async() -> Option<std::path::PathBuf> {
    tokio::task::spawn_blocking(ffmpeg_bin).await.ok().flatten()
}

async fn has_ffmpeg_async() -> bool {
    ffmpeg_bin_async().await.is_some()
}

/// Transcodes to mp3 and removes the source. Returns None if ffmpeg is absent
/// or the conversion fails, leaving the original untouched.
///
/// `dst` is chosen by the caller rather than `src.with_extension("mp3")`: that
/// silently overwrote an unrelated `Song.mp3` whenever `Song.webm` was
/// downloaded next to it, and then deleted the source — losing the original
/// file outright.
fn to_mp3(src: &std::path::Path, dst: &std::path::Path) -> Option<std::path::PathBuf> {
    let ff = ffmpeg_bin()?;
    let status = new_command(ff)
        .args(["-y", "-loglevel", "error", "-i"])
        .arg(src)
        // 192k CBR: transparent enough for a re-encode of a lossy source, and
        // universally supported.
        .args(["-vn", "-codec:a", "libmp3lame", "-b:a", "192k"])
        .arg(dst)
        .status()
        .ok()?;
    if status.success() && dst.exists() {
        let _ = std::fs::remove_file(src);
        Some(dst.to_path_buf())
    } else {
        let _ = std::fs::remove_file(dst);
        None
    }
}

/// Whether mp3 conversion is possible on this machine, so the UI can say so
/// instead of silently producing .webm files.
#[tauri::command]
pub async fn has_ffmpeg() -> bool {
    has_ffmpeg_async().await
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
        new_command("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", u])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(u)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(all(unix, not(target_os = "macos")))]
    std::process::Command::new("xdg-open")
        .arg(u)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_filters_eq_frequencies() {
        let gains = vec![3.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -2.5];
        let f = build_filters(&gains, 1.0, false);
        assert!(f.contains("equalizer=f=32:width_type=q:w=1.05:g=3.00"));
        assert!(f.contains("equalizer=f=16000:width_type=q:w=1.05:g=-2.50"));
    }

    #[test]
    fn test_build_filters_pitch_altering() {
        let f = build_filters(&[], 1.25, false);
        assert!(f.contains("asetrate=55125"));
        assert!(f.contains("aresample=44100"));
        assert!(!f.contains("atempo"));
    }

    #[test]
    fn test_build_filters_pitch_preserving() {
        let f = build_filters(&[], 1.25, true);
        assert!(f.contains("atempo=1.25"));
        assert!(!f.contains("asetrate"));
    }
}

