#!/bin/bash
#
# Full release build for UpDown (macOS).
# 1. Builds the Quick Look plugin so it is bundled inside the app.
# 2. Builds the Tauri app and DMG.
#
# Prerequisites: Node.js, Rust, Xcode command-line tools
# Usage: ./scripts/build-release.sh
#
# Artifacts (after a successful run):
#   - .app:  src-tauri/target/release/bundle/macos/UpDown.app
#   - .dmg:  src-tauri/target/release/bundle/dmg/UpDown_<version>_aarch64.dmg
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "=== Step 1: Build Quick Look plugin ==="
./scripts/build-qlgenerator.sh

echo ""
echo "=== Step 2: Build Tauri app and DMG ==="
# CI=1 in GitHub Actions can break the build; the workflow unsets it or passes TAURI_CI=false
npx tauri build

echo ""
echo "=== Release build complete ==="
echo "  .app: src-tauri/target/release/bundle/macos/UpDown.app"
echo "  .dmg: src-tauri/target/release/bundle/dmg/UpDown_*_aarch64.dmg"
