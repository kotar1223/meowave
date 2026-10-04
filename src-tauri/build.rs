fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let ffmpeg_bin = std::path::Path::new("ffmpeg").join(format!("ffmpeg-{target}{ext}"));
    if !ffmpeg_bin.exists() {
        let _ = std::fs::create_dir_all("ffmpeg");
        let _ = std::fs::write(&ffmpeg_bin, b"");
    }
    tauri_build::build()
}
