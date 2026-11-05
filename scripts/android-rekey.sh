#!/usr/bin/env bash
# Round 8 ("the Android key — change it yourself"): gives the local release
# keystore a new random password. The old one is in the git history, so it is
# no longer a secret. The key itself stays the same — APKs signed after this
# still update the ones already installed; only the password that unlocks the
# keystore changes.
#
#   bash scripts/android-rekey.sh      # asks for the current password once
#
# The new password is written next to the keystore, to keystore.env inside
# src-tauri/gen/ (git-ignored as a whole), and android-build.sh reads it from
# there, so nothing has to be exported by hand. Keep a copy somewhere safe: a
# lost password means a new key, and Android then refuses to update installed
# copies until they are uninstalled.
#
#   MEOWAVE_KEYSTORE=path/to/keystore.jks   # optional, defaults to src-tauri/gen/android/keystore.jks
#   MEOWAVE_KEYSTORE_PASSWORD='…'           # optional, the current password (else read from keystore.env or asked)
#   MEOWAVE_KEY_PASSWORD='…'                # optional, the current key password if it differs (JKS only)
#
# keytool takes every password through :env, so none shows up in `ps`.
set -euo pipefail
cd "$(dirname "$0")/.."

ks="${MEOWAVE_KEYSTORE:-src-tauri/gen/android/keystore.jks}"
envf="${MEOWAVE_KEYSTORE_ENV:-$(dirname "$ks")/keystore.env}"
command -v keytool >/dev/null || { echo "keytool not found — it comes with the JDK that Android builds already use (JAVA_HOME/bin)." >&2; exit 1; }
[ -f "$ks" ] || { echo "Keystore not found: $ks (set MEOWAVE_KEYSTORE)" >&2; exit 1; }

old="${MEOWAVE_KEYSTORE_PASSWORD:-}"
if [ -z "$old" ] && [ -f "$envf" ]; then old="$(sed -n 's/^MEOWAVE_KEYSTORE_PASSWORD=//p' "$envf")"; old="${old%%$'\n'*}"; fi
if [ -z "$old" ]; then read -r -s -p "Current keystore password: " old; echo; fi
export MW_KS_OLD="$old" MW_KEY_OLD="${MEOWAVE_KEY_PASSWORD:-$old}"

if ! list="$(keytool -list -v -keystore "$ks" -storepass:env MW_KS_OLD 2>&1)"; then
  echo "keytool could not open $ks — wrong password?" >&2; exit 1; fi
kind="$(printf '%s\n' "$list" | sed -n 's/^Keystore type: *//p')";kind="${kind%%$'\n'*}"
alias="$(printf '%s\n' "$list" | sed -n 's/^Alias name: *//p')";alias="${alias%%$'\n'*}"

new="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')";new="${new:0:32}"
[ "${#new}" -ge 24 ] || { echo "Could not generate a password." >&2; exit 1; }
export MW_KS_NEW="$new"

cp -p "$ks" "$ks.bak"
restore(){ mv -f "$ks.bak" "$ks"
  echo "Nothing changed: the keystore was restored from the backup." >&2
  echo "If the key has a password of its own, pass it as MEOWAVE_KEY_PASSWORD." >&2; }
trap 'restore' ERR
keytool -storepasswd -keystore "$ks" -storepass:env MW_KS_OLD -new:env MW_KS_NEW >/dev/null
# A PKCS12 store has one password for the store and its keys; a JKS key has
# its own, changed separately.
if [ "$(printf '%s' "$kind" | tr '[:lower:]' '[:upper:]')" != "PKCS12" ] && [ -n "$alias" ]; then
  keytool -keypasswd -alias "$alias" -keystore "$ks" -storepass:env MW_KS_NEW -keypass:env MW_KEY_OLD -new:env MW_KS_NEW >/dev/null
fi
keytool -list -keystore "$ks" -storepass:env MW_KS_NEW >/dev/null
trap - ERR

( umask 077; printf 'MEOWAVE_KEYSTORE_PASSWORD=%s\n' "$new" > "$envf" )
rm -f "$ks.bak"
echo "Done: $ks has a new password (alias ${alias:-?}, ${kind:-?})."
echo "It is saved in $envf — android-build.sh picks it up. Keep a copy in a password manager."
