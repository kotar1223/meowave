//! Signing in through the user's own browser.
//!
//! Round 6: "make the sign-in happen in my browser". A Chromium-family
//! browser installed on the machine (the default one when it is Chromium
//! based; Edge ships with every Windows) is started with a profile of its
//! own and a DevTools port on 127.0.0.1. The user signs in on the service's
//! real page, in a real browser — Google does not decline it as an embedded
//! one — and Meowave reads that profile's cookie jar over the DevTools
//! protocol until the session cookie appears, then closes the browser.
//!
//! The DevTools connection is browser-level only: no page is attached, so
//! nothing on the page can tell the browser is being watched. Only the
//! session credential leaves the jar; the profile stays on disk (signing
//! out deletes it), so the next sign-in remembers the account.

use serde_json::{json, Value};
use std::io::{self, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::time::{Duration, Instant};

/// A browser found on this machine.
pub struct Browser {
    pub name: &'static str,
    pub exe: PathBuf,
}

/// Executable file name → product name, Chromium family only: these all
/// take `--user-data-dir` and `--remote-debugging-port`.
const CHROMIUMS: &[(&str, &str)] = &[
    ("chrome", "Google Chrome"),
    ("msedge", "Microsoft Edge"),
    ("brave", "Brave"),
    ("browser", "Yandex Browser"),
    ("vivaldi", "Vivaldi"),
    ("chromium", "Chromium"),
    ("chromium-browser", "Chromium"),
    ("google-chrome", "Google Chrome"),
    ("google-chrome-stable", "Google Chrome"),
    ("brave-browser", "Brave"),
    ("microsoft-edge", "Microsoft Edge"),
    ("microsoft-edge-stable", "Microsoft Edge"),
    ("yandex-browser", "Yandex Browser"),
    ("yandex-browser-stable", "Yandex Browser"),
    ("vivaldi-stable", "Vivaldi"),
    ("google chrome", "Google Chrome"),
    ("microsoft edge", "Microsoft Edge"),
    ("brave browser", "Brave"),
];

fn chromium_name(exe: &Path) -> Option<&'static str> {
    let stem = exe.file_stem()?.to_string_lossy().to_ascii_lowercase();
    CHROMIUMS.iter().find(|(s, _)| *s == stem).map(|(_, n)| *n)
}

fn usable(exe: PathBuf) -> Option<Browser> {
    if !exe.is_file() {
        return None;
    }
    // A snap's private /tmp and home rules hide the DevTools port file.
    if exe.canonicalize().map(|p| p.starts_with("/snap/")).unwrap_or(false) {
        return None;
    }
    Some(Browser { name: chromium_name(&exe)?, exe })
}

/// The browser to sign in with, if there is one.
pub fn find() -> Option<Browser> {
    default_browser().and_then(usable).or_else(|| candidates().into_iter().find_map(usable))
}

/// The executable registered for https links, if it is a Chromium.
#[cfg(target_os = "windows")]
fn default_browser() -> Option<PathBuf> {
    let choice = reg_query(&[
        "query",
        r"HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\https\UserChoice",
        "/v",
        "ProgId",
    ])?;
    let prog = reg_data(&choice)?;
    let cmd = reg_query(&["query", &format!(r"HKCR\{prog}\shell\open\command"), "/ve"])?;
    let line = reg_data(&cmd)?;
    let exe = command_exe(&line)?;
    chromium_name(&exe).map(|_| exe)
}

#[cfg(target_os = "linux")]
fn default_browser() -> Option<PathBuf> {
    let out = Command::new("xdg-settings").args(["get", "default-web-browser"]).output().ok()?;
    let id = String::from_utf8_lossy(&out.stdout).trim().trim_end_matches(".desktop").to_ascii_lowercase();
    let id = id.rsplit('.').next().unwrap_or(&id).to_string();
    CHROMIUMS.iter().find(|(s, _)| *s == id).and_then(|(s, _)| which(s))
}

