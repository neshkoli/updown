#!/bin/bash

# Complete build and packaging script
# Builds the app, creates DMG installer, and optionally opens it

set -e

echo "==================================="
echo "   UpDown - Complete Build"
echo "==================================="
echo ""

# Step 1: Build the app
echo "Step 1: Building application..."
./build.sh

# Step 2: Create DMG
echo ""
echo "Step 2: Creating DMG installer..."
./create_dmg.sh

echo ""
echo "==================================="
echo "   Build Complete!"
echo "==================================="
echo ""
echo "App: build/bin/updown.app"
echo "DMG: build/dmg/UpDown-1.0.0.dmg"
echo ""
echo "To test the DMG:"
echo "  open build/dmg/UpDown-1.0.0.dmg"
echo ""



