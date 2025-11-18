package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
	"go.abhg.dev/goldmark/mermaid"
)

// App struct
type App struct {
	ctx         context.Context
	filePath    string
	markdown    goldmark.Markdown
	basePath    string
	startupFile string // File to load on startup (from command line)
}

// NewApp creates a new App application struct
func NewApp() *App {
	// Configure goldmark with extensions
	md := goldmark.New(
		goldmark.WithExtensions(
			extension.GFM,
			extension.DefinitionList,
			extension.Footnote,
			extension.Typographer,
			&mermaid.Extender{},
		),
		goldmark.WithParserOptions(
			parser.WithAutoHeadingID(),
		),
		goldmark.WithRendererOptions(
			html.WithHardWraps(),
			html.WithXHTML(),
		),
	)

	return &App{
		markdown: md,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) OnStartup(ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Panic in OnStartup: %v\n", r)
		}
	}()

	a.ctx = ctx

	// Store file path from command line to load after DOM is ready
	// Filter out Wails-specific arguments (flags starting with -)
	// Also skip the executable name itself
	if len(os.Args) > 1 {
		for i := 1; i < len(os.Args); i++ {
			arg := os.Args[i]
			// Skip Wails flags and arguments
			if strings.HasPrefix(arg, "-") {
				continue
			}
			// Skip if it's the executable path
			if arg == os.Args[0] {
				continue
			}
			// This should be the file path
			// Resolve to absolute path
			if absPath, err := filepath.Abs(arg); err == nil {
				// Check if it's actually a file
				if info, err := os.Stat(absPath); err == nil && !info.IsDir() {
					// Check if it's a markdown file
					ext := strings.ToLower(filepath.Ext(absPath))
					if ext == ".md" || ext == ".markdown" || ext == ".txt" {
						a.startupFile = absPath
						fmt.Printf("Startup file to load: %q\n", a.startupFile)
						break
					}
				}
			}
		}
	}
}

// RenderMarkdown renders markdown content to HTML
func (a *App) RenderMarkdown(content string) (string, error) {
	htmlContent, err := a.renderMarkdown([]byte(content), a.basePath)
	if err != nil {
		return "", err
	}
	return htmlContent, nil
}

// LoadFile opens a file dialog and loads the selected markdown file
func (a *App) LoadFile(filePath string) error {
	// Ensure context is available
	if a.ctx == nil {
		return fmt.Errorf("application context not initialized")
	}

	// If filePath is empty, show file dialog
	if filePath == "" {
		selection, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
			Title: "Open Markdown File",
			Filters: []runtime.FileFilter{
				{
					DisplayName: "Markdown Files",
					Pattern:     "*.md;*.markdown;*.txt",
				},
			},
		})
		if err != nil {
			return err
		}
		if selection == "" {
			return nil // User cancelled
		}
		filePath = selection
	}

	// Log the received path for debugging
	originalPath := filePath
	fmt.Printf("LoadFile called with path: %q\n", filePath)

	// Resolve to absolute path (handles relative paths from drag and drop)
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("failed to resolve file path %q: %w", filePath, err)
	}
	filePath = absPath
	fmt.Printf("Resolved to absolute path: %q (original: %q)\n", filePath, originalPath)

	// Try to read the file directly - os.ReadFile will provide the best error message
	// if the file doesn't exist or can't be read
	content, err := os.ReadFile(filePath)
	if err != nil {
		// Provide helpful error message with context
		if os.IsNotExist(err) {
			wd, _ := os.Getwd()
			// Check if original path was just a filename (no directory separator)
			isJustFilename := !filepath.IsAbs(originalPath) && filepath.Dir(originalPath) == "."

			if isJustFilename {
				return fmt.Errorf("file does not exist: %q (Wails provided only filename, resolved relative to: %q). Please ensure Wails provides full absolute paths.",
					filePath, wd)
			}
			return fmt.Errorf("file does not exist: %q (resolved from: %q). Current working directory: %q",
				filePath, originalPath, wd)
		}
		return fmt.Errorf("failed to read file %q: %w", filePath, err)
	}

	basePath := filepath.Dir(filePath)
	a.basePath = basePath
	a.filePath = filePath

	// Render and send to frontend
	htmlContent, err := a.renderMarkdown(content, basePath)
	if err != nil {
		return err
	}

	// Send rendered HTML to frontend via event (full HTML document)
	runtime.EventsEmit(a.ctx, "markdown-rendered", htmlContent)

	// Start watching for file changes
	go a.watchFile()

	return nil
}

// ExportPDF exports the current content as PDF
func (a *App) ExportPDF() error {
	selection, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "Export as PDF",
		DefaultFilename: "exported.pdf",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "PDF Files",
				Pattern:     "*.pdf",
			},
		},
	})
	if err != nil {
		return err
	}
	if selection == "" {
		return nil // User cancelled
	}

	// Trigger PDF export in frontend with the selected file path
	runtime.EventsEmit(a.ctx, "export-pdf", selection)
	return nil
}

