#!/usr/bin/env bash
# ==============================================================================
# Meowave - AppImage Builder
# Builds a self-contained portable AppImage with bundled GStreamer codecs & ffmpeg
# ==============================================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "▶ 1. Ensuring ffmpeg sidecar is downloaded..."
node scripts/fetch-ffmpeg.mjs

echo "▶ 1b. Building the interface (Vite: src/ → dist/, embedded by cargo)..."
node scripts/web.mjs build --install

echo "▶ 2. Building release binary via cargo..."
cargo build --release --manifest-path src-tauri/Cargo.toml

echo "▶ 3. Bundling base AppDir via Tauri CLI..."
export NO_STRIP=1
export APPIMAGE_EXTRACT_AND_RUN=1
export GSTREAMER_PLUGINS_DIR="${HOME}/.local/lib/gstreamer-1.0"
if command -v bun >/dev/null 2>&1; then
    bun x tauri build --bundles appimage --no-sign
elif command -v npx >/dev/null 2>&1; then
    npx tauri build --bundles appimage --no-sign
else
    cargo tauri build --bundles appimage --no-sign
fi

APPDIR="$ROOT_DIR/src-tauri/target/release/bundle/appimage/Meowave.AppDir"

echo "▶ 4. Bundling complete GStreamer codec suite into AppDir..."
mkdir -p "$APPDIR/usr/lib/gstreamer-1.0"
# First: copy essential system base plugins and gst-plugin-scanner
for sys_dir in /usr/lib/gstreamer-1.0 /usr/lib/x86_64-linux-gnu/gstreamer-1.0; do
    if [ -d "$sys_dir" ]; then
        cp -a "$sys_dir/"* "$APPDIR/usr/lib/gstreamer-1.0/" 2>/dev/null || true
    fi
done
# Second: copy additional verified user plugins (only with all deps satisfied)
if [ -d "${HOME}/.local/lib/gstreamer-1.0" ]; then
    for f in "${HOME}/.local/lib/gstreamer-1.0/"*.so; do
        if [ -f "$f" ]; then
            if ! ldd "$f" 2>&1 | grep -q "not found"; then
                cp -f "$f" "$APPDIR/usr/lib/gstreamer-1.0/"
            fi
        fi
    done
fi

