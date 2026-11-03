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
- Debian/Ubuntu: `libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev pkg-config`
- Amazon Linux/Fedora: `webkit2gtk4.1-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel openssl-devel librsvg2-devel`

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
