# Quick Look Integration for UpDown

## Overview

To enable Quick Look previews for Markdown files in macOS Finder (pressing Space to preview), we need to create a Quick Look extension. This document outlines the requirements and implementation approach.

## Quick Look Architecture

macOS Quick Look supports two types of extensions:

1. **QLGenerator** (Legacy, but still supported)
   - Bundle with `.qlgenerator` extension
   - Written in Objective-C/C
   - Installed in `~/Library/QuickLook/` or `/Library/QuickLook/`
   - Uses `QLPreviewRequest` API

2. **Quick Look Extension** (Modern)
   - App Extension bundled with an app
   - Written in Swift
   - Distributed via App Store or direct installation
   - Uses `QLPreviewProvider` protocol

## Requirements

### File Type Registration

We need to register for these Uniform Type Identifiers (UTIs):
- `net.daringfireball.markdown` - Standard Markdown
- `public.plain-text` - Plain text files (for .txt)
- `public.text` - Generic text files

### Preview Generation

The extension must:
1. Read the Markdown file content
2. Render it to HTML (using goldmark, same as main app)
3. Return styled HTML for Quick Look display
4. Support Mermaid diagrams (optional, but nice to have)
5. Handle relative image paths

### Installation

The Quick Look generator needs to be:
1. Built as a `.qlgenerator` bundle
2. Installed to `~/Library/QuickLook/` (user) or `/Library/QuickLook/` (system)
3. Registered with: `qlmanage -r`
4. Enabled in System Settings > Extensions > Quick Look

## Implementation Options

### Option 1: Standalone QLGenerator (Recommended)

Create a separate Quick Look generator that:
- Uses CGO to call Go code (goldmark rendering)
- Bundled as `.qlgenerator`
- Can be installed independently
- Shares rendering logic with main app

**Pros:**
- Works independently of main app
- Can be distributed separately
- Standard macOS approach

**Cons:**
- Requires CGO bridge
- Separate build process
- Objective-C/Swift wrapper needed

### Option 2: App Extension (Modern)

Create a Quick Look Extension:
- Bundled with UpDown.app
- Written in Swift
- Uses shared framework for rendering

**Pros:**
- Modern approach
- Bundled with app
- Better integration

**Cons:**
- Requires Xcode project setup
- More complex build process
- Swift/Objective-C code needed

### Option 3: Hybrid Approach

Create a standalone `.qlgenerator` that:
- Uses a shared Go library for rendering
- Can be built separately or bundled
- Installed via build script

## Recommended Implementation

**Option 1 (Standalone QLGenerator)** is recommended because:
1. Works independently - users can install Quick Look without the full app
2. Standard approach - follows macOS conventions
3. Reuses existing Go code via CGO
4. Easier distribution

## Implementation Steps

1. **Create QLGenerator Structure**
   - `UpDown.qlgenerator/Contents/Info.plist` - Bundle metadata
   - `UpDown.qlgenerator/Contents/MacOS/UpDown` - Executable
   - Register for Markdown UTIs

2. **Create CGO Bridge**
   - Go function to render Markdown to HTML
   - C wrapper to call from Objective-C
   - Export as shared library

3. **Create Objective-C Generator**
   - Implement `GeneratePreviewForURL` function
   - Call Go rendering function
   - Return HTML to Quick Look

4. **Build Process**
   - Build Go library with CGO
   - Compile Objective-C code
   - Bundle as `.qlgenerator`
   - Install script

5. **Installation**
   - Copy to `~/Library/QuickLook/`
   - Run `qlmanage -r`
   - Verify in System Settings

## File Structure

```
updown/
├── qlgenerator/              # Quick Look generator
│   ├── main.go              # Go rendering code (shared with app)
│   ├── bridge.go            # CGO bridge
│   ├── generator.m          # Objective-C Quick Look generator
│   ├── Info.plist           # Bundle metadata
│   └── Makefile             # Build script
├── build.sh                  # Updated to build QL generator
└── install_ql.sh            # Installation script
```

## Next Steps

1. Create the QLGenerator bundle structure
2. Implement CGO bridge for Go rendering
3. Create Objective-C wrapper
4. Update build scripts
5. Test installation and preview

