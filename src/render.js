/**
 * Markdown rendering module.
 * Uses the global `markdownit` from the UMD build loaded in index.html.
 */
import { applyBidi } from './bidi.js';
import { getDocumentKind } from './document-type.js';
import { escapeHtml, extractFrontmatter } from './frontmatter.js';
import { stripHtmlForPreview } from './markdown-sanitize.js';
import { isPresentationDeck } from './presentation-detect.js';
import { updatePresentationToolbar, getViewMode } from './editor-ui.js';
import { updateSlidesView } from './slides-view.js';
import { debounce } from './utils.js';

// Lazily initialized markdown-it instance.
// Cannot be created at module-evaluation time because in the web build (ESM
// via Vite), all static imports are hoisted and evaluated before the
// importing module's body runs, so window.markdownit may not yet be assigned
// when this module is first executed.
let _md = null;

function getMd() {
  if (_md) return _md;

  const MarkdownIt = window.markdownit;
  if (!MarkdownIt) {
    throw new Error(
      'markdown-it not available. Ensure it is loaded (UMD script or window.markdownit assignment) before calling render functions.'
    );
  }

  _md = MarkdownIt({
    // Inline HTML is sanitized to <kbd> only before render (see markdown-sanitize.js).
    html: true,
    linkify: true,      // auto-link URLs
    typographer: true,  // smart quotes, dashes
  });

  // Initialize mermaid once, alongside md
  if (window.mermaid) {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
  }

  // Render mermaid fenced blocks as <pre class="mermaid"> instead of <pre><code>
  const defaultFence = _md.renderer.rules.fence ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  _md.renderer.rules.fence = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const lang = (token.info || '').trim().toLowerCase();
    if (lang === 'mermaid') {
      const code = token.content.trim();
      return `<pre class="mermaid">${escapeHtml(code)}</pre>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };

  // Generate heading IDs so internal anchor links work
  _md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const content = tokens[idx + 1]?.content || '';
    const id = content
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
    if (id) {
      token.attrSet('id', id);
    }
    return self.renderToken(tokens, idx, options);
  };

  // Add title attribute to links for native tooltip
  const defaultLinkOpen = _md.renderer.rules.link_open ||
    function (tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  _md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const href = token.attrGet('href');
    if (href && !token.attrGet('title')) {
      token.attrSet('title', href);
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };

  return _md;
}

/**
 * Render markdown source text to HTML string.
 * @param {string} source
 * @param {{ allowLayoutHtml?: boolean }} [options]
 * @returns {string}
 */
export function renderMarkdown(source, options = {}) {
  return getMd().render(stripHtmlForPreview(source || '', options));
}

/**
 * Set up live preview: on editor input, debounce-render markdown into preview div.
 * Returns the immediate update function so callers (e.g. file-ops) can refresh.
 * @param {HTMLTextAreaElement} editor
 * @param {HTMLElement} preview
 * @param {number} [delayMs=150]
 * @returns {() => void} immediate refresh function
 */
export function setupLivePreview(editor, preview, delayMs = 150) {
  const metadataPanel = document.getElementById('metadata-panel');
  const metadataContent = document.getElementById('metadata-content');

  function update() {
    if (getDocumentKind() === 'pdf') {
      return;
    }
    const isDeck = isPresentationDeck(editor.value);
    updatePresentationToolbar(document, isDeck);

    if (getViewMode() === 'slides' && isDeck) {
      updateSlidesView(editor.value);
      return;
    }

    const { metadata, body } = extractFrontmatter(editor.value);

    // Render body (without frontmatter) into preview
    preview.innerHTML = renderMarkdown(body);
    applyBidi(preview);

    // Render any mermaid diagrams found in the preview
    if (window.mermaid) {
      const diagrams = preview.querySelectorAll('pre.mermaid');
      if (diagrams.length > 0) {
        window.mermaid.run({ nodes: diagrams });
      }
    }

    // Update metadata panel
    if (metadata && metadataPanel && metadataContent) {
      metadataPanel.classList.remove('hidden');
      const rows = metadata.map(({ key, value }) => {
        const safeKey = escapeHtml(key);
        const displayValue = value === true ? 'true' : value === false ? 'false' : value;
        const safeValue = displayValue ? escapeHtml(String(displayValue)) : '<span style="color:#8b949e">(empty)</span>';
        return `<tr><td class="meta-key">${safeKey}</td><td class="meta-value">${safeValue}</td></tr>`;
      }).join('');
      metadataContent.innerHTML = `<table>${rows}</table>`;
    } else if (metadataPanel) {
      metadataPanel.classList.add('hidden');
      if (metadataContent) metadataContent.innerHTML = '';
    }
  }

  const debouncedUpdate = debounce(update, delayMs);

  editor.addEventListener('input', debouncedUpdate);
  editor.addEventListener('paste', debouncedUpdate);

  // Show link URL in status bar on hover (like a browser)
  const linkStatus = document.getElementById('link-status');
  if (linkStatus) {
    preview.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a');
      if (link) {
        const href = link.getAttribute('href') || '';
        linkStatus.textContent = href;
        linkStatus.classList.add('visible');
      }
    });

    preview.addEventListener('mouseout', (e) => {
      const link = e.target.closest('a');
      if (link && !link.contains(e.relatedTarget)) {
        linkStatus.textContent = '';
        linkStatus.classList.remove('visible');
      }
    });
  }

  // Intercept link clicks in the preview
  preview.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    e.preventDefault();
    const href = link.getAttribute('href');
    if (!href) return;

    if (href.startsWith('#')) {
      // Internal anchor link — scroll to the target element within the preview
      const targetId = href.slice(1);
      const target = preview.querySelector('#' + CSS.escape(targetId));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else if (/^https?:\/\//i.test(href)) {
      // External link — open in the system browser
      if (window.__TAURI__?.opener?.openUrl) {
        window.__TAURI__.opener.openUrl(href);
      } else {
        window.open(href, '_blank');
      }
    }
  });

  // Initial render (in case there is content already)
  update();

  return update;
}

export { extractFrontmatter } from './frontmatter.js';
