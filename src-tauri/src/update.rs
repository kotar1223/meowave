//! Versions and updates.
//!
//! Installed builds update themselves through GitHub Releases: every client
//! checks `latest.json`, Tauri verifies the downloaded installer signature
//! before it can run, the public key is safe to ship and the private key
//! exists only as GitHub Actions secrets.
//!
//! A source checkout (`npm run dev` — a debug build whose repository is still
//! on disk) has no installer to download: its update is `git pull`. It checks
//! the branch it tracks at launch and pulls with one button, so the owner
//! never has to remember which branch moved or whether the database schema
//! changed with it.
//!
//! The version itself lives in `src-tauri/tauri.conf.json` (with copies in
//! Cargo.toml, Cargo.lock and package.json kept equal by
//! `scripts/version.mjs`); the UI shows it as "Beta 3.2".

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::AppHandle;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_updater::UpdaterExt;

/// Release channel shown next to the number.
pub const CHANNEL: &str = "beta";

/// "3.2.0" → "Beta 3.2", "3.2.1" → "Beta 3.2.1". A trailing ".0" patch is
/// noise in a title; anything after a "-" or "+" is dropped for the same
/// reason (it is still in the full version shown beside it).
pub fn version_label(version: &str) -> String {
    let core = version.split(['-', '+']).next().unwrap_or(version).trim();
    let parts: Vec<&str> = core.split('.').collect();
    let short = match parts.as_slice() {
        [major, minor, "0"] => format!("{major}.{minor}"),
        _ => core.to_string(),
    };
    let mut ch = CHANNEL.chars();
    let channel = match ch.next() {
        Some(c) => c.to_uppercase().collect::<String>() + ch.as_str(),
        None => String::new(),
    };
    format!("{channel} {short}").trim().to_string()
}

#[derive(Serialize)]
pub struct UpdateInfo {
    pub available: bool,
    pub current_version: String,
    pub version: Option<String>,
    pub body: Option<String>,
    pub date: Option<String>,
    /// "release" — a signed installer from GitHub Releases;
    /// "git" — a source checkout that updates with `git pull`.
    pub kind: &'static str,
    pub label: String,
    pub new_label: Option<String>,
    /// Commits the checkout is behind its upstream (git only).
    pub behind: u32,
    /// The incoming commits touch supabase/ — FULL_SCHEMA.sql has to be run.
    pub schema_changed: bool,
}

#[derive(Serialize)]
pub struct AppVersion {
    pub version: String,
    pub channel: &'static str,
    pub label: String,
    /// Running from a source checkout rather than an installed build.
    pub source: bool,
    pub branch: Option<String>,
    pub commit: Option<String>,
}

#[derive(Serialize)]
pub struct Pulled {
    pub from: String,
    pub to: String,
    pub version: String,
    pub label: String,
    pub schema_changed: bool,
    /// A rebuild was requested from `tauri dev` (it restarts the window).
    pub rebuild: bool,
}

/// The repository this binary was built from, when it is a debug build and
/// the checkout is still there. Release builds never treat themselves as a
/// checkout, even when built on the same machine.
fn source_dir() -> Option<PathBuf> {
    if !cfg!(debug_assertions) || cfg!(any(target_os = "android", target_os = "ios")) {
        return None;
    }
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).parent()?.to_path_buf();
    dir.join(".git").exists().then_some(dir)
}

/// Runs git without a console window, without ever prompting (a credential
/// prompt nobody can see would hang the check), with a hard time limit.
fn git(dir: &Path, args: &[&str], limit: Duration) -> Result<String, String> {
    use std::io::Read;
    use std::process::{Command, Stdio};
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "never")
        .env("LC_ALL", "C")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000);
    }
    let mut child = cmd.spawn().map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            "git_missing".to_string()
        } else {
            e.to_string()
        }
    })?;
    // Drain both pipes on their own threads: a chatty command must not fill
    // a pipe and deadlock against the wait below.
    let mut so = child.stdout.take().ok_or("git: no stdout")?;
    let mut se = child.stderr.take().ok_or("git: no stderr")?;
    let t_out = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = so.read_to_string(&mut s);
        s
    });
    let t_err = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = se.read_to_string(&mut s);
        s
    });
    let started = std::time::Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let out = t_out.join().unwrap_or_default();
                let err = t_err.join().unwrap_or_default();
                if status.success() {
                    return Ok(out);
                }
                let msg = err.trim();
                return Err(if msg.is_empty() { format!("git {}: {status}", args.first().unwrap_or(&"")) } else { msg.chars().take(400).collect() });
            }
            Ok(None) if started.elapsed() > limit => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("git_timeout".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(40)),
            Err(e) => return Err(e.to_string()),
        }
    }
}

