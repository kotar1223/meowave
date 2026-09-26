# meowave

A multi-service desktop music player: YouTube Music, SoundCloud, Yandex Music
and your own files behind one player, one queue and one sound pipeline.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8DB?logo=tauri)
![Backend](https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase)

## About

**meowave** is a desktop music player built with [Tauri](https://tauri.app):
a Rust backend and a webview frontend. It unifies several streaming services so
there is no switching between apps, and it owns the audio path end to end — the
equaliser, the spatial panner and the visualiser all work on streamed tracks, not
just local files.

That last part is why the app runs a small HTTP proxy on 127.0.0.1: signed
service URLs arrive without CORS headers, and without a same-origin stream
`createMediaElementSource` returns silence, taking every effect with it. See the
header of `src-tauri/src/stream.rs`.

## Features

- **Multi-service playback** — one library and one queue across services
- **Own audio pipeline** — 9-band EQ, HRTF spatial panner, limiter, visualiser
- **Per-track and per-playlist EQ presets** — pinned and remembered
- **Speed and boost** — 0.5×–1.5× playback, up to +3× through a limiter
- **Lyrics** — LRCLIB, then YouTube Music, then local Whisper transcription
- **Downloads** — mp3 via a bundled ffmpeg, plus an export that bakes in the
  live EQ and speed
- **Local files** — read straight off disk, never copied
- **Selective proxy** — SOCKS5/HTTP for the services that need it, never for
  Yandex or Supabase
- **Accounts via Supabase** — favorites, playlists, stats, badges
- **Signed auto-updates**

### Supported services

| Service | Status | Auth |
| --- | --- | --- |
| YouTube Music | Supported | none (guest InnerTube) |
| SoundCloud | Supported | none (public client_id) |
| Yandex Music | Supported | OAuth token, stored in the OS keychain |
| Local files | Supported | — |
| Spotify | Sign-in implemented, needs a `SPOTIFY_CLIENT_ID` | Authorization Code + PKCE |

Playback for Spotify is not implemented: the Web API does not serve full tracks
to a third-party client.

## Tech Stack

- **App shell:** [Tauri 2](https://tauri.app) (Rust)
- **Backend / accounts:** [Supabase](https://supabase.com) (Postgres + RLS)
- **Frontend:** `src/` — plain HTML/CSS/JS, no framework, no build step

## Project Structure

```
meowave/
├── docs/                 # GitHub Pages landing page (+ a copy of the badge art)
├── scripts/              # Helper scripts (ffmpeg fetch, badge sync)
├── src/                  # Frontend: index.html, app.css, app.js, assets/
├── src-tauri/            # Rust backend and Tauri config
│   └── ffmpeg/           # Bundled sidecar, fetched not committed
├── supabase/             # SQL migrations, schema entry point, seeding scripts
└── .env.example          # Optional environment overrides
```

## Getting Started

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install) and Cargo
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
- [Node.js](https://nodejs.org/) ≥ 20.11 — for the Tauri CLI and the scripts;
  the app itself has no runtime JS dependencies

Linux note: WebKitGTK plays audio through GStreamer, so a dev checkout needs
the plugins installed (`gst-plugins-base`, `gst-plugins-good`, `gst-libav`).
On NixOS the repo ships a ready shell — one command, no arguments to remember:

```bash
nix-shell --run 'npm run dev'
```
- Optionally a [Supabase](https://supabase.com) project of your own; the build
  ships with working defaults

There is nothing to `npm install`: every script uses only Node built-ins.

### Run

```bash
git clone https://github.com/kotar1223/meowave.git
cd meowave

# optional: point the app at your own Supabase project / set a Spotify client id
cp .env.example .env

npm run dev        # = tauri dev
```

### Build

ffmpeg ships with the app as a Tauri sidecar, so mp3 conversion and the
processed export work on a clean machine. It is 110 MB and therefore not
committed — fetch it first (the download is verified against the checksum the
publisher publishes alongside it):

```bash
npm run ffmpeg         # -> src-tauri/ffmpeg/ffmpeg-<triple>[.exe]
npx tauri build        # -> src-tauri/target/release/bundle/
```

Windows and Linux get a bundled LGPL ffmpeg sidecar. BtbN publishes no macOS
builds, so there the script succeeds without downloading and the app uses a
system copy (`brew install ffmpeg`) — mp3 conversion works everywhere, but
"download with processing" needs that local install on a Mac.

`npm run build` does both in order. The installer comes out at about 40 MB.

### Checks

```bash
npm run check      # cargo clippy -D warnings, cargo test
npm run check:js   # syntax-checks src/app.js
```

### Database

`supabase/schema.sql` is the entry point for psql; for the dashboard SQL editor
use the generated single file:

```bash
npm run schema     # -> supabase/FULL_SCHEMA.sql, paste and Run
```

Then seed the badge catalog (needs a service_role key, which never ships in the
app):

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run badges:seed
```

`supabase/README.md` has the details, including promo codes.

## Roadmap

- [ ] Spotify: playlist and library import
- [ ] Social layer (friends, rooms, shared listening) — schema exists, no UI yet
- [x] macOS and Linux builds
- [ ] Real badge art (the shipped SVGs are generated placeholders)

## Third-party

ffmpeg is redistributed with the installer under the LGPL v3: the LGPL build,
without x264/x265, since nothing here touches video. Its licence text is
installed as `FFMPEG-LICENSE.txt` next to the executable, and the exact build and
its checksum are recorded in `scripts/fetch-ffmpeg.mjs`. Source is available from
<https://github.com/BtbN/FFmpeg-Builds> and <https://ffmpeg.org>.

## Security

The Supabase publishable key is compiled into the binary on purpose: it is not a
secret, and every table is guarded by Row Level Security instead. Statistics,
badges and pinned badges are written only by `security definer` functions — the
client cannot write them directly. See `supabase/migrations/09_hardening.sql`.

Service tokens live in the OS credential store, never in a file.

## License

*No license specified yet.*

## Author

Made by [kotar1223](https://kotar1223.github.io/kotyarbio/)

Telegram: [Meowave](https://t.me/meowaveplayer) ·
[dev chat](https://t.me/techupdate_chat)