#[cfg(not(any(target_os = "windows", target_os = "linux")))]
fn default_browser() -> Option<PathBuf> {
    None
}

#[cfg(target_os = "windows")]
fn candidates() -> Vec<PathBuf> {
    let env = |k: &str| std::env::var_os(k).map(PathBuf::from);
    let (pf, pf86, local) = (env("ProgramFiles"), env("ProgramFiles(x86)"), env("LOCALAPPDATA"));
    let mut out = Vec::new();
    let mut add = |base: &Option<PathBuf>, rel: &str| {
        if let Some(b) = base {
            out.push(b.join(rel));
        }
    };
    add(&pf, r"Google\Chrome\Application\chrome.exe");
    add(&pf86, r"Google\Chrome\Application\chrome.exe");
    add(&local, r"Google\Chrome\Application\chrome.exe");
    add(&pf86, r"Microsoft\Edge\Application\msedge.exe");
    add(&pf, r"Microsoft\Edge\Application\msedge.exe");
    add(&pf, r"BraveSoftware\Brave-Browser\Application\brave.exe");
    add(&local, r"BraveSoftware\Brave-Browser\Application\brave.exe");
    add(&local, r"Yandex\YandexBrowser\Application\browser.exe");
    add(&local, r"Vivaldi\Application\vivaldi.exe");
    add(&local, r"Chromium\Application\chrome.exe");
    out
}

#[cfg(target_os = "macos")]
fn candidates() -> Vec<PathBuf> {
    let apps = ["Google Chrome", "Microsoft Edge", "Brave Browser", "Yandex", "Vivaldi", "Chromium"];
    let mut roots = vec![PathBuf::from("/Applications")];
    if let Some(h) = std::env::var_os("HOME") {
        roots.push(PathBuf::from(h).join("Applications"));
    }
    let mut out = Vec::new();
    for r in &roots {
        for a in apps {
            out.push(r.join(format!("{a}.app")).join("Contents").join("MacOS").join(a));
        }
    }
    out
}

#[cfg(target_os = "linux")]
fn candidates() -> Vec<PathBuf> {
    [
        "google-chrome-stable",
        "google-chrome",
        "chromium",
        "chromium-browser",
        "microsoft-edge-stable",
        "microsoft-edge",
        "brave-browser",
        "yandex-browser-stable",
        "yandex-browser",
        "vivaldi-stable",
    ]
    .iter()
    .filter_map(|n| which(n))
    .collect()
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn candidates() -> Vec<PathBuf> {
    Vec::new()
}

#[cfg(target_os = "linux")]
fn which(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path).map(|d| d.join(name)).find(|p| p.is_file())
}

#[cfg(target_os = "windows")]
fn reg_query(args: &[&str]) -> Option<String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let out = Command::new("reg").args(args).creation_flags(CREATE_NO_WINDOW).output().ok()?;
    out.status.success().then(|| String::from_utf8_lossy(&out.stdout).into_owned())
}

/// The data of the one value in `reg query` output:
/// `    ProgId    REG_SZ    ChromeHTML`. The value name is localised for
/// the default value, so the line is split at its type instead.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn reg_data(out: &str) -> Option<String> {
    out.lines().find_map(|l| {
        let (_, rest) = l.split_once(" REG_EXPAND_SZ ").or_else(|| l.split_once(" REG_SZ "))?;
        Some(rest.trim().to_string()).filter(|s| !s.is_empty())
    })
}

/// The program of a shell command line: `"C:\…\chrome.exe" --single-argument %1`.
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn command_exe(line: &str) -> Option<PathBuf> {
    let line = line.trim();
    let exe = if let Some(rest) = line.strip_prefix('"') {
        rest.split('"').next()?
    } else {
        let low = line.to_ascii_lowercase();
        match low.find(".exe") {
            Some(i) => &line[..i + 4],
            None => line.split_whitespace().next()?,
        }
    };
    Some(PathBuf::from(exe)).filter(|p| !p.as_os_str().is_empty())
}

