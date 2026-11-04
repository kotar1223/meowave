mod accounts;
mod api;
mod browser;
mod config;
mod discord;
mod dz;
mod feeds;
mod fsguard;
mod links;
mod local;
mod lyrics;
mod lyrics_clean;
mod matching;
mod mem;
mod mpris;
mod paths;
mod proxy;
mod spanon;
mod spotify;
mod stream;
mod taskbar;
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
#[allow(dead_code)]
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
#[allow(dead_code)]
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
                Ok(b) if !status.is_success() => println!(
                    "   proxy FAILED: {} {}",
                    status.as_u16(),
                    String::from_utf8_lossy(&b[..200.min(b.len())])
                ),
                _ => {}
            }
        }
    }
}

/// Chromium command-line switches for the embedded WebView2.
#[cfg(target_os = "windows")]
fn webview_args() -> String {
    if std::env::var_os("MEOWAVE_NO_WEBVIEW_ARGS").is_some() {
        return String::new();
    }
    let mut args: Vec<String> = vec![
        "--force-gpu-mem-available-mb=256".into(),
        "--gpu-rasterization-msaa-sample-count=0".into(),
        "--renderer-process-limit=2".into(),
        "--disable-features=CalculateNativeWinOcclusion,MediaFoundationClearPlayback".into(),
        "--disable-background-timer-throttling".into(),
        "--enable-features=MemoryPressureBasedSourceBufferGC,HardwareMediaKeyHandling,MediaSessionService".into(),
    ];
    if let Some(port) = std::env::var_os("MEOWAVE_DEBUG_PORT") {
        args.push(format!("--remote-debugging-port={}", port.to_string_lossy()));
    }
    args.join(" ")
}

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
        /* A card with no readable `device` link is normal — a virtual card, or
           one the driver has not finished initialising. Every one of these used
           to be `?`, which returned from the whole function instead of moving on
           to the next card, so a single such entry anywhere in /sys/class/drm
           meant no GPU was ever found. */
        let Ok(uevent) = std::fs::read_to_string(dev.join("uevent")) else {
            continue;
        };
        let is_intel = uevent.lines().any(|l| {
            let l = l.trim();
            (l.starts_with("DRIVER=") && (l == "DRIVER=i915" || l == "DRIVER=xe"))
                || (l.starts_with("PCI_ID=8086:"))
        });
        if !is_intel {
            continue;
        }
        let Ok(link) = std::fs::read_link(&dev) else {
            continue;
        };
        let Some(name) = link.file_name() else {
            continue;
        };
        let addr = name.to_string_lossy().to_string();
        let count = addr.split(':').count();
        if count == 3 {
            return Some(addr);
        } else if count == 2 {
            return Some(format!("0000:{addr}"));
        }
    }
    None
}

/// Whether a DRM device's `uevent` text describes an NVIDIA GPU.
///
/// The vendor id is checked as well as the driver name because the open
/// `nouveau` driver reports `PCI_ID=10DE:` under a different `DRIVER=`.
#[cfg(target_os = "linux")]
fn uevent_is_nvidia(uevent: &str) -> bool {
    uevent.lines().any(|l| {
        let l = l.trim();
        l == "DRIVER=nvidia" || l.starts_with("PCI_ID=10DE:")
    })
}

/// Whether the render node WebKit will open belongs to NVIDIA.
///
/// This used to be "the nvidia module is loaded somewhere", which is true on
/// every hybrid laptop with an Optimus dGPU — including the ones whose Intel or
/// AMD iGPU does all the rendering and where DMA-BUF works perfectly. Those
/// machines were pushed onto SHM rendering, which is a large amount of work to
/// give up for a crash that cannot happen on them. `renderD128` is the node a
/// GBM client opens by default, so that is the one to ask about; if it cannot
/// be read, the broad test is kept rather than assuming the bug is absent.
#[cfg(target_os = "linux")]
fn nvidia_owns_the_render_node() -> bool {
    match std::fs::read_to_string("/sys/class/drm/renderD128/device/uevent") {
        Ok(uevent) => uevent_is_nvidia(&uevent),
        Err(_) => {
            std::path::Path::new("/dev/nvidia0").exists()
                || std::path::Path::new("/sys/module/nvidia").exists()
        }
    }
}

