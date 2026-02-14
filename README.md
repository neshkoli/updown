# UpDown v2.0

A lightweight, cross-platform Markdown viewer and editor built with [Tauri 2](https://tauri.app/) and vanilla JavaScript. Mac-first with native feel.

> **v2.0** — Complete rewrite. The original v1 was built with Wails/Go. This version is rebuilt from scratch with Tauri 2 + vanilla JS for a smaller footprint, richer editing features, and better maintainability.

## Features

- **Three view modes** — Source, Preview, and Split (side-by-side)
- **Markdown toolbar** — Bold, Italic, H1/H2/H3, Link, Image, Lists, Blockquote, Code Block, Horizontal Rule, Table
- **Live preview** — Rendered output updates as you type (debounced)
- **Bidirectional text** — Paragraphs with predominantly Hebrew characters automatically align right-to-left; otherwise left-to-right
- **Folder panel** — Browsable sidebar listing markdown files and folders, with drag-to-resize and persistent state
- **File operations** — New, Open, Save, Save As via toolbar or native dialogs
- **Drag and drop** — Drop `.md` files onto the window to open them
- **Autosave** — Automatically saves changes after a short idle period (when a file is open)
- **Dirty indicator** — Window title shows `*` when there are unsaved changes
- **Quick Look** — Press Space on any `.md` file in Finder to see a formatted preview (macOS; installs via menu or first-run prompt)

## Tech Stack

| Layer     | Technology |
|-----------|------------|
| Shell     | Tauri 2.0 (Rust + system WebView) |
| Frontend  | Vanilla HTML / CSS / JavaScript (ES Modules) |
| Markdown  | [markdown-it](https://github.com/markdown-it/markdown-it) |
| Icons     | [Lucide](https://lucide.dev/) (inline SVG) |
| Testing   | [Vitest](https://vitest.dev/) + [happy-dom](https://github.com/nicedayfor/happy-dom) |

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- Tauri CLI: `npm install -g @tauri-apps/cli`

## Getting Started

```bash
# Install dependencies
npm install

# Run in development mode
npx tauri dev

# Run tests
npm test

# Build for production
npx tauri build
```

To include the Quick Look plugin in the macOS build (requires Xcode):

```bash
# Build the Quick Look generator (copies to src-tauri/resources/)
npm run build:ql

# Then build the app as usual
npx tauri build
```

The production build outputs:
- **macOS**: `src-tauri/target/release/bundle/macos/UpDown.app`
- **DMG**: `src-tauri/target/release/bundle/dmg/UpDown_2.0.0_aarch64.dmg`

## Quick Look (macOS)

UpDown includes a Quick Look generator that lets you preview Markdown files by pressing **Space** in Finder — no need to open the full app.

- **Install**: On first launch, UpDown offers to install the Quick Look plugin. You can also install it later from **File > Install Quick Look Plugin…**
- **How it works**: The plugin is installed to `~/Library/QuickLook/` and uses the same markdown-it renderer (via JavaScriptCore) and CSS styles as the in-app preview, including RTL/bidi support.
- **Uninstall**: Delete `~/Library/QuickLook/UpDownMarkdown.qlgenerator` and run `qlmanage -r` in Terminal.

## Project Structure

```
updown/
├── src/                    # Frontend (served by Tauri WebView)
│   ├── index.html          # Main HTML with toolbar
│   ├── main.js             # Entry point, wires modules together
│   ├── editor-ui.js        # Toolbar and view mode logic
│   ├── md-commands.js      # Markdown formatting commands
│   ├── render.js           # Markdown rendering with markdown-it
│   ├── bidi.js             # Bidirectional text detection
│   ├── file-ops.js         # File open/save/dirty tracking
│   ├── autosave.js         # Debounced autosave on edit
│   ├── drag-drop.js        # Drag-and-drop file opening
│   ├── folder-panel.js     # Folder browser sidebar
│   ├── utils.js            # Shared utilities (debounce)
│   ├── css/
│   │   ├── main.css        # App layout and toolbar styles
│   │   └── markdown.css    # Rendered markdown styles
│   └── lib/
│       └── markdown-it.min.js
├── src-tauri/              # Tauri / Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   └── lib.rs          # Plugin init, menu, Quick Look install command
│   ├── capabilities/
│   │   └── default.json    # Permissions (fs, dialog, process)
│   ├── resources/          # Built Quick Look plugin (bundled into app)
│   ├── tauri.conf.json     # App config (window, bundle, etc.)
│   ├── Cargo.toml
│   └── icons/              # App icons for all platforms
├── qlgenerator/            # macOS Quick Look generator (Xcode project)
│   ├── UpDownMarkdown.xcodeproj
│   └── UpDownMarkdown/
│       ├── main.c          # CFPlugin boilerplate
│       ├── GeneratePreviewForURL.m  # Preview via JSC + markdown-it
│       ├── GenerateThumbnailForURL.m
│       ├── Info.plist
│       └── Resources/
│           ├── markdown-it.min.js
│           ├── bidi.js     # RTL/bidi for HTML strings
│           └── preview.css # Markdown styles (adapted from app)
├── scripts/
│   └── build-qlgenerator.sh  # Build & copy QL plugin
├── test/                   # Vitest unit tests
│   ├── editor-ui.test.js
│   ├── md-commands.test.js
│   ├── render.test.js
│   ├── bidi.test.js
│   ├── file-ops.test.js
│   ├── autosave.test.js
│   ├── drag-drop.test.js
│   └── folder-panel.test.js
├── package.json
├── vitest.config.js
└── UpDown.png              # App icon source
```

## Author

Developed by [neshkoli](https://github.com/neshkoli)

GitHub: [https://github.com/neshkoli/updown](https://github.com/neshkoli/updown)

## License

MIT
