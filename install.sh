#!/usr/bin/env bash
# ==============================================================================
# Meowave - Universal Linux Installer
# Installs Meowave AppImage into ~/.local/bin and integrates into desktop menu
# ==============================================================================
set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
CYAN="\033[0;36m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  __  __                                     "
echo " |  \/  | ___  _____      ____ ___   _____   "
echo " | |\/| |/ _ \/ _ \ \ /\ / / _\` \ \ / / _ \  "
echo " | |  | |  __/ (_) \ V  V / (_| |\ V /  __/  "
echo " |_|  |_|\___|\___/ \_/\_/ \__,_| \_/ \___|  "
echo -e "${RESET}"
echo -e "${BOLD}Универсальный установщик Meowave для Linux${RESET}\n"

BIN_DIR="${HOME}/.local/bin"
APPS_DIR="${HOME}/.local/share/applications"
ICONS_DIR="${HOME}/.local/share/icons/hicolor/512x512/apps"
TARGET_BIN="${BIN_DIR}/meowave"
TARGET_DESKTOP="${APPS_DIR}/meowave.desktop"
TARGET_ICON="${ICONS_DIR}/meowave.png"

mkdir -p "${BIN_DIR}" "${APPS_DIR}" "${ICONS_DIR}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_APPIMAGE=""

if [ -f "${SCRIPT_DIR}/Meowave-x86_64.AppImage" ]; then
    LOCAL_APPIMAGE="${SCRIPT_DIR}/Meowave-x86_64.AppImage"
else
    FOUND_APPIMAGE="$(find "${SCRIPT_DIR}/src-tauri/target/release/bundle/appimage" "${SCRIPT_DIR}" -maxdepth 1 -name "Meowave*.AppImage" 2>/dev/null | head -n 1)"
    if [ -n "${FOUND_APPIMAGE}" ] && [ -f "${FOUND_APPIMAGE}" ]; then
        LOCAL_APPIMAGE="${FOUND_APPIMAGE}"
    fi
fi

if [ -n "${LOCAL_APPIMAGE}" ]; then
    echo -e "${CYAN}▶ Копирование локального AppImage...${RESET}"
    cp -f "${LOCAL_APPIMAGE}" "${TARGET_BIN}.tmp"
    chmod +x "${TARGET_BIN}.tmp"
    mv -f "${TARGET_BIN}.tmp" "${TARGET_BIN}"
else
    DOWNLOAD_URL="https://github.com/kotar1223/meowave/releases/latest/download/Meowave-x86_64.AppImage"
    echo -e "${CYAN}▶ Загрузка последнего релиза Meowave с GitHub...${RESET}"
    if command -v curl >/dev/null 2>&1; then
        curl -fSL --progress-bar "${DOWNLOAD_URL}" -o "${TARGET_BIN}.tmp"
    elif command -v wget >/dev/null 2>&1; then
        wget -q --show-progress "${DOWNLOAD_URL}" -O "${TARGET_BIN}.tmp"
    else
        echo -e "${RED}Ошибка: требуется curl или wget для загрузки.${RESET}" >&2
        exit 1
    fi
    chmod +x "${TARGET_BIN}.tmp"
    mv -f "${TARGET_BIN}.tmp" "${TARGET_BIN}"
fi

echo -e "${CYAN}▶ Настройка интеграции с рабочим столом...${RESET}"

# Install icon
if [ -f "${SCRIPT_DIR}/src-tauri/icons/128x128@2x.png" ]; then
    cp -f "${SCRIPT_DIR}/src-tauri/icons/128x128@2x.png" "${TARGET_ICON}"
elif [ -f "${SCRIPT_DIR}/src-tauri/icons/128x128.png" ]; then
    cp -f "${SCRIPT_DIR}/src-tauri/icons/128x128.png" "${TARGET_ICON}"
fi

# Create desktop entry
cat > "${TARGET_DESKTOP}" << EOF
[Desktop Entry]
Name=Meowave
GenericName=Music Player
Comment=Fluid desktop streaming & local music player with DSP equalizer and spatial audio
Exec=${TARGET_BIN} %U
Icon=${TARGET_ICON}
Terminal=false
Type=Application
Categories=AudioVideo;Audio;Player;
MimeType=audio/mpeg;audio/flac;audio/ogg;audio/wav;audio/aac;audio/m4a;x-scheme-handler/meowave;
StartupWMClass=meowave
Keywords=music;player;stream;audio;yandex;spotify;soundcloud;
EOF

chmod +x "${TARGET_DESKTOP}"

# Refresh databases
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "${APPS_DIR}" 2>/dev/null || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -f -t "${HOME}/.local/share/icons/hicolor" 2>/dev/null || true

# Check PATH
PATH_NOTE=""
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    PATH_NOTE="\n${YELLOW}Примечание:${RESET} Директория ${BIN_DIR} не добавлена в переменную PATH вашего шелла.\nВы можете запускать приложение из меню или добавить её в ~/.bashrc:\n  export PATH=\"\$HOME/.local/bin:\$PATH\""
fi

echo -e "\n${GREEN}${BOLD}✓ Установка успешно завершена!${RESET}"
echo -e "  • Исполняемый файл: ${CYAN}${TARGET_BIN}${RESET}"
echo -e "  • Ярлык меню:       ${CYAN}${TARGET_DESKTOP}${RESET}"
echo -e "  • Иконка:           ${CYAN}${TARGET_ICON}${RESET}"
if [ -n "${PATH_NOTE}" ]; then
    echo -e "${PATH_NOTE}"
fi

echo -e "\nДля запуска просто введите: ${BOLD}meowave${RESET} или найдите Meowave в меню приложений.\n"

command -v notify-send >/dev/null 2>&1 && notify-send "Meowave" "Успешно установлено в систему!" -i meowave 2>/dev/null || true