const QUICK: Duration = Duration::from_secs(8);
const NETWORK: Duration = Duration::from_secs(45);

fn short(s: &str, n: usize) -> String {
    let s = s.trim();
    if s.chars().count() <= n {
        return s.to_string();
    }
    let mut out: String = s.chars().take(n.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn version_from_conf(text: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(text)
        .ok()?
        .get("version")?
        .as_str()
        .map(str::to_string)
}

fn git_check(dir: &Path, current: &str) -> Result<UpdateInfo, String> {
    let upstream = git(dir, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], QUICK)
        .map_err(|e| if e == "git_missing" { e } else { "no_upstream".to_string() })?;
    if upstream.trim().is_empty() {
        return Err("no_upstream".into());
    }
    // Plain `git fetch` uses the remote this branch tracks and the owner's own
    // credentials (the beta repository is private).
    git(dir, &["fetch", "--quiet", "--no-tags"], NETWORK)?;
    let behind: u32 = git(dir, &["rev-list", "--count", "HEAD..@{u}"], QUICK)?
        .trim()
        .parse()
        .unwrap_or(0);
    let mut info = UpdateInfo {
        available: behind > 0,
        current_version: current.to_string(),
        version: None,
        body: None,
        date: None,
        kind: "git",
        label: version_label(current),
        new_label: None,
        behind,
        schema_changed: false,
    };
    if behind == 0 {
        return Ok(info);
    }
    let theirs = git(dir, &["show", "@{u}:src-tauri/tauri.conf.json"], QUICK)
        .ok()
        .and_then(|t| version_from_conf(&t))
        .unwrap_or_else(|| current.to_string());
    let log = git(dir, &["log", "--format=%s", "-n", "12", "HEAD..@{u}"], QUICK).unwrap_or_default();
    let body: Vec<String> = log.lines().filter(|l| !l.trim().is_empty()).map(|l| short(l, 180)).collect();
    let files = git(dir, &["diff", "--name-only", "HEAD", "@{u}"], QUICK).unwrap_or_default();
    info.schema_changed = files.lines().any(|f| f.starts_with("supabase/"));
    info.date = git(dir, &["log", "-1", "--format=%cI", "@{u}"], QUICK).ok().map(|d| d.trim().to_string());
    info.new_label = Some(version_label(&theirs));
    info.version = Some(theirs);
    info.body = (!body.is_empty()).then(|| body.join("\n"));
    Ok(info)
}

fn git_pull(dir: &Path) -> Result<Pulled, String> {
    let before = git(dir, &["rev-parse", "HEAD"], QUICK)?.trim().to_string();
    git(dir, &["pull", "--ff-only", "--quiet", "--no-tags"], Duration::from_secs(120))?;
    let after = git(dir, &["rev-parse", "HEAD"], QUICK)?.trim().to_string();
    let files = if before == after {
        String::new()
    } else {
        git(dir, &["diff", "--name-only", &before, &after], QUICK).unwrap_or_default()
    };
    let schema_changed = files.lines().any(|f| f.starts_with("supabase/"));
    let app_changed = files.lines().any(|f| f.starts_with("src/") || f.starts_with("src-tauri/"));
    // The frontend is embedded into the binary (custom-protocol), so even a
    // change to src/ only shows after a rebuild. `tauri dev` rebuilds and
    // restarts the window when something under src-tauri/ changes; touching
    // main.rs (its time, not its content) asks for exactly that.
    let mut rebuild = false;
    if app_changed {
        let main_rs = dir.join("src-tauri").join("src").join("main.rs");
        if let Ok(f) = std::fs::OpenOptions::new().append(true).open(&main_rs) {
            rebuild = f.set_modified(std::time::SystemTime::now()).is_ok();
        }
    }
    let version = std::fs::read_to_string(dir.join("src-tauri").join("tauri.conf.json"))
        .ok()
        .and_then(|t| version_from_conf(&t))
        .unwrap_or_default();
    Ok(Pulled {
        from: before.chars().take(7).collect(),
        to: after.chars().take(7).collect(),
        label: version_label(&version),
        version,
        schema_changed,
        rebuild,
    })
}

#[tauri::command]
pub async fn app_version(app: AppHandle) -> AppVersion {
    let version = app.package_info().version.to_string();
    let label = version_label(&version);
    let dir = source_dir();
    let (branch, commit) = match &dir {
        Some(d) => {
            let d = d.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let b = git(&d, &["rev-parse", "--abbrev-ref", "HEAD"], QUICK).ok().map(|s| s.trim().to_string());
                let c = git(&d, &["rev-parse", "--short", "HEAD"], QUICK).ok().map(|s| s.trim().to_string());
                (b, c)
            })
            .await
            .unwrap_or((None, None))
        }
        None => (None, None),
    };
    AppVersion { version, channel: CHANNEL, label, source: dir.is_some(), branch, commit }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    if let Some(dir) = source_dir() {
        return tauri::async_runtime::spawn_blocking(move || git_check(&dir, &current))
            .await
            .map_err(|e| e.to_string())?;
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await.map_err(|e| e.to_string())? {
        Some(update) => Ok(UpdateInfo {
            available: true,
            label: version_label(&update.current_version),
            current_version: update.current_version.clone(),
            new_label: Some(version_label(&update.version)),
            version: Some(update.version.clone()),
            body: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
            kind: "release",
            behind: 0,
            schema_changed: false,
        }),
        None => Ok(UpdateInfo {
            available: false,
            label: version_label(&current),
            current_version: current,
            version: None,
            body: None,
            date: None,
            kind: "release",
            new_label: None,
            behind: 0,
            schema_changed: false,
        }),
    }
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<UpdateInfo, String> {
    let current = app.package_info().version.to_string();
    Ok(UpdateInfo {
        available: false,
        label: version_label(&current),
        current_version: current,
        version: None,
        body: None,
        date: None,
        kind: "release",
        new_label: None,
        behind: 0,
        schema_changed: false,
    })
}

/// Source checkout: `git pull --ff-only`, then ask `tauri dev` to rebuild.
/// Never merges or rebases — a checkout with its own commits or edits that
/// collide is reported as it is and left untouched.
#[tauri::command]
pub async fn update_pull() -> Result<Pulled, String> {
    let dir = source_dir().ok_or("not_source")?;
    tauri::async_runtime::spawn_blocking(move || git_pull(&dir))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    if source_dir().is_some() {
        return Err("source_checkout".into());
    }
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("no update available".into());
    };
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // NSIS starts the new installer after this process exits.
    app.restart();
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[tauri::command]
pub async fn update_install(_app: AppHandle) -> Result<(), String> {
    Err("in-app update not supported on mobile".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_read_like_a_title() {
        assert_eq!(version_label("3.2.0"), "Beta 3.2");
        assert_eq!(version_label("3.2.1"), "Beta 3.2.1");
        assert_eq!(version_label("3.10.0-rc.1"), "Beta 3.10");
        assert_eq!(version_label("4.0.0+build.5"), "Beta 4.0");
    }

    #[test]
    fn version_comes_from_the_tauri_config() {
        let conf = include_str!("../tauri.conf.json");
        let v = version_from_conf(conf).expect("version in tauri.conf.json");
        assert_eq!(v, env!("CARGO_PKG_VERSION"), "tauri.conf.json and Cargo.toml disagree — run scripts/version.mjs");
        assert_eq!(version_from_conf("{\"version\":\"1.2.3\"}").as_deref(), Some("1.2.3"));
        assert_eq!(version_from_conf("not json"), None);
    }

    #[test]
    fn long_commit_subjects_are_cut_on_a_character() {
        let s = "Ж".repeat(300);
        let out = short(&s, 180);
        assert_eq!(out.chars().count(), 180);
        assert!(out.ends_with('…'));
        assert_eq!(short(" ok ", 10), "ok");
    }
}
