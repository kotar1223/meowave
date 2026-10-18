#!/usr/bin/env bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/setup-android-env.sh"

export QT_QPA_PLATFORM=xcb

AVD_NAME="MeowavePhone"

# Check if emulator is already running
if adb devices | grep -q "emulator-"; then
    echo "Emulator is already running:"
    adb devices
    exit 0
fi

echo "Starting Android emulator ($AVD_NAME)..."
exec emulator -avd "$AVD_NAME" -no-snapshot -gpu auto "$@"