// SavePDF saves a PDF file from base64 encoded data
func (a *App) SavePDF(filePath string, base64Data string) error {
	if a.ctx == nil {
		return fmt.Errorf("application context not initialized")
	}

	// Decode base64 data
	pdfData, err := base64.StdEncoding.DecodeString(base64Data)
	if err != nil {
		return fmt.Errorf("failed to decode base64 PDF data: %w", err)
	}

	// Resolve to absolute path
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		return fmt.Errorf("failed to resolve file path: %w", err)
	}
	filePath = absPath

	// Write PDF file
	if err := os.WriteFile(filePath, pdfData, 0644); err != nil {
		return fmt.Errorf("failed to write PDF file: %w", err)
	}

	fmt.Printf("PDF saved successfully to: %s (%d bytes)\n", filePath, len(pdfData))
	return nil
}

// OnDomReady is called when the DOM is ready
func (a *App) OnDomReady(ctx context.Context) {
	// Ensure context is set
	a.ctx = ctx

	// Set up event listeners
	runtime.EventsOn(ctx, "markdown-rendered", func(optionalData ...interface{}) {
		// This is handled in the frontend
	})

	// Listen for file drop events from frontend
	runtime.EventsOn(ctx, "file-dropped", func(optionalData ...interface{}) {
		fmt.Printf("file-dropped event received, data: %v (type: %T)\n", optionalData, optionalData)
		if len(optionalData) > 0 {
			if filePath, ok := optionalData[0].(string); ok && filePath != "" {
				fmt.Printf("Loading dropped file (raw path): %q\n", filePath)
				// Load the dropped file
				if err := a.LoadFile(filePath); err != nil {
					fmt.Printf("Error loading file: %v\n", err)
					// Show error message - use ctx from closure
					runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
						Type:    runtime.ErrorDialog,
						Title:   "Error Loading File",
						Message: fmt.Sprintf("Failed to load file: %v", err),
					})
				} else {
					fmt.Printf("File loaded successfully: %s\n", filePath)
				}
			} else {
				fmt.Printf("Invalid file path in event data: %v (type: %T)\n", optionalData[0], optionalData[0])
			}
		} else {
			fmt.Printf("No data in file-dropped event\n")
		}
	})

	// Load startup file if one was provided via command line
	if a.startupFile != "" {
		fmt.Printf("Loading startup file: %q\n", a.startupFile)
		// Use a small delay to ensure frontend is fully ready
		go func() {
			time.Sleep(100 * time.Millisecond)
			if err := a.LoadFile(a.startupFile); err != nil {
				fmt.Printf("Error loading startup file: %v\n", err)
				runtime.MessageDialog(ctx, runtime.MessageDialogOptions{
					Type:    runtime.ErrorDialog,
					Title:   "Error Loading File",
					Message: fmt.Sprintf("Failed to load file: %v", err),
				})
			} else {
				fmt.Printf("Startup file loaded successfully: %s\n", a.startupFile)
			}
		}()
	}
}

// ShowAbout shows the About dialog
func (a *App) ShowAbout() {
	if a.ctx != nil {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
			Type:    runtime.InfoDialog,
			Title:   "About UpDown",
			Message: "A full-featured Markdown viewer with Mermaid diagram support.\n\nVersion 1.0.0",
		})
	}
}

// Quit quits the application
func (a *App) Quit() {
	if a.ctx != nil {
		runtime.Quit(a.ctx)
	}
}

// GetCurrentFilePath returns the current file path
func (a *App) GetCurrentFilePath() string {
	return a.filePath
}

