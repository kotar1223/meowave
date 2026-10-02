# meowave 🐾

> A modern, lightweight multi-service desktop music player for Windows, macOS and Linux. Built with **Tauri 2**, **Rust**, and **Material You**.

[![Official Landing Page](https://img.shields.io/badge/Website-kotar1223.github.io%2Fmeowave-blue?style=for-the-badge&logo=googlechrome&logoColor=white)](https://kotar1223.github.io/meowave/)
[![Download Latest](https://img.shields.io/badge/Download-Latest%20Release-success?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/kotar1223/meowave/releases/latest)
[![Built with Tauri](https://img.shields.io/badge/Tauri_v2-Rust-FFC131?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
[![Design System](https://img.shields.io/badge/Material_You-Expressive_2025-a855f7?style=for-the-badge)](https://m3.material.io/)

---

## 🌟 Highlights

- **Unified Multi-Service Library**: SoundCloud, Yandex Music, Spotify playlist import, YouTube Music, and local disk files (FLAC, MP3, WAV, AAC, OGG) behind a single queue and search bar.
- **🎨 Material You & Material Expressive**:
  - Dynamic palette adapting in real-time to the current track's album art.
  - 11 built-in expressive color themes (Adaptive, Monochrome, Material Purple, Electric Indigo, Ocean Sky, Cyber Cyan, Nordic Teal, Neon Emerald, Solar Amber, Sunset Coral, Vibrant Rose, Custom HEX).
  - Concentric corner radii, ambient particle canvas, and fluid spring motion tokens.
- **🪟 Windows 11 Taskbar Thumbnail Controls**:
  - Hover over the taskbar icon to play/pause, skip, and go back right from the Windows thumbnail toolbar (native Win32 `ITaskbarList3`), just like Spotify.
- **🎤 Karaoke & Synced Lyrics with Calibrator**:
  - Real-time synced lyrics from LRCLIB & Genius.
  - Built-in interactive lyrics timing editor to sync and edit your own lyrics.
- **📺 Fullscreen Stage & Cover Drift (F11)**:
  - Cinema stage mode with customizable album cover zoom and organic slow drift motion.
- **🔊 Audiophile DSP Pipeline**:
  - 10-band graphic equalizer with per-track and per-playlist saved presets.
  - 3D Spatial Audio: HRTF binaural head orbit panner with adjustable radius, speed, and elevation.
  - Nightcore & slowed-and-reverbed speed shifting (0.5×–1.5× with pitch coupling).
  - Loudness boost up to +9 dB via clean limiter.
- **🚀 Ultra-Lightweight & Private**:
  - Powered by Rust & Tauri 2: uses less than 15 MB of RAM in background (10× less than Electron).
  - Zero telemetry or third-party ads. Tokens are saved securely in the native OS Keychain (Windows Credential Manager).
- **👥 Social & Rooms**:
  - Listening rooms with live playback synchronization, direct/group chat, custom badges and user profiles.

---

## 🎧 Supported Services

| Service | Playback Status | Authentication |
| :--- | :--- | :--- |
| **SoundCloud** | ✅ Supported | Anonymous (public client) / OAuth |
| **Yandex Music** | ✅ Supported | OAuth Token (stored in OS Keychain) |
| **Local Files** | ✅ Supported | None (direct disk streaming, zero copying) |
| **Spotify** | ✅ Playlist / Library Import | OAuth Authorization Code + PKCE |
| **YouTube Music** | ⚠️ Experimental | InnerTube guest |

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

- [ ] Spotify: saved-library import (playlist import ships — matched against
  YouTube Music, since the Web API never serves full tracks to a third-party
  client)
- [x] Social layer (friends, chats, listening rooms) — schema **and** UI; the
  social migrations are separate files and still have to be applied by hand
  (`supabase/migrations/09`…`12`, or one paste of `supabase/FULL_SCHEMA.sql`)
- [x] macOS and Linux builds
- [ ] Real badge art — 35 of 36 badges have PNG art; `party_boykisser` still
  falls back to the generated placeholder SVG

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
