# Meowave

> High-fidelity, ultra-lightweight multi-service desktop music player for Windows, Linux, and macOS.
> Built with Tauri 2, Rust, Vite, TypeScript, and Google Material You Expressive design tokens.

[![Official Landing Page](https://img.shields.io/badge/Website-kotar1223.github.io%2Fmeowave-blue?style=flat-square&logo=googlechrome&logoColor=white)](https://kotar1223.github.io/meowave/)
[![Download Latest](https://img.shields.io/badge/Download-Latest_Release-success?style=flat-square&logo=windows&logoColor=white)](https://github.com/kotar1223/meowave/releases/latest)
[![Built with Tauri](https://img.shields.io/badge/Tauri_v2-Rust-orange?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
[![Design System](https://img.shields.io/badge/Material_You-Expressive_2025-blueviolet?style=flat-square)](https://m3.material.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)](LICENSE)

---

## Overview

Meowave brings SoundCloud, Yandex Music, YouTube Music, Spotify, Apple Music catalogs, and local files into a single unified queue and search engine. Unlike resource-heavy Electron players, Meowave is powered by Rust and Tauri 2, consuming under 15 MB of RAM in background playback while offering an audiophile-grade DSP chain, real-time synchronized karaoke lyrics, and an adaptive Material You interface.

```
+-------------------------------------------------------------------------------+
|                                  MEOWAVE UI                                   |
|               (Vite + TypeScript + Material You M3 Expressive)                |
+-------------------------------------------------------------------------------+
       |                                                    |
       v                                                    v
+-----------------------------+              +----------------------------------+
|      RUST NATIVE ENGINE     |              |       WEBVIEW AUDIO ENGINE       |
|    (Default Desktop Path)   |              |         (Fallback Path)          |
|  - Symphonia Audio Decoders |              |  - Web Audio Context Graph       |
|  - 10-Band Graphic EQ       |              |  - HRTF 3D PannerNode (Binaural) |
|  - CPAL Hardware Output     |              |  - Opus, HE-AAC, Blob Formats    |
+-----------------------------+              +----------------------------------+
       |                                                    |
       +----------------------------+-----------------------+
                                    |
                                    v
                     +------------------------------+
                     |   LOCAL STREAMING PROXY      |
                     |  (127.0.0.1:port/stream/)    |
                     |  - Token & DNS Rebind Guard  |
                     |  - Rate-Limited Media Buffer |
                     +------------------------------+
```

---

## Interface Gallery

### Main Screen & Ambient Particle Field
Interactive particle field responding dynamically to musical beats, queue events, and album palette shifts.

<p align="center">
  <img src="docs/assets/promo/desktop-home.jpg" alt="Meowave Desktop Home Screen" width="100%">
</p>

---

### Fullscreen Player & Synced Karaoke Lyrics
Real-time line-by-line synchronized lyrics powered by LRCLIB and Genius with built-in timing calibrator and focus blur effects.

<p align="center">
  <img src="docs/assets/promo/desktop-player.jpg" alt="Meowave Fullscreen Player with Synced Lyrics" width="100%">
</p>

---

### My Wave & Algorithmic Recommendation Tuning
Interactive mood and tempo tuning drawer allowing real-time personalization between high-energy and calm vibes, familiar favorites and new discoveries.

<p align="center">
  <img src="docs/assets/promo/desktop-tune.jpg" alt="Meowave My Wave Tuning Drawer" width="100%">
</p>

---

### Stage Mode & Live Waveform
Alternative visual layout featuring cinematic artwork presentation with animated audio wave ribbons.

<p align="center">
  <img src="docs/assets/promo/desktop-player-stage.jpg" alt="Meowave Player Stage Mode" width="100%">
</p>

---

### Unified Multi-Service Search
Instant cross-service queries returning tracks, artists, albums, and playlists from YouTube Music, SoundCloud, and Yandex Music in a single list.

<p align="center">
  <img src="docs/assets/promo/desktop-search.jpg" alt="Meowave Multi-Service Search" width="100%">
</p>

---

### Media Library & Curated Playlists
Playlists, favorites, listening history, and local audio files (FLAC, MP3, WAV, AAC, OGG) unified under one roof.

<p align="center">
  <img src="docs/assets/promo/desktop-library.jpg" alt="Meowave Media Library" width="48%">
  &nbsp;
  <img src="docs/assets/promo/desktop-playlist.jpg" alt="Meowave Curated Playlist View" width="48%">
</p>

---

### Material You & Sound Settings
29 tonal color roles derived dynamically from artwork, with full control over audio engines, DSP filters, and appearance.

<p align="center">
  <img src="docs/assets/promo/desktop-settings.jpg" alt="Meowave Appearance and Settings" width="100%">
</p>

---

### Responsive & Mobile Adaptations
Full-featured touch navigation, 100dvh viewport compliance, and gesture controls for mobile viewports.

<p align="center">
  <img src="docs/assets/promo/mobile-home.jpg" alt="Meowave Mobile Home" width="48%">
  &nbsp;
  <img src="docs/assets/promo/mobile-player.jpg" alt="Meowave Mobile Player" width="48%">
</p>

---

## Material You Expressive Design

Meowave implements Google's **Material Design 3 (Material You) Expressive** specifications. Instead of static themes, the interface dynamically generates 29 tonal color roles in the OKLCH color space directly from the dominant tones of the active track's album art.

### Dynamic Tonal Architecture & Elevation Matrix

<p align="center">
  <img src="docs/assets/promo/material-you-palette.svg" alt="Meowave Material You M3 Expressive Architecture" width="100%">
</p>

### Dynamic Tonal Swatches & Roles

<table>
  <thead>
    <tr>
      <th align="center">Tone Level</th>
      <th align="left">Material Role</th>
      <th align="center">Color Swatch</th>
      <th align="left">Interface Context</th>
      <th align="center">Elevation Layer</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-98-FAF5FF?style=flat-square&labelColor=191524&color=FAF5FF" alt="Tone 98"></td>
      <td><strong>Surface Lowest</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23FAF5FF-FAF5FF?style=flat-square" height="18" alt="#FAF5FF">&nbsp;<code>#FAF5FF</code></td>
      <td>Window root canvas and bottom-most viewport surface</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_0-0dp_(Flat)-38BDF8?style=flat-square&labelColor=0f172a" alt="Level 0"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-95-F5EDFF?style=flat-square&labelColor=191524&color=F5EDFF" alt="Tone 95"></td>
      <td><strong>Surface</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23F5EDFF-F5EDFF?style=flat-square" height="18" alt="#F5EDFF">&nbsp;<code>#F5EDFF</code></td>
      <td>Primary background and base layer for views</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_0-0dp_(Base)-38BDF8?style=flat-square&labelColor=0f172a" alt="Level 0"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-92-EFE4FF?style=flat-square&labelColor=191524&color=EFE4FF" alt="Tone 92"></td>
      <td><strong>Surface Container Low</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23EFE4FF-EFE4FF?style=flat-square" height="18" alt="#EFE4FF">&nbsp;<code>#EFE4FF</code></td>
      <td>Persistent navigation rails, sidebars, docked tabs</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_1-1dp_(Low)-A78BFA?style=flat-square&labelColor=191524" alt="Level 1"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-90-EAD7FF?style=flat-square&labelColor=191524&color=EAD7FF" alt="Tone 90"></td>
      <td><strong>Surface Container</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23EAD7FF-EAD7FF?style=flat-square" height="18" alt="#EAD7FF">&nbsp;<code>#EAD7FF</code></td>
      <td>Standard media cards, list rows, queue rows</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_2-3dp_(Card)-C084FC?style=flat-square&labelColor=191524" alt="Level 2"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-85-DEC1FF?style=flat-square&labelColor=191524&color=DEC1FF" alt="Tone 85"></td>
      <td><strong>Surface Container High</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23DEC1FF-DEC1FF?style=flat-square" height="18" alt="#DEC1FF">&nbsp;<code>#DEC1FF</code></td>
      <td>Dialog modals, bottom sheets, tune slider drawer</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_3-6dp_(High)-E879F9?style=flat-square&labelColor=191524" alt="Level 3"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-80-D0A7FF?style=flat-square&labelColor=191524&color=D0A7FF" alt="Tone 80"></td>
      <td><strong>Accent Soft / Container</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23D0A7FF-D0A7FF?style=flat-square" height="18" alt="#D0A7FF">&nbsp;<code>#D0A7FF</code></td>
      <td>Active filter chips, secondary button containers</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_4-8dp_(Top)-F43F5E?style=flat-square&labelColor=191524" alt="Level 4"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-70-B87AFF?style=flat-square&labelColor=191524&color=B87AFF" alt="Tone 70"></td>
      <td><strong>Secondary Tonal</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23B87AFF-B87AFF?style=flat-square" height="18" alt="#B87AFF">&nbsp;<code>#B87AFF</code></td>
      <td>Muted accent badges, icon accents, secondary text</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_2-Tonal_Accent-B87AFF?style=flat-square&labelColor=191524" alt="Level 2"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-50-9A46FF?style=flat-square&labelColor=191524&color=9A46FF" alt="Tone 50"></td>
      <td><strong>Primary M3</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%239A46FF-9A46FF?style=flat-square" height="18" alt="#9A46FF">&nbsp;<code>#9A46FF</code></td>
      <td>Play controls, active slider fill, primary buttons</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_3-Primary_Action-9A46FF?style=flat-square&labelColor=191524" alt="Level 3"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-100-FFFFFF?style=flat-square&labelColor=191524&color=FFFFFF" alt="Tone 100"></td>
      <td><strong>On-Primary</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%23FFFFFF-FFFFFF?style=flat-square" height="18" alt="#FFFFFF">&nbsp;<code>#FFFFFF</code></td>
      <td>High-contrast text and icons on primary actions</td>
      <td align="center"><img src="https://img.shields.io/badge/Contrast-WCAG_AAA-10B981?style=flat-square&labelColor=0f172a" alt="WCAG AAA"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-30-4A1282?style=flat-square&labelColor=191524&color=4A1282" alt="Tone 30"></td>
      <td><strong>Surface Dim</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%234A1282-4A1282?style=flat-square" height="18" alt="#4A1282">&nbsp;<code>#4A1282</code></td>
      <td>Overlays, scrims, active lyrics highlight frame</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_4-Overlay_Scrim-4A1282?style=flat-square&labelColor=191524" alt="Level 4"></td>
    </tr>
    <tr>
      <td align="center"><img src="https://img.shields.io/badge/Tone-10-1A0038?style=flat-square&labelColor=191524&color=1A0038" alt="Tone 10"></td>
      <td><strong>Base Dark Floor</strong></td>
      <td align="center"><img src="https://img.shields.io/badge/-%231A0038-1A0038?style=flat-square" height="18" alt="#1A0038">&nbsp;<code>#1A0038</code></td>
      <td>Root contrast floor ensuring guaranteed WCAG AAA rating</td>
      <td align="center"><img src="https://img.shields.io/badge/Level_5-Contrast_Floor-1A0038?style=flat-square&labelColor=191524" alt="Level 5"></td>
    </tr>
  </tbody>
</table>

### Material 3 Architecture Tokens

- **Dynamic Contrast Roles:** Guaranteed WCAG AAA compliance between `onPrimary`, container surfaces, and background cards.
- **Concentric Corner Radii:** Geometric nesting where inner elements match outer card curvature formulas (`R_inner = R_outer - padding`).
- **Surface Elevation Containers:** 5-step elevation layering using `surfaceContainerLowest` through `surfaceContainerHighest` without noisy drop shadows.
- **Adaptive Ambient Wave:** Subtle background glow matching the album art hue, rendered with GPU-accelerated canvas particles at 30/60 fps.
- **Custom Accent Engine:** Built-in palette selector providing soft pastels, monochrome, or custom seed color HEX inputs with instant re-theming.

---

## Core Capabilities

### Unified Streaming & Local Audio
- **Multi-Service Catalog:** SoundCloud, Yandex Music, YouTube Music, Spotify, Apple Music, and local storage.
- **No API Keys Required:** Anonymous catalogs and stream resolution out of the box.
- **Offline Storage:** Download tracks to disk with zero DRM locks. Local files are played directly from storage without cloud roundtrips.

### Dual Audio Architecture
- **Native Rust Audio Engine (Default):** Read-ahead buffering, Symphonia multi-format decoding (MP3, AAC, FLAC, ALAC, Vorbis, WAV), hardware-synced 10-band equalizer, and CPAL audio endpoint delivery. Eliminates WebView dropouts and audio glitches.
- **Web Audio Engine (Fallback):** Web Audio context graph powering Opus, HE-AAC, blob media, and mobile environments.

### Audiophile DSP Suite
- **10-Band Graphic Equalizer:** Custom frequency curves with per-track and per-playlist preset assignment.
- **3D Spatial Audio:** HRTF binaural head-orbit panner with customizable orbit radius, rotation frequency, and height elevation.
- **Nightcore & Slowed+Reverb:** Continuous speed shifting from 0.5x to 1.5x with pitch coupling and ConvolverNode room reverberation.
- **Smart Loudness Management:** Clean peak limiter offering up to +9 dB loudness boost and track-to-track volume normalization.

### Native System Integration
- **Windows 11 Thumbnail Toolbar:** Play, pause, and skip tracks straight from the taskbar thumbnail preview (`ITaskbarList3`), matching Spotify behavior.
- **Linux Desktop & MPRIS:** Full integration with D-Bus MPRIS (`playerctl`), desktop media keys, and system sound panels.
- **Discord Rich Presence:** Displays current track, album art, elapsed time, and service origin on your Discord profile.

### Social Layer & Listening Rooms
- **Synchronized Listening Rooms:** Real-time host-synchronized playback with shared queues, guest request voting, and room chat.
- **End-to-End Encrypted Messenger:** Direct messaging with P-256 ECDH key exchange and AES-GCM payload encryption. Supports quoted replies, track sharing, images, and delivery receipts.
- **Quasar ID Profiles:** Customizable profile with bio, pinned track, and up to three displayable achievement badges.

---

## Service Matrix

| Service | Audio Playback | Search & Catalog | Authentication | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **SoundCloud** | Supported | Supported | Anonymous / OAuth | Direct streaming through local proxy |
| **Yandex Music** | Supported | Supported | OAuth Sign-in / Token | High-quality HQ audio streams |
| **Local Files** | Supported | Supported | None | FLAC, MP3, WAV, AAC, OGG from local drive |
| **Spotify** | Matched Stream | Supported | Anonymous / PKCE OAuth | Matched against lossless/clean providers |
| **Apple Music** | Matched Stream | Supported | None | Public iTunes & RSS catalog search |
| **YouTube Music** | Supported | Supported | InnerTube Guest | Full track catalog resolution |

*Note on Spotify and Apple Music:* Audio streams from Spotify and Apple Music are protected by DRM and cannot be played directly by third-party desktop players. Meowave matches track metadata against clean audio providers to play the exact recording seamlessly.

---

## Security & Privacy Invariants

- **Zero Telemetry:** No user activity tracking, analytics pings, or marketing SDKs.
- **Local Secret Storage:** Service credentials and authentication tokens are stored exclusively in the OS native credential store (Windows Credential Manager / macOS Keychain / Secret Service API).
- **Strict Network Proxy:** All audio and image streams pass through a hardened local loopback proxy (`127.0.0.1:port/stream/?k=...`) protected by ephemeral session keys to prevent DNS rebinding and timing attacks.
- **Row-Level Security (RLS):** All backend interactions with Postgres are enforced by database-level security policies; stats and badges are verifiable only via security-definer procedures.

---

## Installation & Updates

### Download Releases
Official standalone installers and portable builds are published on GitHub Releases:
- **Repository:** [https://github.com/kotar1223/meowave](https://github.com/kotar1223/meowave)
- **Latest Release:** [https://github.com/kotar1223/meowave/releases/latest](https://github.com/kotar1223/meowave/releases/latest)

### Automatic In-App Updates
- **Installed Builds:** The app periodically queries the release endpoint for signed update bundles verified via Minisign public key signatures.
- **Source Checkouts (`npm run dev`):** The application detects local git repository checkout state and provides one-click `git pull` updates directly from the settings dialog.

---

## Development & Building

### Prerequisites
- [Rust](https://www.rust-lang.org/tools/install) (latest stable) and Cargo
- [Node.js](https://nodejs.org/) 20.19+ or 22.12+ (npm 10+)
- [Tauri Prerequisites](https://tauri.app/start/prerequisites/) for your operating system

Linux users require GStreamer development packages:
```bash
# Debian / Ubuntu
sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf \
  libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-bad1.0-dev
```

### Running Locally

```bash
# Clone the repository
git clone https://github.com/kotar1223/meowave.git
cd meowave

# Optional: configure local environment overrides
cp .env.example .env

# Start desktop development mode (auto-installs dependencies and launches Tauri)
npm run dev

# Start frontend development server in browser only
npm run web
```

### Building Release Bundles

```bash
# Fetch bundled FFmpeg sidecar (verified with official publisher checksum)
npm run ffmpeg

# Build optimized production bundle
npm run build
```

Production installers will be located in:
`src-tauri/target/release/bundle/`

### Test & Verification Commands

```bash
# Run complete verification suite (build, Rust clippy, cargo tests)
npm run check

# Check frontend JavaScript syntax and TypeScript types
npm run check:js
npm run typecheck

# Run end-to-end automated smoke tests
npm run test:e2e
```

---

## Project Structure

```
meowave/
|-- brain/               # Developer second brain (Obsidian vault: architecture, logs, specs)
|-- docs/                # GitHub Pages showcase site & promo assets
|   |-- assets/promo/    # High-resolution application screenshots and demo clip
|-- scripts/             # Build scripts (web bundler, FFmpeg downloader, schema generator)
|-- src/                 # Application frontend root
|   |-- app.js           # Core player state machine and UI logic
|   |-- app.css          # Design system styles and Material You custom properties
|   |-- index.html       # Application DOM layout and overlays
|   +-- ts/              # TypeScript modules (naudio, discover, search, messenger, aura)
|-- src-tauri/           # Native Rust backend
|   |-- src/audio/       # Native Symphonia decoder, DSP pipeline, and CPAL output
|   |-- src/stream.rs    # Local streaming proxy and media resolver
|   |-- src/update.rs    # Dual update engine (signed releases & git pull)
|   +-- Cargo.toml       # Rust crate dependencies
+-- supabase/            # Database schemas, migrations, and achievement definitions
```

---

## License & Credits

- **Author:** [kotar1223](https://github.com/kotar1223)
- **Telegram Channel:** [@meowaveplayer](https://t.me/meowaveplayer)
- **Developer Chat:** [@techupdate_chat](https://t.me/techupdate_chat)
- **Third-Party Libraries:** Built with [Tauri](https://tauri.app), [Symphonia](https://github.com/pdeljanov/Symphonia), [cpal](https://github.com/RustAudio/cpal), and [Vite](https://vite.dev).
- **FFmpeg:** Distributed under LGPL v3 as a sidecar binary. See `FFMPEG-LICENSE.txt` for details.
- **License:** MIT License. See [LICENSE](LICENSE) for details.
