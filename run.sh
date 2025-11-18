#!/bin/bash

# Run the app from terminal so logs are visible

cd "$(dirname "$0")"

# Check if app exists
if [ ! -f "./build/bin/updown.app/Contents/MacOS/updown" ]; then
    echo "Error: App not found. Run './build.sh' first."
    exit 1
fi

# Run the built app from terminal with output visible
echo "Starting UpDown..."
echo "Logs will appear below. Press Ctrl+C to stop."
echo ""

./build/bin/updown.app/Contents/MacOS/updown "$@"