echo "▶ 5. Configuring AppRun hooks (Wayland + GStreamer paths + Emulator compat)..."
mkdir -p "$APPDIR/apprun-hooks"
cat > "$APPDIR/apprun-hooks/01-compat.sh" << 'EOF'
#! /bin/bash
# VM / container / emulator compatibility: WebKitGTK's DMABUF hardware renderer
# needs a working EGL stack, and in VMs, WSLg and Docker there is none — the
# result there is white/black screens or crashes.
if [ -z "${WEBKIT_DISABLE_DMABUF_RENDERER:-}" ]; then
    if [ -f "/.dockerenv" ] || [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${container:-}" ] || \
       (command -v systemd-detect-virt >/dev/null 2>&1 && systemd-detect-virt -q 2>/dev/null); then
        export WEBKIT_DISABLE_DMABUF_RENDERER=1
    fi
fi

# GPU choice belongs to the app now (lib.rs): it points EGL at Mesa when a
# hybrid laptop's NVIDIA dGPU merely owns renderD128 (enumeration order, not
# the renderer), and falls back to software SHM only where NVIDIA really is
# the only renderer. This hook used to force DRI_PRIME on any Intel+NVIDIA
# Wayland box, which fought that decision and left the web process on the CPU.
# MEOWAVE_DRI_PRIME=pci-... still pins a GPU when a machine needs it.
EOF
chmod +x "$APPDIR/apprun-hooks/01-compat.sh"

cat > "$APPDIR/apprun-hooks/02-gstreamer.sh" << 'EOF'
#! /bin/bash
# GStreamer paths configuration for AppImage
if [ -x "${APPDIR}/usr/lib/gstreamer-1.0/gst-plugin-scanner" ]; then
    export GST_PLUGIN_SCANNER="${APPDIR}/usr/lib/gstreamer-1.0/gst-plugin-scanner"
elif [ -x "/usr/lib/gstreamer-1.0/gst-plugin-scanner" ]; then
    export GST_PLUGIN_SCANNER="/usr/lib/gstreamer-1.0/gst-plugin-scanner"
elif [ -x "/usr/lib/x86_64-linux-gnu/gstreamer-1.0/gst-plugin-scanner" ]; then
    export GST_PLUGIN_SCANNER="/usr/lib/x86_64-linux-gnu/gstreamer-1.0/gst-plugin-scanner"
elif [ -x "/usr/libexec/gstreamer-1.0/gst-plugin-scanner" ]; then
    export GST_PLUGIN_SCANNER="/usr/libexec/gstreamer-1.0/gst-plugin-scanner"
fi

HOST_GST_DIRS="/usr/lib/gstreamer-1.0:/usr/lib/x86_64-linux-gnu/gstreamer-1.0:/usr/lib64/gstreamer-1.0"
export GST_PLUGIN_SYSTEM_PATH_1_0="${APPDIR}/usr/lib/gstreamer-1.0:${HOST_GST_DIRS}:${GST_PLUGIN_SYSTEM_PATH_1_0:-}"
export GST_PLUGIN_PATH_1_0="${APPDIR}/usr/lib/gstreamer-1.0:${GST_PLUGIN_PATH_1_0:-}"
export GST_PLUGIN_PATH="${APPDIR}/usr/lib/gstreamer-1.0:${GST_PLUGIN_PATH:-}"
EOF
chmod +x "$APPDIR/apprun-hooks/02-gstreamer.sh"

sed -i 's/export GDK_BACKEND=x11/if [ -n "$WAYLAND_DISPLAY" ]; then export GDK_BACKEND="wayland,x11"; else export GDK_BACKEND="x11"; fi/g' "$APPDIR/apprun-hooks/linuxdeploy-plugin-gtk.sh" 2>/dev/null || true

# Rewrite AppRun to execute all hooks in sequence
cat > "$APPDIR/AppRun" << 'EOF'
#! /usr/bin/env bash
set -e
this_dir="$(readlink -f "$(dirname "$0")")"
if [ -d "$this_dir/apprun-hooks" ]; then
    for hook in "$this_dir"/apprun-hooks/*.sh; do
        if [ -f "$hook" ]; then
            source "$hook"
        fi
    done
fi
exec "$this_dir"/AppRun.wrapped "$@"
EOF
chmod +x "$APPDIR/AppRun"

echo "▶ 6. Updating desktop metadata & categories..."
cat > "$APPDIR/usr/share/applications/Meowave.desktop" << 'EOF'
[Desktop Entry]
Name=Meowave
GenericName=Music Player
Comment=Fluid desktop streaming & local music player with DSP equalizer and spatial audio
Exec=meowave %U
Icon=meowave
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
MimeType=audio/mpeg;audio/flac;audio/ogg;audio/wav;audio/aac;audio/m4a;x-scheme-handler/meowave;
StartupWMClass=meowave
Keywords=music;player;stream;audio;yandex;spotify;soundcloud;
EOF

echo "▶ 7. Packaging final standalone AppImage..."
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/tauri"
APPIMAGE_PLUGIN="$CACHE_DIR/linuxdeploy-plugin-appimage.AppImage"
if [ ! -f "$APPIMAGE_PLUGIN" ]; then
    APPIMAGE_PLUGIN=$(find "${XDG_CACHE_HOME:-$HOME/.cache}" -name "linuxdeploy-plugin-appimage*.AppImage" 2>/dev/null | head -n 1)
fi

if [ -n "$APPIMAGE_PLUGIN" ] && [ -f "$APPIMAGE_PLUGIN" ]; then
    APPIMAGE_EXTRACT_AND_RUN=1 "$APPIMAGE_PLUGIN" --appdir "$APPDIR"
fi

OUTPUT_NAME="Meowave-x86_64.AppImage"
if [ ! -f "$ROOT_DIR/$OUTPUT_NAME" ]; then
    FOUND=$(find "$ROOT_DIR/src-tauri/target/release/bundle/appimage" "$ROOT_DIR" -maxdepth 1 -name "Meowave*.AppImage" 2>/dev/null | head -n 1)
    if [ -n "$FOUND" ] && [ -f "$FOUND" ]; then
        cp -f "$FOUND" "$ROOT_DIR/$OUTPUT_NAME"
    fi
fi

if [ -f "$ROOT_DIR/$OUTPUT_NAME" ]; then
    chmod +x "$ROOT_DIR/$OUTPUT_NAME"
    echo -e "\n✓ Сборка завершена успешно: $ROOT_DIR/$OUTPUT_NAME"
else
    echo -e "\n✗ Ошибка: AppImage не был создан!" >&2
    exit 1
fi
