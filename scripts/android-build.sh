#!/usr/bin/env bash
# Release APK: build with Tauri, then sign with the local keystore.
#
# The keystore password is never stored in the repository. It is read from
# src-tauri/gen/android/keystore.env (written by scripts/android-rekey.sh,
# git-ignored) or from the environment:
#
#   export MEOWAVE_KEYSTORE_PASSWORD='…'          # required for signing
#   export MEOWAVE_KEY_PASSWORD='…'               # optional, defaults to the keystore password
#   export MEOWAVE_KEYSTORE=path/to/keystore.jks  # optional, defaults to src-tauri/gen/android/keystore.jks
#
# apksigner reads the values with `env:` so they never appear in `ps` output.
set -euo pipefail
cd "$(dirname "$0")/.."

# shellcheck source=/dev/null
source scripts/setup-android-env.sh
tauri android build --apk "$@"

out=src-tauri/gen/android/app/build/outputs/apk/universal/release
unsigned="$out/app-universal-release-unsigned.apk"
signed="$out/app-universal-release-signed.apk"
[ -f "$unsigned" ] || { echo "No unsigned release APK at $unsigned — nothing to sign."; exit 0; }

ks="${MEOWAVE_KEYSTORE:-src-tauri/gen/android/keystore.jks}"
# scripts/android-rekey.sh keeps the password next to the keystore (git-ignored)
envf="${MEOWAVE_KEYSTORE_ENV:-$(dirname "$ks")/keystore.env}"
if [ -z "${MEOWAVE_KEYSTORE_PASSWORD:-}" ] && [ -f "$envf" ]; then
  MEOWAVE_KEYSTORE_PASSWORD="$(sed -n 's/^MEOWAVE_KEYSTORE_PASSWORD=//p' "$envf")"
  MEOWAVE_KEYSTORE_PASSWORD="${MEOWAVE_KEYSTORE_PASSWORD%%$'\n'*}"
  export MEOWAVE_KEYSTORE_PASSWORD
fi
if [ -z "${MEOWAVE_KEYSTORE_PASSWORD:-}" ]; then
  echo "MEOWAVE_KEYSTORE_PASSWORD is not set — the APK was built but left unsigned:" >&2
  echo "  $unsigned" >&2
  exit 1
fi
[ -f "$ks" ] || { echo "Keystore not found: $ks (set MEOWAVE_KEYSTORE)" >&2; exit 1; }
export MEOWAVE_KEY_PASSWORD="${MEOWAVE_KEY_PASSWORD:-$MEOWAVE_KEYSTORE_PASSWORD}"

apksigner sign --ks "$ks" \
  --ks-pass env:MEOWAVE_KEYSTORE_PASSWORD \
  --key-pass env:MEOWAVE_KEY_PASSWORD \
  --out "$signed" "$unsigned"
echo "Signed: $signed"
