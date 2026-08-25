#!/bin/bash
#
# Build UpDown on this Mac and publish the DMG to a GitHub Release.
# JFrog Fly distribution is handled by .github/workflows/release.yml
# after the GitHub Release is published (no macOS compile on CI).
#
# Usage:
#   ./scripts/publish-release.sh           # build + create/upload release
#   ./scripts/publish-release.sh --skip-build   # upload an already-built DMG
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

SKIP_BUILD=0
if [ "${1:-}" = "--skip-build" ]; then
  SKIP_BUILD=1
fi

if [ "$(uname -s)" != "Darwin" ] && [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Error: the macOS app must be compiled on a Mac (or pass --skip-build with an existing DMG)."
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: GitHub CLI (gh) is required."
  exit 1
fi

VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
TAG="v$VERSION"

if [ "$SKIP_BUILD" -eq 0 ]; then
  ./scripts/build-release.sh
fi

DMG=$(echo src-tauri/target/release/bundle/dmg/UpDown_*_aarch64.dmg)
if [ ! -f "$DMG" ]; then
  echo "Error: DMG not found at src-tauri/target/release/bundle/dmg/UpDown_*_aarch64.dmg"
  exit 1
fi

echo "=== Publishing $DMG as GitHub Release $TAG ==="

if gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$DMG" --clobber
else
  gh release create "$TAG" "$DMG" \
    --title "UpDown $TAG" \
    --generate-notes
fi

echo ""
echo "GitHub Release $TAG is published with $(basename "$DMG")."
echo "CI will pick up the DMG and upload it to JFrog Fly (no Mac compile on the runner)."
