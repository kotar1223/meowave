# meowave 

A beautiful, multi-service music player that brings all your favorite streaming platforms into one sleek desktop app.

![Platform](https://img.shields.io/badge/platform-desktop-blue)
![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8DB?logo=tauri)
![Backend](https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase)

## About

**meowave** is a cross-platform desktop music player built with [Tauri](https://tauri.app), designed to unify multiple music streaming services into a single, elegant interface — no more switching between apps for different platforms.

The player features a distinctive, animated waveform-driven visual experience, aiming for a look and feel that goes beyond a typical player UI.

## Features

-  **Multi-service playback** — listen to your music from multiple platforms in one place
-  **Wave-based visuals** — a striking, animated waveform interface
-  **Account sync via Supabase** — manage your account and (soon) sync preferences across devices
-  **Native desktop performance** — powered by Tauri (Rust backend + lightweight webview frontend)
-  **Actively evolving** — new integrations and features are on the way

### Supported services



| YouTube Music | • Supported |
| SoundCloud | • Supported |
| Yandex Music | • Supported |
| Spotify | > Coming soon |
| More integrations | > Planned |

## Tech Stack

- **App shell:** [Tauri](https://tauri.app) (Rust)
- **Backend / Accounts:** [Supabase](https://supabase.com)
- **Frontend:** see `src/`
- **Native layer:** see `src-tauri/`

## Project Structure

```
meowave/
├── docs/assets/     # Documentation assets
├── scripts/         # Helper/build scripts
├── src/             # Frontend application source
├── src-tauri/       # Tauri (Rust) backend & native app config
├── supabase/        # Supabase config, migrations, functions
└── .env.example     # Example environment variables
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- [Rust](https://www.rust-lang.org/tools/install) & Cargo
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
- A [Supabase](https://supabase.com) project (for account features)

### Installation

```bash
# Clone the repository
git clone https://github.com/kotar1223/meowave.git
cd meowave

# Install dependencies
npm install

# Copy the environment file and fill in your Supabase credentials
cp .env.example .env
```

### Development

```bash
cargo run dev
```

### Build

```bash
cargo run build
```

## Roadmap

- [ ] Spotify integration
- [ ] Additional streaming service support
- [ ] Expanded account/sync features
- [ ] More visual customization options

## License

*No license specified yet.*

## Author

Made by [kotar1223](https://kotar1223.github.io/kotyarbio/)

Telegram Channel [Meowave](https://t.me/meowaveplayer_
