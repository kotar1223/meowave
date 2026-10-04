#!/bin/bash
set -e

echo "=== Meowave iOS Rust Build Phase Stub ==="
echo "SRCROOT: ${SRCROOT:-unset}"
echo "BUILT_PRODUCTS_DIR: ${BUILT_PRODUCTS_DIR:-unset}"
echo "CONFIGURATION: ${CONFIGURATION:-unset}"
echo "ARCHS: ${ARCHS:-unset}"

if [ -n "$BUILT_PRODUCTS_DIR" ]; then
  mkdir -p "$BUILT_PRODUCTS_DIR"
fi

LIB=$(find "${SRCROOT}/../.." /Users/runner/work -name "libmeowave_lib.a" 2>/dev/null | grep "aarch64-apple-ios/release" | head -n 1)

if [ -z "$LIB" ]; then
  LIB=$(find /Users/runner/work -name "libmeowave_lib.a" 2>/dev/null | head -n 1)
fi

if [ -n "$LIB" ]; then
  echo "Found precompiled Rust library at: $LIB"
  if [ -n "$BUILT_PRODUCTS_DIR" ]; then
    cp -fv "$LIB" "$BUILT_PRODUCTS_DIR/libapp.a"
    cp -fv "$LIB" "$BUILT_PRODUCTS_DIR/libmeowave_lib.a"
    cp -fv "$LIB" "$BUILT_PRODUCTS_DIR/libmeowave.a"
  fi
  if [ -n "$SRCROOT" ]; then
    for conf in release Release debug Debug; do
      EXT_DIR="${SRCROOT}/Externals/${ARCHS:-arm64}/$conf"
      mkdir -p "$EXT_DIR"
      cp -f "$LIB" "$EXT_DIR/libapp.a" 2>/dev/null || true
      cp -f "$LIB" "$EXT_DIR/libmeowave_lib.a" 2>/dev/null || true
      cp -f "$LIB" "$EXT_DIR/libmeowave.a" 2>/dev/null || true
    done
  fi
else
  echo "Warning: libmeowave_lib.a not found during build phase"
fi

echo "Rust build phase completed successfully."
exit 0
