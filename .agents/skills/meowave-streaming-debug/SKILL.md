---
name: meowave-streaming-debug
description: Use when a Meowave track does not start, stops after a few seconds, plays the wrong song, sounds worse than expected, or a service (YouTube Music, Yandex, SoundCloud, Deezer, Spotify-via-match) fails to load.
---

# Debugging Meowave streaming

## Map of the pipeline
1. `src/app.js` builds the URL: `http://127.0.0.1:<port>/stream/<svc>/<id>?k=<key>&hq=<0|1|2>&fmt=…` (`streamUrl`, `hqFlag()`, `ytmFmt()`).
2. `src-tauri/src/stream.rs` is the local proxy: resolves the upstream URL (`api.rs` → per-service resolver), caches it briefly, forwards ranges, decrypts Yandex "encraw" lossless (AES-128-CTR) on the fly, `stream_prefetch` warms the next track.
3. Per service: `ytm.rs` (InnerTube clients, UA must match the client that minted the googlevideo URL), `api.rs` (Yandex, SoundCloud), `dz.rs` (Deezer: 30 s previews only), Spotify has no audio — `sprResolve()` in `app.js` + `matching.rs` find the same recording elsewhere.
4. Errors reach the user through `humanStreamError()` in `app.js`.

## Triage order
1. **Which service and which id?** Reproduce with that exact track; note the toast text.
2. **Wrong song** → `matching.rs`. Add a failing case to its tests first (`cargo test --lib matching`), then tighten the rule. Never loosen strictness to "make it play": an honest failure beats another song.
3. **Starts then dies after a few MB (YouTube)** → a client whose URLs need a PO token (ANDROID_VR 1.65.x did this). Re-measure the client list in `ytm.rs`; keep only clients that return plain URLs.
4. **"Confirm you're not a bot" / LOGIN_REQUIRED** → VPN or shared IP; not fixable in code, surface the hint.
5. **403 from googlevideo** → User-Agent mismatch between resolve and fetch.
6. **Lossless sounds bad** → check `hqFlag()` really sends 2 (needs `CAN.flac`), and `limRoute()` keeps the limiter off for plain playback.
7. **Deezer cuts at 30 s** → expected without a match; check that matching was attempted.

## Rules
- Do not log or commit tokens; the Yandex lossless key travels only in the URL fragment inside the process.
- After Rust edits run the `meowave-rust-check` skill; after JS edits `node --check` the touched files.
- Record the cause and fix in `brain/Features/Streaming.md` and `brain/Log/Worklog.md`.