/// The GStreamer plugin scanner on this machine, if one can be found.
///
/// The multiarch directory is named after the architecture's triple
/// (`x86_64-linux-gnu`, `aarch64-linux-gnu`, `arm-linux-gnueabihf`), so it is
/// looked up rather than hardcoded — the hardcoded x86_64 entry left ARM with
/// no candidate at all.
#[cfg(target_os = "linux")]
fn gst_plugin_scanner() -> Option<std::path::PathBuf> {
    let mut candidates: Vec<std::path::PathBuf> = [
        "/usr/lib/gstreamer-1.0/gst-plugin-scanner",
        "/usr/lib64/gstreamer-1.0/gst-plugin-scanner",
        "/usr/libexec/gstreamer-1.0/gst-plugin-scanner",
    ]
    .iter()
    .map(std::path::PathBuf::from)
    .collect();

    if let Ok(entries) = std::fs::read_dir("/usr/lib") {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().contains("-linux-gnu") {
                candidates.push(entry.path().join("gstreamer-1.0/gst-plugin-scanner"));
            }
        }
    }

    candidates.into_iter().find(|p| p.exists())
}

/// GLVND's Mesa entry point, when the host has one.
///
/// `__EGL_VENDOR_LIBRARY_FILENAMES` replaces the entire vendor list, so Mesa
/// has to be named by path here. MEOWAVE_MESA_EGL overrides the lookup for
/// distributions that keep the file elsewhere.
#[cfg(target_os = "linux")]
fn mesa_egl_vendor() -> Option<String> {
    if let Some(p) = std::env::var_os("MEOWAVE_MESA_EGL") {
        return Some(p.to_string_lossy().to_string());
    }
    let path = std::path::Path::new("/usr/share/glvnd/egl_vendor.d/50_mesa.json");
    if path.exists() {
        Some(path.to_string_lossy().to_string())
    } else {
        None
    }
}

#[cfg(all(test, target_os = "linux"))]
mod gpu_probe_tests {
    use super::uevent_is_nvidia;

