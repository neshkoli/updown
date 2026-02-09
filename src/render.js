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

  // Initial render (in case there is content already)
  update();

  return update;
}
