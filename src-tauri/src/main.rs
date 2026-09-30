// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod config;
mod discord;
mod local;
mod lyrics;
mod mem;
mod proxy;
mod paths;
mod spotify;
mod stream;
mod tokens;
mod update;
mod ymlib;
mod ytm;

use std::sync::OnceLock;

use tauri::{Emitter, Manager, WindowEvent};

/// Port of the local audio proxy; the frontend asks for it via `stream_info`.
static STREAM_PORT: OnceLock<u16> = OnceLock::new();

/// Where the frontend must send audio requests, and the token it has to carry.
///
/// The port alone used to be enough, which made the proxy an unauthenticated
/// local service; see the comment at the top of stream.rs.
#[derive(serde::Serialize)]
pub struct StreamInfo {
    pub port: u16,
    pub token: String,
}

#[tauri::command]
fn stream_info() -> Result<StreamInfo, String> {
    let port = STREAM_PORT
        .get()
        .copied()
        .ok_or_else(|| "the audio proxy failed to start".to_string())?;
    Ok(StreamInfo {
        port,
        token: stream::token().to_string(),
    })
}

/// Kept for the download command, which builds its own proxy URL in Rust.
pub(crate) fn stream_port_value() -> Option<u16> {
    STREAM_PORT.get().copied()
}

/// `meowave --probe <query>` — hits the services from the command line and
/// prints what came back. Lets us test search and stream resolution without
/// launching the whole UI.
fn probe(query: &str) {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("runtime");

    rt.block_on(async {
        match api::sc_client_id().await {
            Ok(id) => println!("soundcloud client_id: {}…", &id[..8.min(id.len())]),
            Err(e) => println!("soundcloud client_id FAILED: {e}"),
        }

        for service in ["sc", "ytm", "ym"] {
            let token = tokens::read_token(service).ok().flatten().unwrap_or_default();
            if service == "ym" && token.is_empty() {
                println!("\n[ym] skipped: no token in keychain");
                continue;
            }
            let found = match service {
                "sc" => api::sc_search(&token, query).await,
                "ytm" => api::ytm_search(query).await,
                _ => api::ym_search(&token, query).await,
            };
            match found {
                Err(e) => println!("\n[{service}] search FAILED: {e}"),
                Ok(tracks) => {
                    println!("\n[{service}] {} tracks", tracks.len());
                    for t in tracks.iter().take(3) {
                        println!("   {} — {} ({}s) id={}", t.a, t.t, t.d, t.id);
                    }
                    if let Some(first) = tracks.first() {
                        let url = match service {
                            "sc" => api::sc_stream_url(&token, &first.id).await,
                            "ytm" => ytm::stream(&first.id, true, "best").await.map(|p| {
                                println!("   format: {} @ {} bps", p.mime, p.bitrate);
                                p.url
                            }),
                            _ => api::ym_stream_url(&token, &first.id, true).await,
                        };
                        match url {
                            Ok(u) => println!("   stream OK: {}…", &u[..60.min(u.len())]),
                            Err(e) => println!("   stream FAILED: {e}"),
                        }
                        probe_proxy(service, &first.id).await;
                    }
                }
            }
        }
    });
}

/// Fetches the first bytes through our own proxy — the exact path <audio>
/// takes — so a working upstream that the proxy mangles can't hide.
async fn probe_proxy(service: &str, id: &str) {
    let Some(port) = STREAM_PORT.get().copied() else {
        println!("   proxy: not running");
        return;
    };
    let url = format!(
        "http://127.0.0.1:{port}/stream/{service}/{id}?k={}&hq=1",
        stream::token()
    );
    let req = reqwest::Client::new()
        .get(&url)
        .header("Range", "bytes=0-65535")
        .send()
        .await;
    match req {
        Err(e) => println!("   proxy FAILED: {e}"),
        Ok(r) => {
            let status = r.status();
            let ctype = r
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("?")
                .to_string();
            let range = r
                .headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("-")
                .to_string();
            match r.bytes().await {
                Ok(b) if status.is_success() => println!(
                    "   proxy OK: {} {} {} bytes, range {range}",
                    status.as_u16(),
                    ctype,
                    b.len()
                ),
                Ok(b) => println!(
                    "   proxy FAILED: {} {}",
                    status.as_u16(),
                    String::from_utf8_lossy(&b[..200.min(b.len())])
                ),
                Err(e) => println!("   proxy body FAILED: {e}"),
            }
        }
    }
}

