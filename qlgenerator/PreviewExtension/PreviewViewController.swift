import Cocoa
import QuickLookUI
import JavaScriptCore

class PreviewViewController: NSViewController, QLPreviewingController {

    private var scrollView: NSScrollView!
    private var textView: NSTextView!
    private var metadataScrollView: NSScrollView!
    private var metadataTextView: NSTextView!
    private var metadataSeparator: NSBox!
    private var metadataPanelMinHeightConstraint: NSLayoutConstraint!

    override func loadView() {
        NSLog("UpDownPreview: loadView called")

        let container = NSView(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
        container.autoresizingMask = [.width, .height]

        // --- Main content: NSTextView (works in sandbox; WKWebView does not) ---
        scrollView = NSScrollView(frame: container.bounds)
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autoresizingMask = [.width, .height]
        scrollView.drawsBackground = true

        textView = NSTextView(frame: scrollView.contentView.bounds)
        textView.isEditable = false
        textView.isSelectable = true
        textView.autoresizingMask = [.width]
        textView.textContainerInset = NSSize(width: 20, height: 20)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        textView.drawsBackground = true
        textView.backgroundColor = .white

        scrollView.documentView = textView

        // --- Separator ---
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
        metadataSeparator.isHidden = true
        metadataScrollView.isHidden = true

        container.addSubview(scrollView)
        container.addSubview(metadataSeparator)
        container.addSubview(metadataScrollView)

        scrollView.translatesAutoresizingMaskIntoConstraints = false
        metadataScrollView.translatesAutoresizingMaskIntoConstraints = false

        metadataPanelMinHeightConstraint = metadataScrollView.heightAnchor.constraint(greaterThanOrEqualToConstant: 60)

        NSLayoutConstraint.activate([
            scrollView.topAnchor.constraint(equalTo: container.topAnchor),
            scrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: container.trailingAnchor),

            metadataSeparator.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            metadataSeparator.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            metadataSeparator.topAnchor.constraint(equalTo: scrollView.bottomAnchor),

            metadataScrollView.topAnchor.constraint(equalTo: metadataSeparator.bottomAnchor),
            metadataScrollView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            metadataScrollView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            metadataScrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            metadataPanelMinHeightConstraint,
            metadataScrollView.heightAnchor.constraint(lessThanOrEqualTo: container.heightAnchor, multiplier: 0.35),
        ])

        let scrollBottom = scrollView.bottomAnchor.constraint(equalTo: container.bottomAnchor)
        scrollBottom.priority = .defaultLow
        scrollBottom.isActive = true

        self.view = container
    }

    // MARK: - Frontmatter

    private func extractFrontmatter(from source: String) -> (metadata: String?, body: String) {
        let lines = source.components(separatedBy: "\n")
        guard lines.count >= 3 else { return (nil, source) }
        guard lines[0].trimmingCharacters(in: .whitespaces) == "---" else { return (nil, source) }

        var closingIndex: Int? = nil
        for i in 1..<lines.count {
            if lines[i].trimmingCharacters(in: .whitespaces) == "---" {
                closingIndex = i
                break
            }
        }
        guard let endIdx = closingIndex, endIdx > 1 else { return (nil, source) }

        let metadata = Array(lines[1..<endIdx]).joined(separator: "\n")
        let body = Array(lines[(endIdx + 1)...]).joined(separator: "\n")
        return (metadata, body)
    }

