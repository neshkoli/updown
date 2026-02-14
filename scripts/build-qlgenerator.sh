#!/bin/bash
#
# Build the UpDown Quick Look Preview Extension (host app + appex).
# Produces UpDownQuickLook.app with the embedded QL extension.
#
# Prerequisites: Xcode command-line tools
# Usage: ./scripts/build-qlgenerator.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
QL_DIR="$ROOT_DIR/qlgenerator"
BUILD_DIR="$QL_DIR/build"
OUTPUT_DIR="$ROOT_DIR/src-tauri/resources"

echo "Building UpDownQuickLook.app with Quick Look Preview Extension..."

xcodebuild \
  -project "$QL_DIR/UpDownQuickLook.xcodeproj" \
  -scheme UpDownQuickLook \
  -configuration Release \
  SYMROOT="$BUILD_DIR" \
  -quiet 2>&1

PRODUCT="$BUILD_DIR/Release/UpDownQuickLook.app"

if [ ! -d "$PRODUCT" ]; then
  echo "Error: Build product not found at $PRODUCT"
  exit 1
fi

# Verify extension is embedded
if [ ! -d "$PRODUCT/Contents/PlugIns/UpDownPreview.appex" ]; then
  echo "Error: Extension not found embedded in app bundle"
  exit 1
fi

# Copy to Tauri resources
mkdir -p "$OUTPUT_DIR"
rm -rf "$OUTPUT_DIR/UpDownQuickLook.app"
cp -R "$PRODUCT" "$OUTPUT_DIR/UpDownQuickLook.app"

echo "Copied UpDownQuickLook.app to $OUTPUT_DIR/"
echo "Done."
