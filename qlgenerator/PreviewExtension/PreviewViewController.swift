import Cocoa
import QuickLookUI
import JavaScriptCore

class PreviewViewController: NSViewController, QLPreviewingController {

    private var scrollView: NSScrollView!
    private var textView: NSTextView!

    override func loadView() {
        NSLog("UpDownPreview: loadView called")
        scrollView = NSScrollView(frame: NSRect(x: 0, y: 0, width: 600, height: 400))
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
        self.view = scrollView
    }

    func preparePreviewOfFile(at url: URL, completionHandler handler: @escaping (Error?) -> Void) {
        NSLog("UpDownPreview: preparePreviewOfFile called for %@", url.path)

        // In sandbox, start accessing the security-scoped resource
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
            displayOnMain(text: "Cannot read file: \(error.localizedDescription)", isError: true, handler: handler)
            return
        }

        let bundle = Bundle(for: type(of: self))
        NSLog("UpDownPreview: Bundle path = %@", bundle.bundlePath)

        // Load markdown-it.min.js
        guard let mdJSURL = bundle.url(forResource: "markdown-it.min", withExtension: "js"),
              let mdJS = try? String(contentsOf: mdJSURL, encoding: .utf8) else {
            NSLog("UpDownPreview: Cannot load markdown-it.min.js")
            displayOnMain(text: "Cannot load markdown-it.min.js from bundle resources", isError: true, handler: handler)
            return
        }
        NSLog("UpDownPreview: markdown-it.min.js loaded, length = %d", mdJS.count)

        // Load bidi.js
        let bidiJS: String
        if let bidiURL = bundle.url(forResource: "bidi", withExtension: "js"),
           let b = try? String(contentsOf: bidiURL, encoding: .utf8) {
            bidiJS = b
            NSLog("UpDownPreview: bidi.js loaded")
        } else {
            bidiJS = ""
            NSLog("UpDownPreview: bidi.js not found (optional)")
        }

        // Load CSS
        let css: String
        if let cssURL = bundle.url(forResource: "preview", withExtension: "css"),
           let c = try? String(contentsOf: cssURL, encoding: .utf8) {
            css = c
            NSLog("UpDownPreview: preview.css loaded")
        } else {
            css = ""
            NSLog("UpDownPreview: preview.css not found")
        }

        // Use JavaScriptCore to render markdown -> HTML
        let ctx = JSContext()!
        ctx.exceptionHandler = { _, exception in
            NSLog("UpDownPreview JSContext error: %@", exception?.toString() ?? "unknown")
        }

        // Provide globals that markdown-it's UMD wrapper expects
        let logBlock: @convention(block) (JSValue) -> Void = { _ in }
        ctx.setObject(logBlock, forKeyedSubscript: "logFn" as NSString)
        ctx.evaluateScript("""
            var console = { log: logFn, warn: logFn, error: logFn };
            var self = this;
            if (typeof globalThis === 'undefined') { var globalThis = this; }
        """)
        ctx.evaluateScript(mdJS)

        // Verify markdownit loaded
        let markdownitCheck = ctx.evaluateScript("typeof markdownit")
        if markdownitCheck?.toString() != "function" {
            let typeStr = markdownitCheck?.toString() ?? "nil"
            NSLog("UpDownPreview: markdown-it failed to initialize, typeof = %@", typeStr)
            displayOnMain(text: "markdown-it failed to initialize (typeof markdownit = \(typeStr))", isError: true, handler: handler)
            return
        }
        NSLog("UpDownPreview: markdown-it initialized OK")

        if !bidiJS.isEmpty {
            ctx.evaluateScript(bidiJS)
        }

        ctx.setObject(source, forKeyedSubscript: "__source" as NSString)
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

        if bodyHTML.isEmpty {
            NSLog("UpDownPreview: bodyHTML is empty, showing source as plain text")
            displayOnMain(text: source, isError: false, handler: handler)
            return
        }

        let fullHTML = """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <style>\(css)</style>
        </head>
        <body>
        \(bodyHTML)
        <hr style="margin-top:2em;border:none;border-top:1px solid #d0d7de;">
        <p style="text-align:center;color:#999;font-size:0.85em;margin-top:0.5em;">UpDown · 2026</p>
        </body>
        </html>
        """

