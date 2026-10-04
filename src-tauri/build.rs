fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    if target.contains("ios") || target.contains("android") {
        let dummy = std::path::Path::new("ffmpeg").join(format!("ffmpeg-{target}"));
        if !dummy.exists() {
            let _ = std::fs::create_dir_all("ffmpeg");
            let _ = std::fs::write(&dummy, b"");
        }
    }
    tauri_build::build()
}
