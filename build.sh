#!/bin/bash

# Build script for UpDown that handles icon conversion

set -e

echo "=== Building UpDown ==="
echo ""

# Step 1: Convert PNG to .icns if needed
if [ ! -f "build/icon.icns" ] || [ "UpDown.png" -nt "build/icon.icns" ]; then
    echo "Converting icon..."
    mkdir -p build
    
    # Create iconset directory
    ICONSET="build/icon.iconset"
    mkdir -p "$ICONSET"
    
    # Generate different sizes
    sips -z 16 16 UpDown.png --out "$ICONSET/icon_16x16.png"
    sips -z 32 32 UpDown.png --out "$ICONSET/icon_16x16@2x.png"
    sips -z 32 32 UpDown.png --out "$ICONSET/icon_32x32.png"
    sips -z 64 64 UpDown.png --out "$ICONSET/icon_32x32@2x.png"
    sips -z 128 128 UpDown.png --out "$ICONSET/icon_128x128.png"
    sips -z 256 256 UpDown.png --out "$ICONSET/icon_128x128@2x.png"
    sips -z 256 256 UpDown.png --out "$ICONSET/icon_256x256.png"
    sips -z 512 512 UpDown.png --out "$ICONSET/icon_256x256@2x.png"
    sips -z 512 512 UpDown.png --out "$ICONSET/icon_512x512.png"
    sips -z 1024 1024 UpDown.png --out "$ICONSET/icon_512x512@2x.png"
    
    # Convert to icns
    iconutil -c icns "$ICONSET" -o build/icon.icns
    
    # Clean up iconset
    rm -rf "$ICONSET"
else
    echo "Icon already up to date"
fi

# Step 2: Build with Wails (this generates wailsjs files)
echo ""
echo "Building application..."
wails build

# Step 3: Copy wailsjs files to dist directory so they're embedded in future builds
# Wails generates these files during build, so we copy them after for next time
if [ -d "frontend/wailsjs" ]; then
    echo "Copying wailsjs files to dist for future builds..."
    rm -rf frontend/dist/wailsjs
    cp -r frontend/wailsjs frontend/dist/
fi

# Step 4: Copy icon to app bundle
echo ""
echo "Installing custom icon..."
if [ -f "build/icon.icns" ] && [ -d "build/bin/updown.app/Contents/Resources" ]; then
    cp build/icon.icns build/bin/updown.app/Contents/Resources/icon.icns
fi

echo ""
echo "=== Build complete! ==="
echo "App location: build/bin/updown.app"
echo ""
echo "To clear icon cache (if icon doesn't update):"
echo "  killall Finder"
echo "  killall Dock"