        // MUST run NSAttributedString(html:) and UI updates on the main thread
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                handler(nil)
                return
            }

            NSLog("UpDownPreview: Attempting NSAttributedString(html:) on main thread")

            if let htmlData = fullHTML.data(using: .utf8),
               let attrString = NSAttributedString(
                   html: htmlData,
                   options: [
                       .documentType: NSAttributedString.DocumentType.html,
                       .characterEncoding: String.Encoding.utf8.rawValue
                   ],
                   documentAttributes: nil
               ) {
                NSLog("UpDownPreview: NSAttributedString created OK, length = %d", attrString.length)
                self.textView.textStorage?.setAttributedString(attrString)
                handler(nil)
            } else {
                NSLog("UpDownPreview: NSAttributedString(html:) returned nil, falling back to plain text")
                // Fallback: show rendered HTML as plain text with basic styling
                self.displayPlainMarkdown(source: source, handler: handler)
            }
        }
    }

    /// Display markdown source with basic attributed string formatting (no WebKit dependency)
    private func displayPlainMarkdown(source: String, handler: @escaping (Error?) -> Void) {
        let paragraphStyle = NSMutableParagraphStyle()
        paragraphStyle.lineSpacing = 4
        paragraphStyle.paragraphSpacing = 8

        let baseFont = NSFont.systemFont(ofSize: 14)
        let boldFont = NSFont.boldSystemFont(ofSize: 14)
        let h1Font = NSFont.boldSystemFont(ofSize: 28)
        let h2Font = NSFont.boldSystemFont(ofSize: 22)
        let h3Font = NSFont.boldSystemFont(ofSize: 18)
        let codeFont = NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)

        let result = NSMutableAttributedString()

        let lines = source.components(separatedBy: "\n")
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            let attrLine: NSAttributedString

            if trimmed.hasPrefix("### ") {
                let text = String(trimmed.dropFirst(4))
                attrLine = NSAttributedString(string: text + "\n", attributes: [
                    .font: h3Font,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: paragraphStyle
                ])
            } else if trimmed.hasPrefix("## ") {
                let text = String(trimmed.dropFirst(3))
                attrLine = NSAttributedString(string: text + "\n", attributes: [
                    .font: h2Font,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: paragraphStyle
                ])
            } else if trimmed.hasPrefix("# ") {
                let text = String(trimmed.dropFirst(2))
                attrLine = NSAttributedString(string: text + "\n", attributes: [
                    .font: h1Font,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: paragraphStyle
                ])
            } else if trimmed.hasPrefix("```") {
                attrLine = NSAttributedString(string: line + "\n", attributes: [
                    .font: codeFont,
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .paragraphStyle: paragraphStyle
                ])
            } else if trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") {
                let bulletStyle = NSMutableParagraphStyle()
                bulletStyle.lineSpacing = 4
                bulletStyle.paragraphSpacing = 4
                bulletStyle.headIndent = 20
                bulletStyle.firstLineHeadIndent = 8
                let text = "• " + String(trimmed.dropFirst(2))
                attrLine = NSAttributedString(string: text + "\n", attributes: [
                    .font: baseFont,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: bulletStyle
                ])
            } else if trimmed.hasPrefix("> ") {
                let quoteStyle = NSMutableParagraphStyle()
                quoteStyle.lineSpacing = 4
                quoteStyle.headIndent = 20
                quoteStyle.firstLineHeadIndent = 20
                let text = String(trimmed.dropFirst(2))
                attrLine = NSAttributedString(string: text + "\n", attributes: [
                    .font: NSFont(descriptor: baseFont.fontDescriptor.withSymbolicTraits(.italic), size: 14) ?? baseFont,
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .paragraphStyle: quoteStyle
                ])
            } else if trimmed.hasPrefix("---") || trimmed.hasPrefix("***") || trimmed.hasPrefix("___") {
                let hrStyle = NSMutableParagraphStyle()
                hrStyle.paragraphSpacing = 12
                attrLine = NSAttributedString(string: "────────────────────────────────\n", attributes: [
                    .font: baseFont,
                    .foregroundColor: NSColor.separatorColor,
                    .paragraphStyle: hrStyle
                ])
            } else if trimmed.isEmpty {
                attrLine = NSAttributedString(string: "\n")
            } else {
                // Apply inline formatting: **bold**, *italic*, `code`
                let mutable = NSMutableAttributedString(string: line + "\n", attributes: [
                    .font: baseFont,
                    .foregroundColor: NSColor.textColor,
                    .paragraphStyle: paragraphStyle
                ])
                applyInlineFormatting(to: mutable, boldFont: boldFont, codeFont: codeFont)
                attrLine = mutable
            }

            result.append(attrLine)
        }

        // Append footer
        let separatorStyle = NSMutableParagraphStyle()
        separatorStyle.paragraphSpacingBefore = 16
        result.append(NSAttributedString(string: "────────────────────────────────\n", attributes: [
            .font: baseFont,
            .foregroundColor: NSColor.separatorColor,
            .paragraphStyle: separatorStyle
        ]))

        let footerStyle = NSMutableParagraphStyle()
        footerStyle.alignment = .center
        result.append(NSAttributedString(string: "UpDown · 2026\n", attributes: [
            .font: NSFont.systemFont(ofSize: 12),
            .foregroundColor: NSColor.tertiaryLabelColor,
            .paragraphStyle: footerStyle
        ]))

        textView.textStorage?.setAttributedString(result)
        handler(nil)
    }

    /// Apply basic inline formatting (**bold**, *italic*, `code`) to an attributed string
    private func applyInlineFormatting(to attrString: NSMutableAttributedString, boldFont: NSFont, codeFont: NSFont) {
        let text = attrString.string

        // Apply `code` formatting
        applyPattern("`([^`]+)`", to: attrString, in: text, attributes: [
            .font: codeFont,
            .foregroundColor: NSColor.systemPurple,
            .backgroundColor: NSColor(white: 0.95, alpha: 1.0)
        ])

        // Apply **bold** formatting
        applyPattern("\\*\\*([^*]+)\\*\\*", to: attrString, in: text, attributes: [
            .font: boldFont
        ])

        // Apply *italic* formatting (but not **)
        applyPattern("(?<!\\*)\\*([^*]+)\\*(?!\\*)", to: attrString, in: text, attributes: [
            .font: NSFont(descriptor: NSFont.systemFont(ofSize: 14).fontDescriptor.withSymbolicTraits(.italic), size: 14) ?? NSFont.systemFont(ofSize: 14)
        ])
    }

    private func applyPattern(_ pattern: String, to attrString: NSMutableAttributedString, in text: String, attributes: [NSAttributedString.Key: Any]) {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        let matches = regex.matches(in: text, range: range)
        for match in matches.reversed() {
            if match.numberOfRanges >= 2 {
                let fullRange = match.range(at: 0)
                let innerRange = match.range(at: 1)
                guard let innerSwiftRange = Range(innerRange, in: text) else { continue }
                let innerText = String(text[innerSwiftRange])
                let replacement = NSAttributedString(string: innerText, attributes: attributes)
                attrString.replaceCharacters(in: fullRange, with: replacement)
            }
        }
    }

    private func displayOnMain(text: String, isError: Bool, handler: @escaping (Error?) -> Void) {
        DispatchQueue.main.async { [weak self] in
            guard let self = self else {
                handler(nil)
                return
            }
            if isError {
                let errorAttr = NSAttributedString(
                    string: text,
                    attributes: [
                        .foregroundColor: NSColor.systemRed,
                        .font: NSFont.systemFont(ofSize: 14)
                    ]
                )
                self.textView.textStorage?.setAttributedString(errorAttr)
            } else {
                let plainAttr = NSAttributedString(
                    string: text,
                    attributes: [
                        .foregroundColor: NSColor.textColor,
                        .font: NSFont.monospacedSystemFont(ofSize: 13, weight: .regular)
                    ]
                )
                self.textView.textStorage?.setAttributedString(plainAttr)
            }
            handler(nil)
        }
    }
}
