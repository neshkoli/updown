#!/bin/bash

# Create DMG installer for UpDown
# This creates a distributable macOS disk image with the app

set -e

APP_NAME="updown"
APP_DISPLAY_NAME="UpDown"
VERSION="1.0.0"
DMG_NAME="UpDown-${VERSION}"
SOURCE_APP="build/bin/updown.app"
DMG_DIR="build/dmg"
DMG_TEMP="${DMG_DIR}/temp"
VOLUME_NAME="${APP_DISPLAY_NAME}"

echo "=== Creating DMG Installer for ${APP_DISPLAY_NAME} ==="
echo ""

# Check if app exists
if [ ! -d "$SOURCE_APP" ]; then
    echo "Error: App not found at $SOURCE_APP"
    echo "Please run ./build.sh first"
    exit 1
fi

# Clean up previous builds
echo "Cleaning up previous DMG builds..."
rm -rf "$DMG_DIR"
mkdir -p "$DMG_TEMP"

# Copy app to DMG staging directory
echo "Copying app to staging directory..."
cp -R "$SOURCE_APP" "$DMG_TEMP/"

# Create symbolic link to /Applications
echo "Creating Applications symlink..."
ln -s /Applications "$DMG_TEMP/Applications"

# Create a README file for the DMG
cat > "$DMG_TEMP/README.txt" << 'EOF'
UpDown - Markdown Viewer with Mermaid Support
=============================================

Installation:
1. Drag UpDown.app to the Applications folder
2. Open System Settings > Privacy & Security > Extensions
3. Enable "UpDown Quick Look" under Quick Look extensions
4. Press Space on any .md file to preview it!

Features:
- Beautiful Markdown rendering
- Mermaid diagram support
- PDF export
- Drag & drop files
- Quick Look preview in Finder

To open files with UpDown:
- Right-click any .md file
- Choose "Open With" > "UpDown"

For more information, visit:
https://github.com/neshkoli/updown
EOF

# Copy icon for DMG volume icon (optional but nice)
if [ -f "UpDown.png" ]; then
    echo "Adding volume icon..."
    # Convert PNG to icns for volume icon
    TEMP_ICONSET="$DMG_TEMP/.VolumeIcon.iconset"
    mkdir -p "$TEMP_ICONSET"
    sips -z 16 16 UpDown.png --out "$TEMP_ICONSET/icon_16x16.png" > /dev/null 2>&1
    sips -z 32 32 UpDown.png --out "$TEMP_ICONSET/icon_16x16@2x.png" > /dev/null 2>&1
    sips -z 32 32 UpDown.png --out "$TEMP_ICONSET/icon_32x32.png" > /dev/null 2>&1
    sips -z 64 64 UpDown.png --out "$TEMP_ICONSET/icon_32x32@2x.png" > /dev/null 2>&1
    sips -z 128 128 UpDown.png --out "$TEMP_ICONSET/icon_128x128.png" > /dev/null 2>&1
    sips -z 256 256 UpDown.png --out "$TEMP_ICONSET/icon_128x128@2x.png" > /dev/null 2>&1
    sips -z 256 256 UpDown.png --out "$TEMP_ICONSET/icon_256x256.png" > /dev/null 2>&1
    sips -z 512 512 UpDown.png --out "$TEMP_ICONSET/icon_256x256@2x.png" > /dev/null 2>&1
    sips -z 512 512 UpDown.png --out "$TEMP_ICONSET/icon_512x512.png" > /dev/null 2>&1
    sips -z 1024 1024 UpDown.png --out "$TEMP_ICONSET/icon_512x512@2x.png" > /dev/null 2>&1
    iconutil -c icns "$TEMP_ICONSET" -o "$DMG_TEMP/.VolumeIcon.icns" 2>/dev/null
    rm -rf "$TEMP_ICONSET"
fi

# Create DMG
echo ""
echo "Creating DMG..."
DMG_PATH="${DMG_DIR}/${DMG_NAME}.dmg"

# Use hdiutil to create the DMG
hdiutil create \
    -volname "${VOLUME_NAME}" \
    -srcfolder "$DMG_TEMP" \
    -ov \
    -format UDZO \
    -imagekey zlib-level=9 \
    "$DMG_PATH"

# Clean up temp directory
echo "Cleaning up..."
rm -rf "$DMG_TEMP"

echo ""
echo "=== DMG created successfully! ==="
echo "Location: $DMG_PATH"
echo ""
echo "File size:"
ls -lh "$DMG_PATH" | awk '{print $5, $9}'
echo ""
echo "To test the DMG:"
echo "  open $DMG_PATH"
echo ""
echo "To distribute:"
echo "  1. Test the DMG by mounting it and dragging to Applications"
echo "  2. Upload to GitHub releases or your distribution platform"
echo ""


