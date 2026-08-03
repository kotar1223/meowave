// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod config;
mod local;
mod paths;
mod stream;
mod tokens;
mod ytm;

use std::sync::OnceLock;

use tauri::{Emitter, Manager, WindowEvent};

/// Port of the local audio proxy; the frontend asks for it via `stream_port`.
static STREAM_PORT: OnceLock<u16> = OnceLock::new();

#[tauri::command]
fn stream_port() -> Result<u16, String> {
    STREAM_PORT
        .get()
        .copied()
        .ok_or_else(|| "the audio proxy failed to start".to_string())
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
                            "ytm" => ytm::stream(&first.id, true).await.map(|p| {
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
    let url = format!("http://127.0.0.1:{port}/stream/{service}/{id}?hq=1");
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

fn main() {
    config::load_env();

    let args: Vec<String> = std::env::args().collect();

    // `meowave --serve` keeps only the proxy alive, so the exact requests the
    // webview makes (CORS preflight, ranged GET) can be replayed by hand.
    if args.iter().any(|a| a == "--serve") {
        match stream::spawn() {
            Ok(port) => {
                let _ = STREAM_PORT.set(port);
                println!("stream proxy on 127.0.0.1:{port}");
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
            paths::cache_clear,
            paths::cache_put,
            paths::cache_get,
            local::local_add,
            local::local_scan,
            local::local_rehydrate,
            stream_port,
        ])
        // Minimising doesn't stop requestAnimationFrame on Windows — the webview
        // keeps painting a surface nobody can see. So we park the field when the
        // window is really invisible.
        //
        // Losing focus is NOT that case: the window is still on screen, and
        // reporting it as "not visible" froze the particle field into a
        // screenshot whenever the user clicked another app. Focus changes only
        // carry a hint so the frontend can lower its frame budget.
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(focused) => {
                let _ = window.emit("meowave://focus", *focused);
                // Still visible either way unless it is actually minimised.
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
        let base = format!("http://127.0.0.1:{port}/stream/local/{id}");

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
        });
        let _ = std::fs::remove_dir_all(&dir);
    }
}
