fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let ffmpeg_bin = std::path::Path::new("ffmpeg").join(format!("ffmpeg-{target}{ext}"));
    if !ffmpeg_bin.exists() {
        let _ = std::fs::create_dir_all("ffmpeg");
        let _ = std::fs::write(&ffmpeg_bin, b"");
    }
    // The webview's files are built by Vite (src/ + src/ts → dist/,
    // scripts/web.mjs), and tauri::generate_context! will not compile without
    // dist/. `npm run dev`, the in-app update and `tauri build` build it
    // first; this covers the rest: a fresh checkout that went straight to
    // cargo, and the one update pulled by a Meowave older than the build step
    // (it only asked `tauri dev` to rebuild). If the build cannot run here
    // either, the window gets a page that says what to run and why.
    let dist = std::path::Path::new("..").join("dist");
    println!("cargo:rerun-if-changed=../dist/index.html");
    println!("cargo:rerun-if-env-changed=MEOWAVE_NO_WEB_BUILD");
    if !dist.join("index.html").exists() {
        match build_web() {
            Ok(()) if dist.join("index.html").exists() => {
                println!("cargo:warning=dist/ was missing: built it (node scripts/web.mjs build --install).");
            }
            res => {
                let why = res.err().unwrap_or_else(|| "the build wrote no dist/index.html".into());
                let _ = std::fs::create_dir_all(&dist);
                let _ = std::fs::write(dist.join("index.html"), PLACEHOLDER.replace("{why}", &html_escape(&why)));
                println!("cargo:warning=dist/ was missing and could not be built ({}): wrote a placeholder page. Run `npm install` and `npm run web:build` for the real interface.", headline(&why));
            }
        }
    }
    tauri_build::build()
}

/// `node scripts/web.mjs build --install` from the repository root, with its
/// output in OUT_DIR (no pipes to drain) and a time limit, so a hung npm
/// cannot hang the build. Err holds the end of that output.
fn build_web() -> Result<(), String> {
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};
    if std::env::var_os("MEOWAVE_NO_WEB_BUILD").is_some() {
        return Err("MEOWAVE_NO_WEB_BUILD is set".into());
    }
    let out_dir = std::path::PathBuf::from(std::env::var_os("OUT_DIR").ok_or("no OUT_DIR")?);
    let log = out_dir.join("web-build.log");
    let file = std::fs::File::create(&log).map_err(|e| e.to_string())?;
    let file2 = file.try_clone().map_err(|e| e.to_string())?;
    let mut child = Command::new("node")
        .current_dir("..")
        .args(["scripts/web.mjs", "build", "--install"])
        .env("NO_COLOR", "1")
        .stdin(Stdio::null())
        .stdout(file)
        .stderr(file2)
        .spawn()
        .map_err(|e| format!("node: {e} — Node.js 20.19+ or 22.12+ is needed (nodejs.org)"))?;
    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() > Duration::from_secs(900) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err("node scripts/web.mjs build --install: no result in 15 minutes".into());
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(200)),
            Err(e) => return Err(e.to_string()),
        }
    };
    if status.success() {
        return Ok(());
    }
    let text = strip_ansi(&std::fs::read_to_string(&log).unwrap_or_default());
    let tail: Vec<&str> = text.lines().filter(|l| !l.trim().is_empty()).collect();
    let tail = tail[tail.len().saturating_sub(12)..].join("\n");
    Err(if tail.is_empty() { format!("node scripts/web.mjs build --install: {status}") } else { tail })
}

/// The line of the build's output that says what went wrong: web.mjs's own
/// "Meowave: …" or "[web] build failed: …" line (the last one: the English
/// line comes second), else the first error line, else the last line — not
/// Node's "Node.js v…" trailer.
fn headline(text: &str) -> &str {
    let lines: Vec<&str> = text.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with("Node.js v")).collect();
    let ours = lines.iter().rev().find(|l| l.contains("Meowave:") || l.starts_with("[web]"));
    let pick = ours.or_else(|| lines.iter().find(|l| l.contains("Error") || l.contains("error")));
    pick.or(lines.last()).copied().unwrap_or("")
}

/// Drops terminal colour codes (ESC [ … letter) that some tools print even
/// into a file.
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars().peekable();
    while let Some(c) = it.next() {
        if c == '\u{1b}' && it.peek() == Some(&'[') {
            it.next();
            for d in it.by_ref() {
                if d.is_ascii_alphabetic() {
                    break;
                }
            }
        } else {
            out.push(c);
        }
    }
    out
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;")
}

const PLACEHOLDER: &str = r#"<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>Meowave</title></head>
<body style="background:#0d0d14;color:#e8e8f0;font:16px/1.5 system-ui,sans-serif;padding:48px">
<h1 style="font-size:22px">Интерфейс не собран</h1>
<p>Закройте Meowave и выполните в папке проекта <code>npm install</code>, затем <code>npm run dev</code>.
Для сборки нужен Node.js 20.19+ или 22.12+ (nodejs.org, версия LTS).</p>
<p style="opacity:.7">The interface was not built: close Meowave and run <code>npm install</code>, then
<code>npm run dev</code> in the project folder (Node.js 20.19+ or 22.12+).</p>
<pre style="white-space:pre-wrap;font:12px/1.45 ui-monospace,monospace;opacity:.75;margin-top:24px">{why}</pre>
</body></html>
"#;
