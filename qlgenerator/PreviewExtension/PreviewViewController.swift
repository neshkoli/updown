import Cocoa
import QuickLookUI
import JavaScriptCore
import WebKit

class PreviewViewController: NSViewController, QLPreviewingController, WKNavigationDelegate {

    private var webView: WKWebView!
    private var metadataScrollView: NSScrollView!
    private var metadataTextView: NSTextView!
    private var metadataSeparator: NSBox!
    private var metadataPanelMinHeightConstraint: NSLayoutConstraint!

    /// Held between `loadHTMLString` and the WKNavigationDelegate callback.
    private var pendingCompletionHandler: ((Error?) -> Void)?

    override func loadView() {
        NSLog("UpDownPreview: loadView called")

        let container = NSView(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
        container.autoresizingMask = [.width, .height]

        // --- Main content area: WKWebView (full CSS support, no double-marker issue) ---
        let config = WKWebViewConfiguration()
        webView = WKWebView(frame: container.bounds, configuration: config)
        webView.navigationDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false

        // --- Separator line ---
        metadataSeparator = NSBox(frame: .zero)
        metadataSeparator.boxType = .separator
        metadataSeparator.translatesAutoresizingMaskIntoConstraints = false

        // --- Metadata panel ---
        metadataScrollView = NSScrollView(frame: NSRect(x: 0, y: 0, width: 600, height: 120))
        metadataScrollView.hasVerticalScroller = true
        metadataScrollView.hasHorizontalScroller = false
        metadataScrollView.drawsBackground = true

        metadataTextView = NSTextView(frame: metadataScrollView.contentView.bounds)
        metadataTextView.isEditable = false
        metadataTextView.isSelectable = true
        metadataTextView.autoresizingMask = [.width]
        metadataTextView.textContainerInset = NSSize(width: 16, height: 12)
        metadataTextView.isVerticallyResizable = true
        metadataTextView.isHorizontallyResizable = false
        metadataTextView.textContainer?.widthTracksTextView = true
        metadataTextView.drawsBackground = true
        metadataTextView.backgroundColor = NSColor(white: 0.97, alpha: 1.0)

        metadataScrollView.documentView = metadataTextView

        // Start with metadata hidden
        metadataSeparator.isHidden = true
        metadataScrollView.isHidden = true

        container.addSubview(webView)
        container.addSubview(metadataSeparator)
        container.addSubview(metadataScrollView)

        metadataScrollView.translatesAutoresizingMaskIntoConstraints = false

        metadataPanelMinHeightConstraint = metadataScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 60)

        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),

            metadataSeparator.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            metadataSeparator.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            metadataSeparator.topAnchor.constraint(equalTo: webView.bottomAnchor),

