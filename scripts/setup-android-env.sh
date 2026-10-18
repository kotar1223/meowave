#!/usr/bin/env bash
# Meowave Android Environment Setup
export JAVA_HOME="/home/kotyar/.local/share/mise/installs/java/21.0.2"
export ANDROID_HOME="/home/kotyar/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export ANDROID_AVD_HOME="/home/kotyar/.config/.android/avd"
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
export PATH="/home/kotyar/meowave/node_modules/.bin:$ANDROID_HOME/emulator:$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/35.0.0:$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH"
