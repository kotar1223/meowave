//! The native audio engine: decoding, the equaliser and effects, and the
//! output device, in Rust instead of the webview's `<audio>` + Web Audio.
//!
//! Why: the webview's media stack was the weak link — WebView2 and
//! WebKitGTK each buffer, seek and recover from network trouble their own
//! way, a busy page could starve the Web Audio thread into crackles, and the
//! effects were bound to what the graph's nodes could do. Here the stream is
//! read ahead into memory, the chain runs tens of milliseconds ahead of the
//! device, and the device callback only copies.
//!
//! The page drives it through the commands below and hears back over one
//! IPC channel (`audio_subscribe`); app.js wraps both in an object that
//! behaves like the `<audio>` element it replaces, so the player logic did
//! not have to change. Desktop only: on mobile the commands answer
//! "unavailable" and the page keeps its web engine.

#[cfg(desktop)]
mod conv;
#[cfg(desktop)]
mod decode;
#[cfg(desktop)]
mod dsp;
#[cfg(desktop)]
mod engine;
#[cfg(desktop)]
mod mp4;
#[cfg(desktop)]
mod output;
#[cfg(desktop)]
mod resample;
#[cfg(desktop)]
mod source;

use serde_json::{json, Value};
use tauri::ipc::Channel;

#[cfg(desktop)]
fn parse_set(v: &Value) -> (dsp::Set, Option<f64>, Option<bool>) {
    let f = |k: &str| v.get(k).and_then(Value::as_f64);
    let sp = v.get("sp").filter(|o| o.is_object()).map(|o| {
        let d = dsp::Sp::default();
        dsp::Sp {
            on: o.get("on").and_then(Value::as_bool).unwrap_or(false),
            speed: o.get("speed").and_then(Value::as_f64).unwrap_or(d.speed),
            rad: o.get("rad").and_then(Value::as_f64).unwrap_or(d.rad),
            elev: o.get("elev").and_then(Value::as_f64).unwrap_or(d.elev),
        }
    });
    let rv = v.get("rv").filter(|o| o.is_object()).map(|o| {
        let d = dsp::Rv::default();
        let g = |k: &str, def: f64| o.get(k).and_then(Value::as_f64).unwrap_or(def);
        dsp::Rv {
            on: o.get("on").and_then(Value::as_bool).unwrap_or(false),
            mix: g("mix", d.mix),
            size: g("size", d.size),
            tone: g("tone", d.tone),
            pre: g("pre", d.pre),
        }
    });
    let pair = |k: &str| {
        v.get(k).and_then(Value::as_array).and_then(|a| match (a.first().and_then(Value::as_f64), a.get(1).and_then(Value::as_f64)) {
            (Some(x), Some(y)) => Some((x, y)),
            _ => None,
        })
    };
    let s = dsp::Set {
        pre: f("pre"),
        eq: v.get("eq").and_then(Value::as_array).map(|a| a.iter().map(|x| x.as_f64().unwrap_or(0.0)).collect()),
        vol: f("vol"),
        norm: f("norm").map(|g| (g, f("normTau").unwrap_or(1.2))),
        fade: pair("fade"),
        boost: f("boost"),
        lim: v.get("lim").and_then(Value::as_bool),
        sp,
        rv,
    };
    (s, f("rate"), v.get("viz").and_then(Value::as_bool))
}

/// Whether the engine can play here, and on what.
#[tauri::command]
pub async fn audio_caps() -> Value {
    #[cfg(desktop)]
    {
        let e = engine::get();
        let dev = tauri::async_runtime::spawn_blocking(move || e.device(std::time::Duration::from_millis(2500)))
            .await
            .ok()
            .flatten();
        match dev {
            Some((name, sr, ch, fmt)) => json!({
                "ok": true,
                "dev": {"name": name, "sr": sr, "ch": ch, "fmt": fmt},
                // What symphonia decodes here; Opus and HE-AAC go to the web engine.
                "codecs": ["mp3", "aac", "flac", "alac", "vorbis", "wav"],
            }),
            None => json!({"ok": false, "why": "no output device"}),
        }
    }
    #[cfg(mobile)]
    {
        json!({"ok": false, "why": "desktop only"})
    }
}

#[tauri::command]
pub fn audio_subscribe(channel: Channel<Value>) {
    #[cfg(desktop)]
    engine::get().subscribe(channel);
    #[cfg(mobile)]
    let _ = channel;
}

#[tauri::command]
pub fn audio_open(url: String, gen: u64, at: f64, play: bool) {
    #[cfg(desktop)]
    engine::get().open(url, gen, at, play);
    #[cfg(mobile)]
    let _ = (url, gen, at, play);
}

#[tauri::command]
pub fn audio_play(fade: Option<f64>) {
    #[cfg(desktop)]
    engine::get().play(fade.unwrap_or(0.012));
    #[cfg(mobile)]
    let _ = fade;
}

#[tauri::command]
pub fn audio_pause(fade: Option<f64>) {
    #[cfg(desktop)]
    engine::get().pause(fade.unwrap_or(0.012));
    #[cfg(mobile)]
    let _ = fade;
}

#[tauri::command]
pub fn audio_seek(gen: u64, t: f64) {
    #[cfg(desktop)]
    engine::get().seek(gen, t);
    #[cfg(mobile)]
    let _ = (gen, t);
}

#[tauri::command]
pub fn audio_stop() {
    #[cfg(desktop)]
    engine::get().stop();
}

#[tauri::command]
pub fn audio_set(p: Value) {
    #[cfg(desktop)]
    {
        let (s, rate, viz) = parse_set(&p);
        engine::get().set(s, rate, viz);
    }
    #[cfg(mobile)]
    let _ = p;
}

#[tauri::command]
pub fn audio_preload(url: String) {
    #[cfg(desktop)]
    engine::get().preload(url);
    #[cfg(mobile)]
    let _ = url;
}

#[tauri::command]
pub async fn audio_status() -> Value {
    #[cfg(desktop)]
    {
        engine::get().status()
    }
    #[cfg(mobile)]
    {
        json!({"ok": false})
    }
}
