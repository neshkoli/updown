package renderer

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/extension"
	"github.com/yuin/goldmark/parser"
	"github.com/yuin/goldmark/renderer/html"
	"go.abhg.dev/goldmark/mermaid"
)

// Renderer handles markdown rendering
type Renderer struct {
	markdown goldmark.Markdown
}

// NewRenderer creates a new markdown renderer
func NewRenderer() *Renderer {
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

	return &Renderer{
		markdown: md,
	}
}

// RenderMarkdown renders markdown content to HTML
func (r *Renderer) RenderMarkdown(content []byte, basePath string) (string, error) {
	var buf bytes.Buffer

	// Convert markdown to HTML
	if err := r.markdown.Convert(content, &buf); err != nil {
		return "", fmt.Errorf("failed to convert markdown: %w", err)
	}

	htmlContent := buf.String()

	// Convert relative image paths to base64 data URIs
	htmlContent = processImagePaths(htmlContent, basePath)

	// Process paragraphs for Hebrew RTL support
	htmlContent = safeProcessHebrewRTL(htmlContent)

	// Wrap in a complete HTML document with Mermaid.js support
	// For Quick Look, use full-screen styling to show complete content
	fullHTML := fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Markdown Preview</title>
	<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
	<style>
		* {
			box-sizing: border-box;
		}
		html, body {
			margin: 0;
			padding: 0;
			width: 100%%;
			height: 100%%;
			overflow: auto;
			-webkit-overflow-scrolling: touch;
		}
		body {
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
			line-height: 1.5;
			font-size: 12px;
			padding: 15px;
			background-color: #ffffff;
			color: #333;
			overflow-y: auto;
			overflow-x: hidden;
		}
		pre {
			background-color: #f5f5f5;
			border: 1px solid #ddd;
			border-radius: 3px;
			padding: 10px;
			overflow-x: auto;
			font-size: 11px;
			margin: 8px 0;
		}
		code {
			background-color: #f5f5f5;
			padding: 2px 4px;
			border-radius: 2px;
			font-family: "SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace;
			font-size: 11px;
		}
		pre code {
			background-color: transparent;
			padding: 0;
		}
		img {
			max-width: 100%%;
			height: auto;
			border-radius: 2px;
			margin: 4px 0;
		}
		table {
			border-collapse: collapse;
			width: 100%%;
			margin: 10px 0;
			font-size: 11px;
		}
		table th, table td {
			border: 1px solid #ddd;
			padding: 6px;
			text-align: left;
		}
		table th {
			background-color: #f5f5f5;
			font-weight: bold;
		}
		blockquote {
			border-left: 3px solid #ddd;
			margin: 8px 0;
			padding-left: 12px;
			color: #666;
			font-size: 11px;
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
			margin: 15px 0;
			font-size: 11px;
		}
		h1, h2, h3, h4, h5, h6 {
			margin-top: 15px;
			margin-bottom: 10px;
			font-weight: 600;
		}
		h1 {
			font-size: 1.8em;
			border-bottom: 1px solid #eaecef;
			padding-bottom: 0.3em;
		}
		h2 {
			font-size: 1.5em;
			border-bottom: 1px solid #eaecef;
			padding-bottom: 0.3em;
		}
		h3 {
			font-size: 1.3em;
		}
		h4 {
			font-size: 1.1em;
		}
		h5, h6 {
			font-size: 1em;
		}
		ul, ol {
			padding-left: 1.5em;
			margin: 8px 0;
		}
		li {
			margin: 0.3em 0;
		}
		p {
			margin: 8px 0;
		}
		p[dir="rtl"] {
			text-align: right;
			direction: rtl;
		}
		hr {
			height: 1px;
			padding: 0;
			margin: 15px 0;
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

// countHebrewAndLatin counts Hebrew and Latin characters in text
// Hebrew Unicode range: U+0590 to U+05FF
// Returns (hebrewCount, latinCount)
func countHebrewAndLatin(text string) (int, int) {
	hebrewCount := 0
	latinCount := 0

	for _, r := range text {
		// Hebrew Unicode range: U+0590 to U+05FF
		if r >= 0x0590 && r <= 0x05FF {
			hebrewCount++
		} else if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') {
			latinCount++
		}
	}

	return hebrewCount, latinCount
}

// extractTextFromHTML extracts plain text from HTML, ignoring tags
func extractTextFromHTML(html string) string {
	// Simple regex to remove HTML tags
	tagRegex := regexp.MustCompile(`<[^>]+>`)
	text := tagRegex.ReplaceAllString(html, "")
	// Decode HTML entities (basic ones)
	text = strings.ReplaceAll(text, "&nbsp;", " ")
	text = strings.ReplaceAll(text, "&amp;", "&")
	text = strings.ReplaceAll(text, "&lt;", "<")
	text = strings.ReplaceAll(text, "&gt;", ">")
	text = strings.ReplaceAll(text, "&quot;", "\"")
	text = strings.ReplaceAll(text, "&#39;", "'")
	return text
}

// safeProcessHebrewRTL safely processes Hebrew RTL with error recovery
func safeProcessHebrewRTL(htmlContent string) string {
	defer func() {
		if r := recover(); r != nil {
			fmt.Printf("Warning: Hebrew RTL processing failed: %v\n", r)
		}
	}()
	return processHebrewRTL(htmlContent)
}

// processHebrewRTL processes paragraphs to apply RTL alignment for Hebrew text
func processHebrewRTL(htmlContent string) string {
	// If content is empty, return as-is
	if htmlContent == "" {
		return htmlContent
	}

	// Use a simpler, safer regex approach
	// Match <p> tags with their content, handling nested tags
	pRegex := regexp.MustCompile(`(?s)<p([^>]*)>(.*?)</p>`)

	return pRegex.ReplaceAllStringFunc(htmlContent, func(match string) string {
		submatches := pRegex.FindStringSubmatch(match)
		if len(submatches) < 3 {
			return match
		}

		attributes := submatches[1]
		content := submatches[2]

		// Skip if already has dir="rtl"
		if strings.Contains(attributes, `dir="rtl"`) || strings.Contains(attributes, `dir='rtl'`) {
			return match
		}

		// Extract plain text
		plainText := extractTextFromHTML(content)
		if strings.TrimSpace(plainText) == "" {
			return match
		}

		// Count characters
		hebrewCount, latinCount := countHebrewAndLatin(plainText)

		// Apply RTL if more Hebrew
		if hebrewCount > latinCount {
			if strings.Contains(attributes, `dir=`) {
				dirRegex := regexp.MustCompile(`dir=["'][^"']*["']`)
				attributes = dirRegex.ReplaceAllString(attributes, `dir="rtl"`)
			} else {
				attributes = strings.TrimSpace(attributes)
				if attributes != "" {
					attributes += " "
				}
				attributes += `dir="rtl" style="text-align: right;"`
			}
			attrs := strings.TrimSpace(attributes)
			if attrs != "" {
				return fmt.Sprintf(`<p %s>%s</p>`, attrs, content)
			}
			return fmt.Sprintf(`<p dir="rtl" style="text-align: right;">%s</p>`, content)
		}

		return match
	})
}

// processParagraph processes a single paragraph for RTL support
func processParagraph(attributes, content, originalMatch string) string {
	// Skip if already has dir="rtl" to avoid double processing
	if strings.Contains(attributes, `dir="rtl"`) || strings.Contains(attributes, `dir='rtl'`) {
		return originalMatch
	}

	// Extract plain text from the paragraph content
	plainText := extractTextFromHTML(content)

	// Skip empty paragraphs
	if strings.TrimSpace(plainText) == "" {
		return originalMatch
	}

	// Count Hebrew and Latin characters
	hebrewCount, latinCount := countHebrewAndLatin(plainText)

	// If more Hebrew than Latin, apply RTL
	if hebrewCount > latinCount {
		// Check if dir attribute already exists (for other values)
		if strings.Contains(attributes, `dir=`) {
			// Replace existing dir attribute
			dirRegex := regexp.MustCompile(`dir=["'][^"']*["']`)
			attributes = dirRegex.ReplaceAllString(attributes, `dir="rtl"`)
		} else {
			// Add dir attribute
			attributes = strings.TrimSpace(attributes)
			if attributes != "" {
				attributes += " "
			}
			attributes += `dir="rtl" style="text-align: right;"`
		}
		// Format the paragraph tag properly
		attrs := strings.TrimSpace(attributes)
		if attrs != "" {
			return fmt.Sprintf(`<p %s>%s</p>`, attrs, content)
		}
		return fmt.Sprintf(`<p dir="rtl" style="text-align: right;">%s</p>`, content)
	}

	// Default: keep LTR (left-aligned)
	return originalMatch
}