/// A browser started for one sign-in.
pub struct Session {
    /// None when an instance left on this profile by an earlier sign-in
    /// was reused.
    child: Option<Child>,
    ws: Ws,
    next_id: u64,
}

/// Starts `b` on `url` with the profile in `dir` and connects to it.
pub fn launch(b: &Browser, dir: &Path, url: &str) -> Result<Session, String> {
    start(b, dir, url, &["--no-first-run", "--no-default-browser-check", "--new-window"])
}

fn start(b: &Browser, dir: &Path, url: &str, extra: &[&str]) -> Result<Session, String> {
    std::fs::create_dir_all(dir).map_err(|e| format!("browser profile: {e}"))?;
    let port_file = dir.join("DevToolsActivePort");
    // Still running from an earlier sign-in: a second start would hand the
    // URL to it and exit, so the page opens there instead.
    if let Some((port, path)) = read_port(&port_file) {
        if let Ok(ws) = Ws::connect(port, &path) {
            let mut s = Session { child: None, ws, next_id: 1 };
            if s.call("Target.createTarget", json!({ "url": url, "newWindow": true })).is_ok() {
                return Ok(s);
            }
        }
    }
    let _ = std::fs::remove_file(&port_file);
    let mut child = Command::new(&b.exe)
        .arg(format!("--user-data-dir={}", dir.display()))
        .arg("--remote-debugging-port=0")
        .args(extra)
        .arg(url)
        .spawn()
        .map_err(|e| format!("could not start {}: {e}", b.name))?;
    // The browser writes the port it picked once DevTools listens.
    let t0 = Instant::now();
    let (port, path) = loop {
        if let Some(found) = read_port(&port_file) {
            break found;
        }
        if let Ok(Some(st)) = child.try_wait() {
            // An instance already running on this profile takes the URL
            // and exits; it has no DevTools port.
            return Err(format!("{} exited ({st})", b.name));
        }
        if t0.elapsed() > Duration::from_secs(25) {
            let _ = child.kill();
            return Err(format!("{} did not open DevTools", b.name));
        }
        std::thread::sleep(Duration::from_millis(150));
    };
    let ws = match Ws::connect(port, &path) {
        Ok(ws) => ws,
        Err(e) => {
            let _ = child.kill();
            return Err(format!("DevTools: {e}"));
        }
    };
    Ok(Session { child: Some(child), ws, next_id: 1 })
}

/// `DevToolsActivePort`: the port, then the browser endpoint's path.
fn read_port(file: &Path) -> Option<(u16, String)> {
    let txt = std::fs::read_to_string(file).ok()?;
    let mut l = txt.lines();
    let port = l.next()?.trim().parse::<u16>().ok()?;
    let path = l.next()?.trim().to_string();
    path.starts_with('/').then_some((port, path))
}

impl Session {
    pub fn call(&mut self, method: &str, params: Value) -> io::Result<Value> {
        let id = self.next_id;
        self.next_id += 1;
        self.ws.call(id, method, params)
    }

    /// Every cookie of the profile as (name, value, domain).
    pub fn cookies(&mut self) -> io::Result<Vec<(String, String, String)>> {
        let v = self.call("Storage.getCookies", json!({}))?;
        if let Some(e) = v.get("error") {
            return Err(io::Error::other(e.to_string()));
        }
        let s = |c: &Value, k: &str| c.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        Ok(v.pointer("/result/cookies")
            .and_then(|c| c.as_array())
            .map(|a| a.iter().map(|c| (s(c, "name"), s(c, "value"), s(c, "domain"))).collect())
            .unwrap_or_default())
    }

    /// Whether any browser window still shows a page: closing the last
    /// one leaves Edge running in the background, DevTools and all.
    pub fn has_pages(&mut self) -> io::Result<bool> {
        let v = self.call("Target.getTargets", json!({}))?;
        Ok(v.pointer("/result/targetInfos")
            .and_then(|t| t.as_array())
            .map(|a| a.iter().any(|t| t.get("type").and_then(|x| x.as_str()) == Some("page")))
            .unwrap_or(true))
    }

