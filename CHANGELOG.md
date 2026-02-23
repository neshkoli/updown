# Changelog

## [2.0.3] – 2026-02-23

### What's New

#### Mermaid Diagram Support
- Render `mermaid` fenced code blocks as live SVG diagrams in the preview
- Supports flowcharts, sequence diagrams, class diagrams, pie charts, git graphs, state diagrams, and more
- Bundled `mermaid.min.js` locally — no internet connection required
- Added `mermaid-sample.md` to the project root as a reference for all supported diagram types

#### Preview Zoom Controls
- New **+** and **−** toolbar buttons to zoom the preview in 10% steps
- Zoom range: 50% – 200%, default 100%
- Live zoom level label between the buttons (e.g. "130%")
- Zoom applies to both rendered text **and** Mermaid diagrams
- Buttons are hidden in Source-only view (zoom only affects the preview pane)

#### Table Column Alignment
- Markdown column alignment syntax now renders correctly in the preview:
  - `:---` or `---` → left (browser default)
  - `:---:` → centered
  - `---:` → right-aligned
- Fixed: the bidi (RTL/Hebrew) engine was silently overwriting column alignment styles on every render; table cells now preserve their markdown-defined alignment while still correctly detecting Hebrew RTL content

---

## [2.0.2] – 2026-02-09

- Favicon added
- Gatekeeper / unnotarized app documentation clarified

## [2.0.1] – earlier

- Metadata panel: frontmatter displayed in a bottom panel
- Quick Look plugin for macOS Finder (Space key preview)
- Window title reflects the open filename
- Support for internal anchor links and external link handling

## [2.0.0] – initial

- Complete rewrite with Tauri 2 + vanilla JS
- Split / source / preview view modes
- Live markdown preview with markdown-it
- Bidirectional text support (Hebrew / RTL)
- Drag-and-drop to open files
- Autosave
- Folder panel