func (a *App) renderMarkdown(content []byte, basePath string) (string, error) {
	var buf bytes.Buffer

	// Convert markdown to HTML
	if err := a.markdown.Convert(content, &buf); err != nil {
		return "", fmt.Errorf("failed to convert markdown: %w", err)
	}

	htmlContent := buf.String()

	// Convert relative image paths to base64 data URIs
	htmlContent = processImagePaths(htmlContent, basePath)

	// Wrap in a complete HTML document with Mermaid.js support
	fullHTML := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Markdown Viewer</title>
	<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			line-height: 1.6;
			max-width: 900px;
			margin: 0 auto;
			padding: 20px;
			background-color: #ffffff;
			color: #333;
		}
		pre {
			background-color: #f5f5f5;
			border: 1px solid #ddd;
			border-radius: 4px;
			padding: 12px;
			overflow-x: auto;
		}
		code {
			background-color: #f5f5f5;
			padding: 2px 4px;
			border-radius: 3px;
			font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
		}
		pre code {
			background-color: transparent;
			padding: 0;
		}
		img {
			max-width: 100%%;
			height: auto;
			border-radius: 4px;
		}
		table {
			border-collapse: collapse;
			width: 100%%;
			margin: 16px 0;
		}
		table th, table td {
			border: 1px solid #ddd;
			padding: 8px;
			text-align: left;
		}
		table th {
			background-color: #f5f5f5;
			font-weight: bold;
		}
		blockquote {
			border-left: 4px solid #ddd;
			margin: 0;
			padding-left: 16px;
			color: #666;
		}
		a {
			color: #0066cc;
			text-decoration: none;
		}
		a:hover {
			text-decoration: underline;
		}
		.mermaid {
			text-align: center;
			margin: 20px 0;
		}
		h1, h2, h3, h4, h5, h6 {
			margin-top: 24px;
			margin-bottom: 16px;
			font-weight: 600;
		}
		h1 {
			font-size: 2em;
			border-bottom: 1px solid #eaecef;
			padding-bottom: 0.3em;
		}
		h2 {
			font-size: 1.5em;
			border-bottom: 1px solid #eaecef;
			padding-bottom: 0.3em;
		}
		ul, ol {
			padding-left: 2em;
		}
		li {
			margin: 0.25em 0;
		}
		hr {
			height: 0.25em;
			padding: 0;
			margin: 24px 0;
			background-color: #e1e4e8;
			border: 0;
		}
	</style>
</head>
<body>
	%s
	<script>
		mermaid.initialize({ startOnLoad: true, theme: 'default' });
		
		// Find all mermaid code blocks and render them
		document.addEventListener('DOMContentLoaded', function() {
			const mermaidBlocks = document.querySelectorAll('code.language-mermaid, pre code.language-mermaid');
			mermaidBlocks.forEach(function(block) {
				const parent = block.parentElement;
				if (parent && parent.tagName === 'PRE') {
					const diagram = block.textContent;
					const div = document.createElement('div');
					div.className = 'mermaid';
					div.textContent = diagram;
					parent.parentElement.replaceChild(div, parent);
				}
			});
			// Re-initialize mermaid after replacing code blocks
			mermaid.init(undefined, document.querySelectorAll('.mermaid'));
		});
	</script>
</body>
</html>`, htmlContent)

	return fullHTML, nil
}

func processImagePaths(htmlContent string, basePath string) string {
	// Regex to find img src attributes with relative paths
	imgRegex := regexp.MustCompile(`<img\s+([^>]*\s+)?src=["']([^"']+)["']`)

	return imgRegex.ReplaceAllStringFunc(htmlContent, func(match string) string {
		// Extract the src value
		srcRegex := regexp.MustCompile(`src=["']([^"']+)["']`)
		matches := srcRegex.FindStringSubmatch(match)
		if len(matches) < 2 {
			return match
		}

		src := matches[1]

		// Skip if it's already an absolute URL (http://, https://, or data:)
		if strings.HasPrefix(src, "http://") || strings.HasPrefix(src, "https://") || strings.HasPrefix(src, "data:") {
			return match
		}

		// Convert relative path to absolute path
		absPath := src
		if !filepath.IsAbs(src) {
			absPath = filepath.Join(basePath, src)
		}

		// Read image file and convert to base64
		imageData, err := os.ReadFile(absPath)
		if err != nil {
			// If we can't read the file, return original match
			return match
		}

		// Determine MIME type from file extension
		ext := strings.ToLower(filepath.Ext(absPath))
		mimeType := "image/png" // default
		switch ext {
		case ".jpg", ".jpeg":
			mimeType = "image/jpeg"
		case ".png":
			mimeType = "image/png"
		case ".gif":
			mimeType = "image/gif"
		case ".svg":
			mimeType = "image/svg+xml"
		case ".webp":
			mimeType = "image/webp"
		}

		// Encode to base64
		base64Data := base64.StdEncoding.EncodeToString(imageData)
		dataURI := fmt.Sprintf("data:%s;base64,%s", mimeType, base64Data)

		// Replace src with data URI
		return strings.Replace(match, `src="`+src+`"`, `src="`+dataURI+`"`, 1)
	})
}

func (a *App) watchFile() {
	// Simple file watcher - reload when file changes
	lastModTime := time.Time{}
	for {
		time.Sleep(1 * time.Second)
		if a.filePath == "" {
			continue
		}
		info, err := os.Stat(a.filePath)
		if err != nil {
			continue
		}
		if info.ModTime().After(lastModTime) {
			lastModTime = info.ModTime()
			content, err := os.ReadFile(a.filePath)
			if err != nil {
				continue
			}
			htmlContent, err := a.renderMarkdown(content, a.basePath)
			if err == nil {
				runtime.EventsEmit(a.ctx, "markdown-rendered", htmlContent)
			}
		}
	}
}