    /// Closes the browser: politely, then for sure.
    pub fn close(mut self) {
        let _ = self.call("Browser.close", json!({}));
        let Some(mut child) = self.child.take() else { return };
        for _ in 0..30 {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        let _ = child.kill();
        let _ = child.wait();
    }
}

/// Whether a cookie set for `domain` is sent to `host`.
pub fn domain_matches(domain: &str, host: &str) -> bool {
    let d = domain.trim_start_matches('.').to_ascii_lowercase();
    let h = host.to_ascii_lowercase();
    !d.is_empty() && (h == d || h.ends_with(&format!(".{d}")))
}

/* ─────────────── a minimal WebSocket client for DevTools ───────────────
   Text frames, client-masked, fragmented answers joined; ping answered.
   That is all the DevTools endpoint needs, and it spares a dependency. */

pub struct Ws {
    s: TcpStream,
}

impl Ws {
    pub fn connect(port: u16, path: &str) -> io::Result<Ws> {
        use base64::Engine;
        let mut s = TcpStream::connect(("127.0.0.1", port))?;
        s.set_read_timeout(Some(Duration::from_secs(20)))?;
        s.set_nodelay(true)?;
        let key = base64::engine::general_purpose::STANDARD.encode(rand::random::<[u8; 16]>());
        // No Origin header: DevTools only checks --remote-allow-origins
        // against requests that carry one.
        write!(
            s,
            "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
        )?;
        let mut head = Vec::new();
        let mut b = [0u8; 1];
        while !head.ends_with(b"\r\n\r\n") {
            if s.read(&mut b)? == 0 {
                return Err(io::ErrorKind::UnexpectedEof.into());
            }
            head.push(b[0]);
            if head.len() > 16 * 1024 {
                return Err(io::Error::other("handshake too long"));
            }
        }
        let status = String::from_utf8_lossy(&head).lines().next().unwrap_or("").to_string();
        if !status.contains(" 101 ") {
            return Err(io::Error::other(format!("handshake: {status}")));
        }
        Ok(Ws { s })
    }

