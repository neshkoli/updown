#!/bin/bash

# Build script for UpDown that handles icon conversion

set -e

echo "=== Building UpDown ==="
echo ""

# Step 1: Convert PNG to .icns if needed
if [ ! -f "build/icon.icns" ] || [ "UpDown.png" -nt "build/icon.icns" ]; then
    echo "Converting icon..."
    ./convert_icon.sh
else
    echo "Icon already up to date"
fi

# Step 2: Build with Wails
echo ""
echo "Building application..."
wails build

# Step 3: Copy icon to app bundle
echo ""
echo "Installing custom icon..."
./fix_icon.sh

echo ""
echo "=== Build complete! ==="
echo "App location: build/bin/updown.app"
echo ""
echo "To clear icon cache (if icon doesn't update):"
echo "  killall Finder"
echo "  killall Dock"

