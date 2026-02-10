/**
 * Markdown rendering module.
 * Uses the global `markdownit` from the UMD build loaded in index.html.
 */
import { applyBidi } from './bidi.js';
import { debounce } from './utils.js';
export { debounce };

// Initialize markdown-it with sensible defaults
const md = window.markdownit({
  html: false,        // don't allow raw HTML in source
  linkify: true,      // auto-link URLs
  typographer: true,  // smart quotes, dashes
});

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
  function update() {
    preview.innerHTML = renderMarkdown(editor.value);
    applyBidi(preview);
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
      if (link) {
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