    fn frame(&mut self, op: u8, p: &[u8]) -> io::Result<()> {
        let mut f = Vec::with_capacity(p.len() + 14);
        f.push(0x80 | op);
        let n = p.len();
        if n < 126 {
            f.push(0x80 | n as u8);
        } else if n < 65536 {
            f.push(0x80 | 126);
            f.extend_from_slice(&(n as u16).to_be_bytes());
        } else {
            f.push(0x80 | 127);
            f.extend_from_slice(&(n as u64).to_be_bytes());
        }
        let mask: [u8; 4] = rand::random();
        f.extend_from_slice(&mask);
        f.extend(p.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]));
        self.s.write_all(&f)
    }

    pub fn send(&mut self, text: &str) -> io::Result<()> {
        self.frame(0x1, text.as_bytes())
    }

    /// The next whole message.
    pub fn recv(&mut self) -> io::Result<String> {
        let mut msg = Vec::new();
        loop {
            let mut h = [0u8; 2];
            self.s.read_exact(&mut h)?;
            let (fin, op, masked) = (h[0] & 0x80 != 0, h[0] & 0x0f, h[1] & 0x80 != 0);
            let mut n = u64::from(h[1] & 0x7f);
            if n == 126 {
                let mut b = [0u8; 2];
                self.s.read_exact(&mut b)?;
                n = u64::from(u16::from_be_bytes(b));
            } else if n == 127 {
                let mut b = [0u8; 8];
                self.s.read_exact(&mut b)?;
                n = u64::from_be_bytes(b);
            }
            if n > 64 << 20 {
                return Err(io::Error::other("frame too large"));
            }
            let mut mask = [0u8; 4];
            if masked {
                self.s.read_exact(&mut mask)?;
            }
            let mut p = vec![0u8; n as usize];
            self.s.read_exact(&mut p)?;
            if masked {
                p.iter_mut().enumerate().for_each(|(i, b)| *b ^= mask[i % 4]);
            }
            match op {
                0x8 => return Err(io::ErrorKind::ConnectionAborted.into()),
                0x9 => self.frame(0xA, &p)?,
                0x0..=0x2 => {
                    msg.extend_from_slice(&p);
                    if fin {
                        return Ok(String::from_utf8_lossy(&msg).into_owned());
                    }
                }
                _ => {}
            }
        }
    }

    /// Sends one command and waits for its answer; events are skipped.
    pub fn call(&mut self, id: u64, method: &str, params: Value) -> io::Result<Value> {
        self.send(&json!({ "id": id, "method": method, "params": params }).to_string())?;
        loop {
            let v: Value = serde_json::from_str(&self.recv()?).unwrap_or(Value::Null);
            if v.get("id").and_then(|x| x.as_u64()) == Some(id) {
                return Ok(v);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_output() {
        let out = "\r\nHKEY_CURRENT_USER\\Software\\...\\UserChoice\r\n    ProgId    REG_SZ    ChromeHTML\r\n\r\n";
        assert_eq!(reg_data(out).as_deref(), Some("ChromeHTML"));
        let out = "\r\nHKEY_CLASSES_ROOT\\MSEdgeHTM\\shell\\open\\command\r\n    (По умолчанию)    REG_SZ    \"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\" --single-argument %1\r\n";
        let line = reg_data(out).unwrap();
        assert_eq!(command_exe(&line).unwrap(), PathBuf::from("C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"));
        assert_eq!(command_exe("C:\\Apps\\Yandex\\browser.exe -- %1").unwrap(), PathBuf::from("C:\\Apps\\Yandex\\browser.exe"));
    }

    #[test]
    fn chromium_family() {
        assert_eq!(chromium_name(Path::new("/x/msedge.exe")), Some("Microsoft Edge"));
        assert_eq!(chromium_name(Path::new("/usr/bin/chromium")), Some("Chromium"));
        assert_eq!(chromium_name(Path::new("/x/firefox.exe")), None);
        assert_eq!(chromium_name(Path::new("/x/launcher.exe")), None);
    }

    #[test]
    fn cookie_domains() {
        assert!(domain_matches(".youtube.com", "music.youtube.com"));
        assert!(domain_matches("music.youtube.com", "music.youtube.com"));
        assert!(!domain_matches(".google.com", "music.youtube.com"));
        assert!(!domain_matches("tube.com", "music.youtube.com"));
        assert!(domain_matches(".deezer.com", "www.deezer.com"));
    }

    /// A real Chromium end to end: launch, set a cookie through DevTools,
    /// read it back, close. `MW_CHROMIUM=/path/to/chromium cargo test
    /// real_chromium -- --ignored` (headless, so it runs without a display).
    #[test]
    #[ignore]
    fn real_chromium() {
        let exe = PathBuf::from(std::env::var("MW_CHROMIUM").unwrap_or_else(|_| "/usr/local/bin/chromium".into()));
        let b = Browser { name: "Chromium", exe };
        let dir = std::env::temp_dir().join(format!("mw-cdp-{}", std::process::id()));
        let mut s = start(&b, &dir, "about:blank", &["--headless=new", "--no-sandbox"]).expect("launch");
        let set = s
            .call(
                "Storage.setCookies",
                json!({ "cookies": [{ "name": "oauth_token", "value": "2-123456-abcdefabcdef", "domain": ".soundcloud.com", "path": "/", "secure": true }] }),
            )
            .unwrap();
        assert!(set.get("error").is_none(), "{set}");
        let jar = s.cookies().unwrap();
        let pairs: Vec<(String, String)> = jar
            .iter()
            .filter(|(_, _, d)| domain_matches(d, "soundcloud.com"))
            .map(|(n, v, _)| (n.clone(), v.clone()))
            .collect();
        assert_eq!(pairs, vec![("oauth_token".to_string(), "2-123456-abcdefabcdef".to_string())]);
        s.close();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
