// Prevents an extra console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod config;
mod paths;
mod stream;
mod tokens;

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

fn main() {
    config::load_env();

    match stream::spawn() {
        Ok(port) => {
            let _ = STREAM_PORT.set(port);
            println!("meowave: stream proxy on 127.0.0.1:{port}");
        }
        Err(e) => eprintln!("meowave: stream proxy failed: {e}"),
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            config::get_supabase_config,
            tokens::set_service_token,
            tokens::get_service_token,
            tokens::delete_service_token,
            tokens::list_connected_services,
            api::api_search,
            api::api_check_token,
            paths::store_read,
            paths::store_write,
            paths::store_delete,
            paths::data_dir,
            paths::cache_size,
            paths::cache_clear,
            paths::cache_put,
            paths::cache_get,
            stream_port,
        ])
        // Minimising or hiding the window doesn't stop requestAnimationFrame on
        // Windows — the webview keeps painting a surface nobody can see, which
        // is the particle field burning a core for nothing. Tell the frontend
        // to park itself; it resumes on focus/restore.
        .on_window_event(|window, event| match event {
            WindowEvent::Focused(focused) => {
                let _ = window.emit("meowave://render", *focused);
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