            metadataScrollView.topAnchor.constraint(equalTo: metadataSeparator.bottomAnchor),
            metadataScrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            metadataScrollView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            metadataScrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            metadataPanelMinHeightConstraint,
            metadataScrollView.heightAnchor.constraint(lessThanOrEqualTo: container.heightAnchor, multiplier: 0.35),
        ])

        // When no metadata, webView fills the whole container
        let webViewBottomToContainer = webView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        webViewBottomToContainer.priority = .defaultLow
        webViewBottomToContainer.isActive = true

        self.view = container
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        NSLog("UpDownPreview: WebView finished loading")
        pendingCompletionHandler?(nil)
        pendingCompletionHandler = nil
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        NSLog("UpDownPreview: WebView navigation failed: %@", error.localizedDescription)
        pendingCompletionHandler?(nil)
        pendingCompletionHandler = nil
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        NSLog("UpDownPreview: WebView provisional navigation failed: %@", error.localizedDescription)
        pendingCompletionHandler?(nil)
        pendingCompletionHandler = nil
    }

    // MARK: - Frontmatter parsing

    /// Parses YAML frontmatter from the source. Returns (metadata string, body without frontmatter).
    private func extractFrontmatter(from source: String) -> (metadata: String?, body: String) {
        let lines = source.components(separatedBy: "\n")
        guard lines.count >= 3 else { return (nil, source) }

        let firstLine = lines[0].trimmingCharacters(in: .whitespaces)
        guard firstLine == "---" else { return (nil, source) }

        var closingIndex: Int? = nil
        for i in 1..<lines.count {
            if lines[i].trimmingCharacters(in: .whitespaces) == "---" {
                closingIndex = i
                break
            }
        }

        guard let endIdx = closingIndex, endIdx > 1 else { return (nil, source) }

        let metadataLines = Array(lines[1..<endIdx])
        let metadata = metadataLines.joined(separator: "\n")
        let bodyLines = Array(lines[(endIdx + 1)...])
        let body = bodyLines.joined(separator: "\n")

        return (metadata, body)
    }

    /// Parses simple YAML key-value pairs into an array of (key, value) tuples.
    private func parseYAMLMetadata(_ yaml: String) -> [(key: String, value: String)] {
        var result: [(key: String, value: String)] = []
        let lines = yaml.components(separatedBy: "\n")

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }

            if let colonRange = trimmed.range(of: ":") {
                let key = String(trimmed[trimmed.startIndex..<colonRange.lowerBound]).trimmingCharacters(in: .whitespaces)
                var value = String(trimmed[colonRange.upperBound...]).trimmingCharacters(in: .whitespaces)

                if (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
                   (value.hasPrefix("'") && value.hasSuffix("'")) {
                    value = String(value.dropFirst().dropLast())
                }

                if !key.isEmpty {
                    result.append((key: key, value: value))
                }
            } else if trimmed.hasPrefix("- ") {
                let item = String(trimmed.dropFirst(2))
                if !result.isEmpty {
                    let last = result.removeLast()
                    let newValue = last.value.isEmpty ? item : last.value + ", " + item
                    result.append((key: last.key, value: newValue))
                }
            }
        }

        return result
    }

    /// Build a formatted NSAttributedString for the metadata panel
    private func buildMetadataAttributedString(from pairs: [(key: String, value: String)]) -> NSAttributedString {
        let result = NSMutableAttributedString()

        let titleStyle = NSMutableParagraphStyle()
        titleStyle.paragraphSpacing = 6
        result.append(NSAttributedString(string: "Metadata\n", attributes: [
            .font: NSFont.boldSystemFont(ofSize: 11),
            .foregroundColor: NSColor.secondaryLabelColor,
            .paragraphStyle: titleStyle
        ]))

        let keyFont = NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold)
        let valueFont = NSFont.systemFont(ofSize: 12)
        let pairStyle = NSMutableParagraphStyle()
        pairStyle.lineSpacing = 2
        pairStyle.paragraphSpacing = 4
        pairStyle.tabStops = [NSTextTab(textAlignment: .left, location: 120)]

        for pair in pairs {
            result.append(NSAttributedString(string: pair.key, attributes: [
                .font: keyFont,
                .foregroundColor: NSColor.labelColor,
                .paragraphStyle: pairStyle
            ]))
            result.append(NSAttributedString(string: "  ", attributes: [
                .font: valueFont,
                .foregroundColor: NSColor.tertiaryLabelColor,
            ]))
            let valueColor: NSColor = pair.value.isEmpty ? .tertiaryLabelColor : .secondaryLabelColor
            let displayValue = pair.value.isEmpty ? "(empty)" : pair.value
            result.append(NSAttributedString(string: displayValue + "\n", attributes: [
                .font: valueFont,
                .foregroundColor: valueColor,
                .paragraphStyle: pairStyle
            ]))
        }

        return result
    }

    // MARK: - Preview

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        NSLog("UpDownPreview: preparePreviewOfFile called for %@", url.path)

        let didAccess = url.startAccessingSecurityScopedResource()
        NSLog("UpDownPreview: startAccessingSecurityScopedResource = %d", didAccess)
        defer {
            if didAccess { url.stopAccessingSecurityScopedResource() }
        }

        let source: String
        do {
            source = try String(contentsOf: url, encoding: .utf8)
            NSLog("UpDownPreview: Read file successfully, length = %d", source.count)
        } catch {
            NSLog("UpDownPreview: Cannot read file: %@", error.localizedDescription)
            DispatchQueue.main.async { [weak self] in
                self?.showError("Cannot read file: \(error.localizedDescription)", handler: handler)
            }
            return
        }

        let (metadataRaw, body) = extractFrontmatter(from: source)
        var metadataPairs: [(key: String, value: String)] = []
        if let meta = metadataRaw {
            metadataPairs = parseYAMLMetadata(meta)
            NSLog("UpDownPreview: Found frontmatter with %d fields", metadataPairs.count)
        }

        let bundle = Bundle(for: type(of: self))
        NSLog("UpDownPreview: Bundle path = %@", bundle.bundlePath)

        guard let mdJSURL = bundle.url(forResource: "markdown-it.min", withExtension: "js"),
              let mdJS = try? String(contentsOf: mdJSURL, encoding: .utf8) else {
            NSLog("UpDownPreview: Cannot load markdown-it.min.js")
            DispatchQueue.main.async { [weak self] in
                self?.showError("Cannot load markdown-it.min.js from bundle resources", handler: handler)
            }
            return
        }

        let bidiJS: String
        if let bidiURL = bundle.url(forResource: "bidi", withExtension: "js"),
           let b = try? String(contentsOf: bidiURL, encoding: .utf8) {
            bidiJS = b
        } else {
            bidiJS = ""
        }

        let css: String
        if let cssURL = bundle.url(forResource: "preview", withExtension: "css"),
           let c = try? String(contentsOf: cssURL, encoding: .utf8) {
            css = c
        } else {
            css = ""
        }

        let ctx = JSContext()!
        ctx.exceptionHandler = { _, exception in
            NSLog("UpDownPreview JSContext error: %@", exception?.toString() ?? "unknown")
        }

        let logBlock: @convention(block) (JSValue) -> Void = { _ in }
        ctx.setObject(logBlock, forKeyedSubscript: "logFn" as NSString)
        ctx.evaluateScript("""
            var console = { log: logFn, warn: logFn, error: logFn };
            var self = this;
            if (typeof globalThis === 'undefined') { var globalThis = this; }
        """)
        ctx.evaluateScript(mdJS)

        let markdownitCheck = ctx.evaluateScript("typeof markdownit")
        if markdownitCheck?.toString() != "function" {
            let typeStr = markdownitCheck?.toString() ?? "nil"
            NSLog("UpDownPreview: markdown-it failed to initialize, typeof = %@", typeStr)
            DispatchQueue.main.async { [weak self] in
                self?.showError("markdown-it failed to initialize (typeof markdownit = \(typeStr))", handler: handler)
            }
            return
        }

        if !bidiJS.isEmpty {
            ctx.evaluateScript(bidiJS)
        }

        ctx.setObject(body, forKeyedSubscript: "__source" as NSString)
        let htmlValue = ctx.evaluateScript("""
            (function() {
                var md = markdownit({ html: false, linkify: true, typographer: true });
                var html = md.render(__source);
                if (typeof applyBidiToHTML === 'function') {
                    html = applyBidiToHTML(html);
                }
                return html;
            })()
        """)

        let bodyHTML = htmlValue?.toString() ?? ""
        NSLog("UpDownPreview: Rendered HTML length = %d", bodyHTML.count)

        let fullHTML = """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>\(css)</style>
        </head>
        <body>
        \(bodyHTML)
        </body>
        </html>
        """

        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                handler(nil)
                return
            }

            // Show/hide metadata panel; collapse height so no empty space when absent
            let hasMetadata = !metadataPairs.isEmpty
            self.metadataSeparator.isHidden = !hasMetadata
            self.metadataScrollView.isHidden = !hasMetadata

            if hasMetadata {
                let metaAttr = self.buildMetadataAttributedString(from: metadataPairs)
                self.metadataTextView.textStorage?.setAttributedString(metaAttr)

                self.metadataTextView.layoutManager?.ensureLayout(for: self.metadataTextView.textContainer!)
                let metaHeight = self.metadataTextView.layoutManager?.usedRect(for: self.metadataTextView.textContainer!).height ?? 80
                let idealHeight = min(max(metaHeight + 28, 60), self.view.bounds.height * 0.35)
                self.metadataPanelMinHeightConstraint.constant = idealHeight
            } else {
                self.metadataPanelMinHeightConstraint.constant = 0
            }

            // Store handler — WKNavigationDelegate fires it after load completes
            self.pendingCompletionHandler = handler
            self.webView.loadHTMLString(fullHTML, baseURL: nil)
        }
    }

    // MARK: - Helpers

    private func showError(_ message: String, handler: @escaping (Error?) -> Void) {
        let errorHTML = """
        <!DOCTYPE html><html><head><meta charset="utf-8">
        <style>body{font-family:system-ui;color:#c00;padding:2em;}</style>
        </head><body><p>\(message)</p></body></html>
        """
        pendingCompletionHandler = handler
        webView.loadHTMLString(errorHTML, baseURL: nil)
    }
}
