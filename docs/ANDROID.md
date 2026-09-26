# Android build

Meowave is a Tauri 2 app, and Tauri 2 targets Android directly. The codebase
already carries the mobile hooks (Supabase session storage and the
`meowave://auth/callback` handler), so the remaining work is tooling, not
rewriting.

## What is needed once

1. **Android Studio** (or standalone command-line tools) with the SDK.
2. Environment variables (Windows example):

   ```
   ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
   JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
   ```

3. NDK + platform installed through SDK Manager (`sdkmanager "platform-tools" "platforms;android-34" "ndk;27.0.12077973"`).

4. Rust targets:

   ```
   rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
   ```

## Creating the project

```
npm i -D @tauri-apps/cli          # if not present
cargo tauri android init
cargo tauri android dev           # with a device or emulator connected
cargo tauri android build --apk   # produces a debug APK
```

## Pieces that need attention after `init`

- **WebView**: Android uses the system WebView (Chromium). Widevine is
  present there, but Spotify streaming is still out of scope for now.
- **ffmpeg sidecar**: `externalBin` needs Android builds of ffmpeg; until
  then processed downloads are unavailable on Android and the UI hides the
  button (this is already how `HAS_FFMPEG` behaves).
- **Keychain**: `keyring` crates use the Android Keystore through Tauri
  mobile plugins; tokens currently fall back to app storage.
- **Local file access**: scoped storage on Android changes how `local_rehydrate`
  paths resolve; the folder picker uses the Tauri dialog plugin's Android
  implementation.
- **Updater**: Tauri's updater does not cover Android; updates ship as APKs
  or through a store listing later.

## Status

Not started on this machine (no Android SDK installed). The steps above are
the whole checklist; nothing in the current code blocks `tauri android init`.