/// Chromium command-line switches for the embedded WebView2.
///
/// WebView2 is Chromium, and Chromium sizes its caches for a browser holding
/// many tabs on a machine doing nothing else. This is a music player with one
/// document, so those defaults are pure overhead:
///
/// - the GPU program and shader caches keep every pipeline ever compiled,
///   which for a page with a handful of effects is megabytes of dead entries;
/// - the tile manager pre-allocates enough texture memory to scroll a large
///   page instantly, sized from total VRAM rather than from what is on screen;
/// - the renderer keeps decoded images alive long after they leave the
///   viewport, and album art is exactly that — large, and mostly scrolled past.
///
/// None of this changes what is drawn, only how much is kept around for a
/// hypothetical next frame that a single-page app never has.
/// PCI address of the first Intel graphics adapter, in sysfs form
/// ("0000:00:02.0"). None when the machine has no Intel iGPU.
#[cfg(target_os = "linux")]
fn intel_gpu_pci() -> Option<String> {
    let drm = std::path::Path::new("/sys/class/drm");
    let mut cards: Vec<_> = std::fs::read_dir(drm).ok()?.filter_map(|e| e.ok())
        .filter(|e| e.file_name().to_string_lossy().starts_with("card"))
        .filter(|e| !e.file_name().to_string_lossy().contains('-'))
        .collect();
    cards.sort_by_key(|e| e.file_name());
    for card in cards {
        let dev = card.path().join("device");
        let uevent = std::fs::read_to_string(dev.join("uevent")).ok()?;
        let is_intel = uevent.lines().any(|l| {
            let l = l.trim();
            (l.starts_with("DRIVER=") && (l == "DRIVER=i915" || l == "DRIVER=xe"))
                || (l.starts_with("PCI_ID=8086:"))
        });
        if !is_intel {
            continue;
        }
        // device is a symlink into /sys/devices/pci.../0000:00:02.0
        let link = std::fs::read_link(&dev).ok()?;
        let addr = link.file_name()?.to_string_lossy().to_string();
        if addr.split(':').count() == 2 {
            return Some(addr);
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn webview_args() -> String {
    // Diagnostic mode: all Chromium flags off to isolate the gray-square issue.
    if std::env::var_os("MEOWAVE_NO_WEBVIEW_ARGS").is_some() {
        return String::new();
    }
    let mut args: Vec<String> = vec![
        // Cap the tile pool instead of letting it scale with VRAM.
        "--force-gpu-mem-available-mb=256".into(),
        // Same limit for the compositor's own working set.
        "--gpu-rasterization-msaa-sample-count=0".into(),
        // One renderer for one document; process-per-site buys isolation we
        // do not need here and costs a full process each time.
        "--renderer-process-limit=2".into(),
        // Chromium keeps decoded frames cached per-image; the default budget
        // assumes a photo gallery.
        "--disable-features=CalculateNativeWinOcclusion,MediaFoundationClearPlayback".into(),
        // The page has no <video> and no plugins; these subsystems otherwise
        // initialise and hold buffers regardless.
        "--disable-background-timer-throttling".into(),
        // Release memory back to the OS when it falls idle rather than holding
        // the high-water mark for the life of the process.
        "--enable-features=MemoryPressureBasedSourceBufferGC".into(),
    ];
    // CDP endpoint for debugging the embedded webview: MEOWAVE_DEBUG_PORT=9222.
    if let Some(port) = std::env::var_os("MEOWAVE_DEBUG_PORT") {
        args.push(format!("--remote-debugging-port={}", port.to_string_lossy()));
    }
    args.join(" ")
}

fn main() {
    // Must be set before the webview is created; WebView2 reads it once at
    // environment creation and ignores later changes. The variable is a
    // WebView2 (Windows) knob and is simply ignored elsewhere.
    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", webview_args());

    config::load_env();
    // Must run before any request is made: client() reads this cached config.
    // A missing or corrupt file means "off", never a startup failure.
    proxy::load();

    // Linux: WebKitGTK's native Wayland path drops whole compositor layers on
    // several compositors (niri in particular) — SVG icons, canvases and
    // backdrop-filter panels render black while plain text survives, and the
    // DMABUF / compositing env switches do not reliably fix it. The X11 path
    // through XWayland renders the same page perfectly, so prefer it whenever
    // an X server is reachable. Override with MEOWAVE_WAYLAND=1; unset on
    // systems with no DISPLAY at all, which then keep native Wayland.
    #[cfg(target_os = "linux")]
    let forced_x11 = std::env::var_os("MEOWAVE_WAYLAND").is_none()
        && std::env::var_os("GDK_BACKEND").is_none()
        && std::env::var_os("DISPLAY").is_some();
    #[cfg(target_os = "linux")]
    if forced_x11 {
        std::env::set_var("GDK_BACKEND", "x11");
    }
    // On the native Wayland path the DMABUF renderer glitches on several
    // drivers (black layers, software-render fallback). On X11/GLX it is the
    // *accelerated* path and disabling it drags every canvas frame through
    // the CPU — the "particles are a slideshow" report — so it is only turned
    // off where it is actually broken.
    #[cfg(target_os = "linux")]
    if !forced_x11 && std::env::var_os("MEOWAVE_KEEP_DMABUF").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    // Hybrid-graphic laptops: the discrete NVIDIA chip under the open nouveau
    // driver has no usable GL acceleration on modern cards, so every canvas
    // frame is rasterised on the CPU and the particle field becomes a
    // slideshow. When an Intel iGPU is present, steer Mesa to it explicitly.
    // A user-provided DRI_PRIME always wins; no Intel, no change.
    #[cfg(target_os = "linux")]
    if std::env::var_os("DRI_PRIME").is_none() {
        if let Some(pci) = intel_gpu_pci() {
            std::env::set_var("DRI_PRIME", format!("pci-{}", pci.replace([':', '.'], "_")));
        }
    }

    let args: Vec<String> = std::env::args().collect();

    // `meowave --serve` keeps only the proxy alive, so the exact requests the
    // webview makes (CORS preflight, ranged GET) can be replayed by hand.
    if args.iter().any(|a| a == "--serve") {
        match stream::spawn() {
            Ok(port) => {
                let _ = STREAM_PORT.set(port);
                println!("stream proxy on 127.0.0.1:{port}");
                // The token is per-process and random, so a request cannot be
                // replayed by hand without it. This mode exists only for that.
                println!("token {}", stream::token());
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(3600));
                }
            }
            Err(e) => {
                eprintln!("stream proxy failed: {e}");
                return;
            }
        }
    }

    if let Some(pos) = args.iter().position(|a| a == "--probe") {
        let query = args.get(pos + 1).map(|s| s.as_str()).unwrap_or("daft punk");
        match stream::spawn() {
            Ok(port) => {
                let _ = STREAM_PORT.set(port);
                println!("stream proxy on 127.0.0.1:{port}\n");
            }
            Err(e) => println!("stream proxy failed: {e}\n"),
        }
        probe(query);
        return;
    }

    match stream::spawn() {
        Ok(port) => {
            let _ = STREAM_PORT.set(port);
            println!("meowave: stream proxy on 127.0.0.1:{port}");
        }
        Err(e) => eprintln!("meowave: stream proxy failed: {e}"),
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            config::get_supabase_config,
            tokens::set_service_token,
            tokens::get_service_token,
            tokens::delete_service_token,
            tokens::list_connected_services,
            api::api_search,
            api::api_check_token,
            api::api_probe_service,
            paths::store_read,
            paths::store_write,
            paths::store_delete,
            paths::data_dir,
            paths::cache_size,
            mem::mem_info,
            paths::cache_clear,
            proxy::proxy_get,
            proxy::proxy_set,
            proxy::proxy_test,
            proxy::proxy_detect,
            proxy::proxy_routes,
            update::update_check,
            update::update_install,
            local::open_external,
            local::has_ffmpeg,
            local::local_add,
            local::local_scan,
            local::local_rehydrate,
            local::download_track,
            local::download_processed,
            lyrics::lyrics_get,
            lyrics::lyrics_search_genius,
            spotify::spotify_login,
            spotify::spotify_logout,
            spotify::spotify_me,
            spotify::spotify_available,
            spotify::spotify_playlists,
            spotify::spotify_playlist_tracks,
            ymlib::ym_available,
            ymlib::ym_login_start,
            ymlib::ym_finish,
            ymlib::ym_playlists,
            ymlib::ym_playlist_tracks,
            ymlib::ym_liked_tracks,
            discord::discord_available,
            discord::discord_configure,
            discord::discord_update,
            discord::discord_clear,
            stream_info,
        ])
        // Only a minimised window stops rendering. Tying this to focus was a
        // mistake: the window is still fully on screen when the user clicks
        // another app, and freezing the field turned the wave into a black
        // rectangle the moment Meowave lost focus. Focus alone just lowers the
        // frame budget.
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(focused) => {
                let _ = window.emit("meowave://focus", *focused);
                let visible = !window.is_minimized().unwrap_or(false);
                let _ = window.emit("meowave://render", visible);
            }
            WindowEvent::Resized(_) => {
                let minimised = window.is_minimized().unwrap_or(false);
                let _ = window.emit("meowave://render", !minimised);
            }
            _ => {}
        })
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.emit("meowave://render", true);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod local_tests {
    use super::local;

    /// The filename parser is the only metadata source, so it has to survive
    /// the shapes real music folders actually contain.
    #[test]
    fn parses_names() {
        let dir = std::env::temp_dir().join("meowave_local_test");
        std::fs::create_dir_all(&dir).unwrap();
        let cases = [
            ("Daft Punk - One More Time.mp3", "Daft Punk", "One More Time"),
            ("07 - Radiohead - Creep.flac", "Radiohead", "Creep"),
            ("03. Boards of Canada - Roygbiv.ogg", "Boards of Canada", "Roygbiv"),
            ("JustATitle.wav", "—", "JustATitle"),
        ];
        for (name, want_a, want_t) in cases {
            let p = dir.join(name);
            std::fs::write(&p, b"x").unwrap();
            let got = local::local_add(vec![p.to_string_lossy().to_string()]);
            assert_eq!(got.len(), 1, "{name} was not accepted");
            assert_eq!(got[0].a, want_a, "artist for {name}");
            assert_eq!(got[0].t, want_t, "title for {name}");
            assert_eq!(got[0].s, "local");
            assert_eq!(got[0].mode, "local");
        }
        // A non-audio file must be ignored rather than added as a silent track.
        let junk = dir.join("cover.jpg");
        std::fs::write(&junk, b"x").unwrap();
        assert!(local::local_add(vec![junk.to_string_lossy().to_string()]).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Ids must be stable across runs, otherwise saved local tracks stop
    /// resolving after a restart.
    #[test]
    fn ids_are_stable_and_resolvable() {
        let dir = std::env::temp_dir().join("meowave_local_id");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("A - B.mp3");
        std::fs::write(&p, b"data").unwrap();
        let s = p.to_string_lossy().to_string();
        let first = local::local_add(vec![s.clone()]);
        let second = local::local_add(vec![s.clone()]);
        assert_eq!(first[0].id, second[0].id);
        assert_eq!(local::path_of(&first[0].id).unwrap(), p);
        assert_eq!(local::local_rehydrate(vec![s]), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// The local proxy path must honour Range, or seeking in a long FLAC would
    /// pull the whole file every time.
    #[test]
    fn local_stream_serves_ranges() {
        let dir = std::env::temp_dir().join("meowave_local_range");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("X - Y.wav");
        let body: Vec<u8> = (0..4096u32).map(|i| (i % 251) as u8).collect();
        std::fs::write(&p, &body).unwrap();
        let tr = local::local_add(vec![p.to_string_lossy().to_string()]);
        let id = tr[0].id.clone();

        let port = crate::stream::spawn().expect("proxy");
        std::thread::sleep(std::time::Duration::from_millis(250));
        let base = format!(
            "http://127.0.0.1:{port}/stream/local/{id}?k={}",
            crate::stream::token()
        );

        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let c = reqwest::Client::new();

            let full = c.get(&base).send().await.unwrap();
            assert_eq!(full.status().as_u16(), 200);
            assert_eq!(full.headers().get("access-control-allow-origin").unwrap(), "*");
            assert_eq!(full.bytes().await.unwrap().len(), body.len());

            let part = c.get(&base).header("Range", "bytes=100-199").send().await.unwrap();
            assert_eq!(part.status().as_u16(), 206);
            assert_eq!(
                part.headers().get("content-range").unwrap().to_str().unwrap(),
                format!("bytes 100-199/{}", body.len())
            );
            let got = part.bytes().await.unwrap();
            assert_eq!(got.len(), 100);
            assert_eq!(&got[..], &body[100..200], "wrong slice returned");

            // The suffix form used to return the first 501 bytes.
            let tail = c.get(&base).header("Range", "bytes=-500").send().await.unwrap();
            assert_eq!(tail.status().as_u16(), 206);
            let tail_body = tail.bytes().await.unwrap();
            assert_eq!(&tail_body[..], &body[body.len() - 500..]);

            // HEAD must not carry a body.
            let head = c
                .head(&base)
                .send()
                .await
                .unwrap();
            assert_eq!(head.status().as_u16(), 200);
            assert!(head.bytes().await.unwrap().is_empty());
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Anything on the machine can reach the proxy's port, so the token and the
    /// Host check are the only things standing between a random web page and the
    /// user's local files. Both are asserted here because both have to hold.
    #[test]
    fn local_stream_requires_a_token() {
        let dir = std::env::temp_dir().join("meowave_local_auth");
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("A - Secret.wav");
        std::fs::write(&p, vec![7u8; 512]).unwrap();
        let id = local::local_add(vec![p.to_string_lossy().to_string()])[0].id.clone();

        let port = crate::stream::spawn().expect("proxy");
        std::thread::sleep(std::time::Duration::from_millis(250));

        let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        rt.block_on(async {
            let c = reqwest::Client::new();
            let bare = format!("http://127.0.0.1:{port}/stream/local/{id}");

            // No token at all.
            let anon = c.get(&bare).send().await.unwrap();
            assert_eq!(anon.status().as_u16(), 403, "an untokened request was served");
            assert!(
                anon.headers().get("access-control-allow-origin").is_none(),
                "CORS was granted to an unauthenticated caller"
            );

            // A wrong token.
            let wrong = c.get(format!("{bare}?k=deadbeef")).send().await.unwrap();
            assert_eq!(wrong.status().as_u16(), 403);

            // Right token, wrong Host: this is the DNS-rebinding case, where a
            // page's own domain resolves to 127.0.0.1.
            let rebind = c
                .get(format!("{bare}?k={}", crate::stream::token()))
                .header("Host", "music.example.com")
                .send()
                .await
                .unwrap();
            assert_eq!(rebind.status().as_u16(), 403);
        });
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// Real filenames from the user's library: downloads keep underscores and
    /// quality tags, which rendered as unreadable titles in the player bar.
    #[test]
    fn cleans_download_style_names() {
        let cases: [(&str, &str, &str); 5] = [
            ("uniivxrs__feat._Sqwore__320kbps", "—", "uniivxrs feat. Sqwore"),
            ("07 - Artist - Song Name", "Artist", "Song Name"),
            ("Artist_-_Track_Name", "Artist", "Track Name"),
            ("nyan.mp3", "—", "nyan.mp3"),
            ("Some Song (Official Video)", "—", "Some Song"),
        ];
        for (input, want_a, want_t) in cases {
            let (a, t) = super::local::parse_name_pub(input);
            assert_eq!((a.as_str(), t.as_str()), (want_a, want_t), "input: {input}");
        }
    }
}
