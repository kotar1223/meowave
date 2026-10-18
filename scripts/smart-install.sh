#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/setup-android-env.sh"

DEVICE="$1"

# Получаем список подключенных устройств
DEVICES=($(adb devices | grep -v "List" | awk '{print $1}' | grep -v '^$'))

if [ ${#DEVICES[@]} -eq 0 ]; then
    echo "❌ Ошибка: Нет подключенных устройств или эмуляторов."
    echo "Запустите эмулятор: npm run android:emulator"
    echo "Или подключите телефон по USB с включенной отладкой."
    exit 1
fi

if [ -z "$DEVICE" ]; then
    if [ ${#DEVICES[@]} -eq 1 ]; then
        DEVICE="${DEVICES[0]}"
    else
        # Если запущен эмулятор, выбираем его по умолчанию
        EMU=$(printf '%s\n' "${DEVICES[@]}" | grep "emulator-" | head -n 1 || true)
        if [ -n "$EMU" ]; then
            DEVICE="$EMU"
            echo "ℹ️ Обнаружено несколько устройств, выбран эмулятор: $DEVICE"
        else
            DEVICE="${DEVICES[0]}"
            echo "ℹ️ Обнаружено несколько устройств, выбрано: $DEVICE"
        fi
    fi
fi

ABI=$(adb -s "$DEVICE" shell getprop ro.product.cpu.abi | tr -d '\r')
echo "📲 Целевое устройство: $DEVICE (Архитектура: $ABI)"

if [[ "$ABI" == "x86_64"* ]]; then
    TARGET="x86_64"
elif [[ "$ABI" == "arm64"* ]]; then
    TARGET="aarch64"
elif [[ "$ABI" == "armeabi"* ]]; then
    TARGET="armv7"
else
    TARGET="aarch64"
fi

APK="src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk"

# Проверяем, содержит ли уже собранный APK нужную архитектуру
HAS_ABI=false
if [ -f "$APK" ]; then
    if unzip -l "$APK" 2>/dev/null | grep -q "lib/$ABI/"; then
        HAS_ABI=true
    fi
fi

if [ "$HAS_ABI" = false ]; then
    echo "🔨 Сборка debug APK под $TARGET..."
    tauri android build --apk --target "$TARGET" --debug
fi

echo "📦 Установка $APK на $DEVICE..."
adb -s "$DEVICE" install -r "$APK"

echo "🚀 Запуск Meowave на $DEVICE..."
adb -s "$DEVICE" shell monkey -p app.meowave.desktop -c android.intent.category.LAUNCHER 1
echo "✅ Готово!"
