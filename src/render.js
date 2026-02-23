/**
 * Markdown rendering module.
 * Uses the global `markdownit` from the UMD build loaded in index.html.
 */
import { applyBidi } from './bidi.js';
import { debounce } from './utils.js';

/** Escape HTML special characters for safe insertion. */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Initialize markdown-it with sensible defaults
const md = window.markdownit({
  html: false,        // don't allow raw HTML in source
  linkify: true,      // auto-link URLs
  typographer: true,  // smart quotes, dashes
});

// Initialize mermaid (disable auto-start; we call mermaid.run() manually after each render)
if (window.mermaid) {
  window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
}

// Render mermaid fenced blocks as <pre class="mermaid"> instead of <pre><code>
const defaultFence = md.renderer.rules.fence ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.fence = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const lang = (token.info || '').trim().toLowerCase();
  if (lang === 'mermaid') {
    const code = token.content.trim();
    return `<pre class="mermaid">${escapeHtml(code)}</pre>\n`;
  }
  return defaultFence(tokens, idx, options, env, self);
};

// Generate heading IDs so internal anchor links work
md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
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
const defaultLinkOpen = md.renderer.rules.link_open ||
  function (tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const href = token.attrGet('href');
  if (href && !token.attrGet('title')) {
    token.attrSet('title', href);
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

/**
 * Extract YAML frontmatter from markdown source.
 * Returns { metadata: [{key, value}] | null, body: string }.
 * Frontmatter must start on the first line with "---" and end with "---".
 * @param {string} source
 * @returns {{ metadata: Array<{key: string, value: string}> | null, body: string }}
 */
export function extractFrontmatter(source) {
  if (!source) return { metadata: null, body: source || '' };

  const lines = source.split('\n');
  if (lines.length < 3 || lines[0].trim() !== '---') {
    return { metadata: null, body: source };
  }

  // Find closing ---
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex < 2) return { metadata: null, body: source };

  const yamlLines = lines.slice(1, closingIndex);
  const body = lines.slice(closingIndex + 1).join('\n');

  // Parse simple YAML key: value pairs
  const metadata = [];
  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (key) {
        metadata.push({ key, value });
      }
    } else if (trimmed.startsWith('- ') && metadata.length > 0) {
      // List item — append to last key's value
      const item = trimmed.slice(2);
      const last = metadata[metadata.length - 1];
      last.value = last.value ? last.value + ', ' + item : item;
    }
  }

  return { metadata: metadata.length > 0 ? metadata : null, body };
}

/**
 * Render markdown source text to HTML string.
 * @param {string} source
 * @returns {string}
 */
export function renderMarkdown(source) {
  return md.render(source || '');
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
        const safeValue = value ? escapeHtml(value) : '<span style="color:#8b949e">(empty)</span>';
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