    private func parseYAMLMetadata(_ yaml: String) -> [(key: String, value: String)] {
        var result: [(key: String, value: String)] = []
        for line in yaml.components(separatedBy: "\n") {
            let t = line.trimmingCharacters(in: .whitespaces)
            if t.isEmpty { continue }
            if let colonRange = t.range(of: ":") {
                let key = String(t[..<colonRange.lowerBound]).trimmingCharacters(in: .whitespaces)
                var value = String(t[colonRange.upperBound...]).trimmingCharacters(in: .whitespaces)
                if (value.hasPrefix("\"") && value.hasSuffix("\"")) || (value.hasPrefix("'") && value.hasSuffix("'")) {
                    value = String(value.dropFirst().dropLast())
                }
                if !key.isEmpty { result.append((key: key, value: value)) }
            } else if t.hasPrefix("- "), !result.isEmpty {
                let last = result.removeLast()
                result.append((key: last.key, value: last.value.isEmpty ? String(t.dropFirst(2)) : last.value + ", " + String(t.dropFirst(2))))
            }
        }
        return result
    }

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
        for pair in pairs {
            result.append(NSAttributedString(string: pair.key, attributes: [.font: keyFont, .foregroundColor: NSColor.labelColor, .paragraphStyle: pairStyle]))
            result.append(NSAttributedString(string: "  ", attributes: [.font: valueFont, .foregroundColor: NSColor.tertiaryLabelColor]))
            let displayValue = pair.value.isEmpty ? "(empty)" : pair.value
            result.append(NSAttributedString(string: displayValue + "\n", attributes: [.font: valueFont, .foregroundColor: NSColor.secondaryLabelColor, .paragraphStyle: pairStyle]))
        }
        return result
    }

    // MARK: - Preview

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        NSLog("UpDownPreview: preparePreviewOfFile called for %@", url.path)

        let didAccess = url.startAccessingSecurityScopedResource()
        defer { if didAccess { url.stopAccessingSecurityScopedResource() } }

        let source: String
        do {
            source = try String(contentsOf: url, encoding: .utf8)
        } catch {
            DispatchQueue.main.async { [weak self] in
                self?.showError("Cannot read file: \(error.localizedDescription)", handler: handler)
            }
            return
        }

        let (metadataRaw, body) = extractFrontmatter(from: source)
        let metadataPairs = metadataRaw.map { parseYAMLMetadata($0) } ?? []

        let bundle = Bundle(for: type(of: self))
        guard let mdJSURL = bundle.url(forResource: "markdown-it.min", withExtension: "js"),
              let mdJS = try? String(contentsOf: mdJSURL, encoding: .utf8) else {
            DispatchQueue.main.async { [weak self] in
                self?.showError("Cannot load markdown-it.min.js", handler: handler)
            }
            return
        }

        let bidiJS: String = (bundle.url(forResource: "bidi", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }) ?? ""
        let css: String = (bundle.url(forResource: "preview", withExtension: "css").flatMap { try? String(contentsOf: $0, encoding: .utf8) }) ?? ""

        let ctx = JSContext()!
        ctx.exceptionHandler = { _, ex in NSLog("UpDownPreview JS error: %@", ex?.toString() ?? "?") }
        let logBlock: @convention(block) (JSValue) -> Void = { _ in }
        ctx.setObject(logBlock, forKeyedSubscript: "logFn" as NSString)
        ctx.evaluateScript("var console = { log: logFn, warn: logFn, error: logFn }; var self = this; if (typeof globalThis === 'undefined') { var globalThis = this; }")
        ctx.evaluateScript(mdJS)

        guard ctx.evaluateScript("typeof markdownit")?.toString() == "function" else {
            DispatchQueue.main.async { [weak self] in
                self?.showError("markdown-it failed to initialize", handler: handler)
            }
            return
        }
        if !bidiJS.isEmpty { ctx.evaluateScript(bidiJS) }

        ctx.setObject(body, forKeyedSubscript: "__source" as NSString)
        let bodyHTML = ctx.evaluateScript("""
            (function() {
                var md = markdownit({ html: false, linkify: true, typographer: true });
                var html = md.render(__source);
                if (typeof applyBidiToHTML === 'function') html = applyBidiToHTML(html);
                return html;
            })()
        """)?.toString() ?? ""

        let fullHTML = """
        <!DOCTYPE html><html><head><meta charset="utf-8"><style>\(css)</style></head>
        <body>\(bodyHTML)
        <hr style="margin-top:2em;border:none;border-top:1px solid #d0d7de;">
        <p style="text-align:center;color:#999;font-size:0.85em;">UpDown · 2026</p>
        </body></html>
        """

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { handler(nil); return }

            let hasMetadata = !metadataPairs.isEmpty
            self.metadataSeparator.isHidden = !hasMetadata
            self.metadataScrollView.isHidden = !hasMetadata
            if hasMetadata {
                self.metadataTextView.textStorage?.setAttributedString(self.buildMetadataAttributedString(from: metadataPairs))
                self.metadataTextView.layoutManager?.ensureLayout(for: self.metadataTextView.textContainer!)
                let h = self.metadataTextView.layoutManager?.usedRect(for: self.metadataTextView.textContainer!).height ?? 80
                self.metadataPanelMinHeightConstraint.constant = min(max(h + 28, 60), self.view.bounds.height * 0.35)
            } else {
                self.metadataPanelMinHeightConstraint.constant = 0
            }

            if let htmlData = fullHTML.data(using: .utf8),
               let attr = NSAttributedString(html: htmlData, options: [.documentType: NSAttributedString.DocumentType.html, .characterEncoding: String.Encoding.utf8.rawValue], documentAttributes: nil) {
                self.textView.textStorage?.setAttributedString(attr)
            } else {
                self.displayPlainMarkdown(body)
            }
            handler(nil)
        }
    }

    private func displayPlainMarkdown(_ source: String) {
        let para = NSMutableParagraphStyle()
        para.lineSpacing = 4
        para.paragraphSpacing = 8
        let base = NSFont.systemFont(ofSize: 14)
        let h1 = NSFont.boldSystemFont(ofSize: 28)
        let h2 = NSFont.boldSystemFont(ofSize: 22)
        let h3 = NSFont.boldSystemFont(ofSize: 18)
        let result = NSMutableAttributedString()

        for line in source.components(separatedBy: "\n") {
            let t = line.trimmingCharacters(in: .whitespaces)
            var attr: NSAttributedString
            if t.hasPrefix("### ") {
                attr = NSAttributedString(string: String(t.dropFirst(4)) + "\n", attributes: [.font: h3, .foregroundColor: NSColor.textColor, .paragraphStyle: para])
            } else if t.hasPrefix("## ") {
                attr = NSAttributedString(string: String(t.dropFirst(3)) + "\n", attributes: [.font: h2, .foregroundColor: NSColor.textColor, .paragraphStyle: para])
            } else if t.hasPrefix("# ") {
                attr = NSAttributedString(string: String(t.dropFirst(2)) + "\n", attributes: [.font: h1, .foregroundColor: NSColor.textColor, .paragraphStyle: para])
            } else if t.hasPrefix("- ") || t.hasPrefix("* ") {
                let bullet = NSMutableParagraphStyle()
                bullet.headIndent = 20
                bullet.firstLineHeadIndent = 8
                attr = NSAttributedString(string: "• " + String(t.dropFirst(2)) + "\n", attributes: [.font: base, .foregroundColor: NSColor.textColor, .paragraphStyle: bullet])
            } else if t.isEmpty {
                attr = NSAttributedString(string: "\n")
            } else {
                attr = NSAttributedString(string: line + "\n", attributes: [.font: base, .foregroundColor: NSColor.textColor, .paragraphStyle: para])
            }
            result.append(attr)
        }
        result.append(NSAttributedString(string: "────────────────────────────────\nUpDown · 2026\n", attributes: [.font: NSFont.systemFont(ofSize: 12), .foregroundColor: NSColor.tertiaryLabelColor]))
        textView.textStorage?.setAttributedString(result)
    }

    private func showError(_ message: String, handler: @escaping (Error?) -> Void) {
        let attr = NSAttributedString(string: message, attributes: [.foregroundColor: NSColor.systemRed, .font: NSFont.systemFont(ofSize: 14)])
        textView.textStorage?.setAttributedString(attr)
        handler(nil)
    }
}
