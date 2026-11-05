---
name: meowave-rust-check
description: Use before committing any change under src-tauri/ — reproduces the CI Rust job (clippy with -D warnings and cargo test) locally so a PR does not fail on Windows, macOS or Linux.
---

# Checking the Rust backend

CI (`.github/workflows/ci.yml`) runs on Windows, macOS and Ubuntu: `cargo clippy --all-targets -- -D warnings`, then `cargo test`. Run the same before pushing.

## Toolchain (Linux sandbox)
```
export RUSTUP_HOME=/data/.rust/rustup CARGO_HOME=/data/.rust/cargo PATH=/data/.rust/cargo/bin:$PATH CARGO_TARGET_DIR=/data/.rust/target
# first time only:
curl -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path && rustup component add clippy
```
System libraries for Tauri on Linux:
- Debian/Ubuntu: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev libasound2-dev pkg-config`
- Amazon Linux/Fedora: `webkit2gtk4.1-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel openssl-devel librsvg2-devel alsa-lib-devel`

The app embeds `dist/` (`tauri::generate_context!`), which Vite builds from `src/`. Build it first, as CI does: `npm install && npm run web:build` in the repository root (Node 20.19+ or 22.12+). If `dist/` is missing, `build.rs` runs `node scripts/web.mjs build --install` itself, and if that fails it writes a placeholder page that says why (cargo prints a warning).

## Run
```
cd src-tauri
cargo check --message-format short
cargo clippy --all-targets -- -D warnings
cargo test            # or: cargo test --lib matching
```

## Notes
- Code behind `#[cfg(target_os = "windows")]` / `"macos"` is not compiled on Linux; keep such blocks small and mirror their signatures.
- New Tauri commands must be registered in `lib.rs` (`generate_handler!`), and their argument names are camelCase on the JS side.
- `src-tauri/tauri.conf.json` uses CRLF line endings; keep them.
- Two checkouts of this crate (a `git worktree`, a clone in /tmp) must not share one `CARGO_TARGET_DIR`: cargo's hash for a path package does not include its folder, so one checkout can run the other's compiled `build.rs`. Give the second one its own target dir.
- A real window under Xvfb works in the sandbox (WebKitGTK is installed): `Xvfb :99 -screen 0 1440x900x24 &`, then `DISPLAY=:99 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 dbus-run-session -- npm run dev`, screenshot with `import -window root -display :99 shot.png`. For the audio engine give ALSA a null device in `~/.asoundrc`: `pcm.!default { type plug slave.pcm "nullsink" }` and `pcm.nullsink { type null }` on two lines (it plays faster than real time, so positions run ahead — that is the device, not the engine). The warning "IPC custom protocol failed, Tauri will now use the postMessage interface" appears there with old and new builds alike.