    /// `uevent` text copied from a real Optimus laptop: the dGPU under the
    /// proprietary driver, and the iGPU that actually does the rendering.
    #[test]
    fn tells_nvidia_from_the_other_vendors() {
        let nvidia =
            "DRIVER=nvidia\nPCI_CLASS=30000\nPCI_ID=10DE:28E1\nPCI_SLOT_NAME=0000:01:00.0\n";
        let intel = "DRIVER=i915\nPCI_CLASS=30000\nPCI_ID=8086:A78B\nPCI_SLOT_NAME=0000:00:02.0\n";
        assert!(uevent_is_nvidia(nvidia));
        assert!(!uevent_is_nvidia(intel));

        // nouveau is NVIDIA too, and reports the same vendor id.
        assert!(uevent_is_nvidia("DRIVER=nouveau\nPCI_ID=10DE:1F95\n"));
        // AMD must not be caught by either half of the test.
        assert!(!uevent_is_nvidia("DRIVER=amdgpu\nPCI_ID=1002:1638\n"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    std::env::set_var("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", webview_args());

    config::load_env();
    proxy::load();

    #[cfg(target_os = "linux")]
    {
        /* AppImage ships its own GStreamer and apprun-hooks point the paths at
           it, so everything below is for the system-GStreamer case only. A
           scanner taken from the host is a different build from the libraries
           the app loaded, and GStreamer refuses a mismatched scanner outright
           rather than scanning with it — so guessing one inside an AppImage
           could cost all audio. */
        if std::env::var_os("APPDIR").is_none() {
            if let Some(home) = std::env::var_os("HOME") {
                let user_gst = std::path::Path::new(&home).join(".local/lib/gstreamer-1.0");
                if user_gst.is_dir() {
                    let current = std::env::var("GST_PLUGIN_PATH").unwrap_or_default();
                    let user_str = user_gst.to_string_lossy().to_string();
                    if current.is_empty() {
                        std::env::set_var("GST_PLUGIN_PATH", user_str);
                    } else if !current.contains(&user_str) {
                        std::env::set_var("GST_PLUGIN_PATH", format!("{user_str}:{current}"));
                    }
                }
            }

            if std::env::var_os("GST_PLUGIN_SCANNER").is_none() {
                if let Some(scanner) = gst_plugin_scanner() {
                    std::env::set_var("GST_PLUGIN_SCANNER", scanner);
                }
            }
        }

        /* Hybrid laptops whose dGPU is renderD128: GLVND loads libEGL_nvidia
           for the web process, and that is where the EGL-teardown crash comes
           from (libnvidia-gpucomp). The old answer was to disable the DMA-BUF
           renderer, which drops the whole web process onto software SHM
           rendering — measured here at ~90 ms frames where the same page
           rasterised on the iGPU costs a fraction of that. Point EGL at Mesa
           instead when an Intel iGPU is present: the iGPU renders, NVIDIA
           libraries are never loaded, DMA-BUF stays on. MEOWAVE_EGL=nvidia
           restores the system default. */
        let mut egl_on_mesa = false;
        if std::env::var_os("MEOWAVE_EGL").is_none()
            && std::env::var_os("__EGL_VENDOR_LIBRARY_FILENAMES").is_none()
            && nvidia_owns_the_render_node()
            && intel_gpu_pci().is_some()
        {
            if let Some(mesa) = mesa_egl_vendor() {
                std::env::set_var("__EGL_VENDOR_LIBRARY_FILENAMES", mesa);
                /* EGL is not the only door into the NVIDIA stack: GLVND also
                   routes GLX by __GLX_VENDOR_LIBRARY_NAME, and desktop
                   sessions on NVIDIA machines export it as "nvidia" — which
                   mapped libGLX_nvidia + libnvidia-gpucomp into the web
                   process and produced its SIGSEGV/SIGABRT dumps. The session
                   value is deliberately overwritten here, not merely filled
                   in when missing. */
                std::env::set_var("__GLX_VENDOR_LIBRARY_NAME", "mesa");
                egl_on_mesa = true;
            }
        }

        let is_wayland = std::env::var_os("WAYLAND_DISPLAY").is_some();
        let forced_x11 = !is_wayland
            && std::env::var_os("MEOWAVE_WAYLAND").is_none()
            && std::env::var_os("GDK_BACKEND").is_none()
            && std::env::var_os("DISPLAY").is_some();
        if forced_x11 {
            std::env::set_var("GDK_BACKEND", "x11");
        }

        if std::env::var_os("MEOWAVE_DISABLE_DMABUF").is_some()
            || std::env::var_os("WSL_DISTRO_NAME").is_some()
            || std::path::Path::new("/.dockerenv").exists()
        {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        } else if std::env::var_os("WAYLAND_DISPLAY").is_some()
            && nvidia_owns_the_render_node()
            && !egl_on_mesa
            && std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none()
        {
            // NVIDIA proprietary driver on Wayland crashes during EGL/DMABUF teardown (libnvidia-gpucomp).
            // Fall back to safe SHM rendering. Only when EGL really is NVIDIA:
            // with Mesa selected above, the NVIDIA path is out of the picture.
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // Do not unconditionally force compositing mode: under Wayland/Hyprland it locks offscreen buffers to 30 FPS
        if std::env::var_os("MEOWAVE_FORCE_COMPOSITING").is_some() {
            std::env::set_var("WEBKIT_FORCE_COMPOSITING_MODE", "1");
        }

        // Only set DRI_PRIME if explicitly requested, as forcing it on hybrid Nvidia systems breaks EGL acceleration
        if std::env::var_os("DRI_PRIME").is_none() && std::env::var_os("MEOWAVE_DRI_PRIME").is_some() {
            if let Some(pci) = intel_gpu_pci() {
                std::env::set_var("DRI_PRIME", format!("pci-{}", pci.replace([':', '.'], "_")));
            }
        }

        /* WebKitGTK's web process SIGSEGVs inside Mesa's dri_gbm.so while it
           tears its GBM device down on exit (WebKitGTK 2.52 + Mesa 26.2, seen
           on every quit, DMA-BUF renderer on). The quit itself is fine — the
           window is gone and the media is stopped — but each one leaves a core
           dump behind, and a desktop crash watcher turns that into a "process
           crashed" notification for something the user already closed.
           RLIMIT_CORE=0 for the tree removes the dump, not the shutdown;
           MEOWAVE_KEEP_CORES=1 leaves the limit alone when a dump is wanted. */
        if std::env::var_os("MEOWAVE_KEEP_CORES").is_none() {
            unsafe {
                let limit = libc::rlimit { rlim_cur: 0, rlim_max: 0 };
                let _ = libc::setrlimit(libc::RLIMIT_CORE, &limit);
            }
        }
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let args: Vec<String> = std::env::args().collect();

        if args.iter().any(|a| a == "--serve") {
            match stream::spawn() {
                Ok(port) => {
                    let _ = STREAM_PORT.set(port);
                    println!("stream proxy on 127.0.0.1:{port}");
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
    }

    match stream::spawn() {
        Ok(port) => {
            let _ = STREAM_PORT.set(port);
            println!("meowave: stream proxy on 127.0.0.1:{port}");
        }
        Err(e) => eprintln!("meowave: stream proxy failed: {e}"),
    }

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![
            config::get_supabase_config,
            tokens::set_service_token,
            tokens::get_service_token,
            tokens::delete_service_token,
            tokens::list_connected_services,
            api::api_search,
            api::api_check_token,
            api::api_probe_service,
            api::api_radio,
            api::sc_playlist_tracks,
            api::spotify_public_playlist_tracks,
            api::ytm_playlist_tracks,
            api::ym_public_playlist_tracks,
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
            spotify::spotify_get_client_id,
            spotify::spotify_set_client_id,
            spotify::spotify_set_redirect_port,
            spotify::spotify_playlists,
            spotify::spotify_playlist_tracks,
            spotify::spotify_liked_tracks,
            ymlib::ym_available,
            ymlib::ym_login_start,
            ymlib::ym_playlists,
            ymlib::ym_playlist_tracks,
            ymlib::ym_liked_tracks,
            discord::discord_available,
            discord::discord_configure,
            discord::discord_update,
            discord::discord_clear,
            discord::discord_test,
            discord::discord_status,
            stream_info,
            stream::stream_prefetch,
            stream::stream_diag,
            stream::stream_alt,
            accounts::acc_status,
            accounts::acc_login,
            accounts::acc_login_browser,
            accounts::acc_paste,
            accounts::acc_logout,
            accounts::acc_lists,
            accounts::acc_tracks,
            ytm::ytm_selftest,
            feeds::feeds_home,
            feeds::feeds_open,
            feeds::wave_ym_start,
            feeds::wave_ym_more,
            feeds::wave_ym_feedback,
            links::link_resolve,
            spanon::artist_profile,
            taskbar::taskbar_set_playing,
            fsguard::other_fullscreen,
            mpris::mpris_update,
        ])
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
            #[cfg(mobile)]
            {
                // No usable HOME on Android/iOS: keep data in the app's private
                // directory, then reread the proxy file from its real location.
                if let Ok(dir) = app.path().app_data_dir() {
                    paths::set_root(dir);
                    proxy::load();
                }
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.emit("meowave://render", true);
                taskbar::init_window(&w);
                // The Linux counterpart of taskbar::init_window: same control
                // path, exposed over MPRIS instead of SMTC. Harmless where
                // there is no session bus — it logs and gives up.
                mpris::spawn(app.handle().clone());
                #[cfg(target_os = "linux")]
                {
                    use webkit2gtk::{SettingsExt, WebViewExt};
                    let _ = w.with_webview(|wv| {
                        let view = wv.inner();
                        if let Some(settings) = view.settings() {
                            settings.set_media_playback_requires_user_gesture(false);
                            settings.set_enable_webaudio(true);
                            settings.set_enable_webgl(true);
                            #[allow(deprecated)]
                            settings.set_enable_accelerated_2d_canvas(true);
                            settings.set_hardware_acceleration_policy(webkit2gtk::HardwareAccelerationPolicy::OnDemand);
                            settings.set_enable_developer_extras(true);
                            settings.set_enable_smooth_scrolling(true);
                            settings.set_enable_page_cache(true);
                        }
                    });
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod local_tests {
    use super::local;

    #[test]
    fn parses_names() {
        let dir = std::env::temp_dir().join("meowave_local_test");
        std::fs::create_dir_all(&dir).unwrap();
        let cases = [
            ("Daft Punk - One More Time.mp3", "Daft Punk", "One More Time"),
            ("07 - Radiohead - Creep.flac", "Radiohead", "Creep"),
            ("03. Boards of Canada - Roygbiv.ogg", "Boards of Canada", "Roygbiv"),
            ("JustATitle.wav", "—", "JustATitle"),
            /* `İ` lowercases to two characters, so a tag stripped after it used
               to take the wrong slice — this one came out "İstanbul - (Night". */
            ("İstanbul - (HD) Night.mp3", "İstanbul", "Night"),
            ("Кино - Звезда (Official Video).mp3", "Кино", "Звезда"),
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
        let junk = dir.join("cover.jpg");
        std::fs::write(&junk, b"x").unwrap();
        assert!(local::local_add(vec![junk.to_string_lossy().to_string()]).is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

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

            let tail = c.get(&base).header("Range", "bytes=-500").send().await.unwrap();
            assert_eq!(tail.status().as_u16(), 206);
            let tail_body = tail.bytes().await.unwrap();
            assert_eq!(&tail_body[..], &body[body.len() - 500..]);

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

            let anon = c.get(&bare).send().await.unwrap();
            assert_eq!(anon.status().as_u16(), 403, "an untokened request was served");
            assert!(
                anon.headers().get("access-control-allow-origin").is_none(),
                "CORS was granted to an unauthenticated caller"
            );

            let wrong = c.get(format!("{bare}?k=deadbeef")).send().await.unwrap();
            assert_eq!(wrong.status().as_u16(), 403);

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
