/**
 * Editor UI logic (toolbar, view mode). Manages icon toolbar buttons and view state.
 */

let viewMode = 'split';

/** Preview zoom level in percent (default 100, range 50–200). */
let previewZoom = 100;
const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

/** Registry of file-action callbacks set by the main module. */
let fileActionHandlers = {};

/** Registry of view-action callbacks (e.g. toggleFolder). */
let viewActionHandlers = {};

/** Callback for markdown formatting commands. */
let mdCommandHandler = null;

export function getViewMode() {
  return viewMode;
}

/**
 * Register callbacks for file actions (new, open, save, saveAs).
 * @param {Record<string, () => void | Promise<void>>} handlers
 */
export function setFileActionHandlers(handlers) {
  fileActionHandlers = handlers;
}

/**
 * Register callbacks for view actions (e.g. toggleFolder).
 * @param {Record<string, () => void>} handlers
 */
export function setViewActionHandlers(handlers) {
  viewActionHandlers = handlers;
}

/**
 * Register callback for markdown formatting commands.
 * @param {(command: string) => void} handler
 */
export function setMdCommandHandler(handler) {
  mdCommandHandler = handler;
}

/**
 * Execute a registered action by name.
 * Checks view action handlers first, then file action handlers.
 * @param {string} action - action identifier (e.g. 'new', 'open', 'save', 'saveAs', 'toggleFolder')
 */
export function onAction(action) {
  if (viewActionHandlers[action]) {
    viewActionHandlers[action]();
  } else if (fileActionHandlers[action]) {
    fileActionHandlers[action]();
  }
}

/**
 * Set the active view mode and update the toolbar button states.
 */
export function setViewMode(doc, mode) {
  viewMode = mode;

  // Update active state on view buttons in toolbar
  doc.querySelectorAll('.toolbar-btn.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Set layout class on #app so CSS controls editor/preview visibility
  const app = doc.getElementById('app');
  if (app) {
    app.classList.remove('view-mode-source', 'view-mode-preview', 'view-mode-split');
    app.classList.add('view-mode-' + mode);
  }
}

/**
 * Apply the current previewZoom to the preview element and update the label.
 * @param {Document} doc
 */
function applyZoom(doc) {
  const preview = doc.getElementById('preview');
  const label = doc.getElementById('zoom-level');
  if (preview) {
    preview.style.setProperty('--preview-zoom', previewZoom / 100);
  }
  if (label) {
    label.textContent = previewZoom + '%';
  }
  // Disable buttons at limits
  const zoomOut = doc.querySelector('[data-action="zoomOut"]');
  const zoomIn = doc.querySelector('[data-action="zoomIn"]');
  if (zoomOut) zoomOut.disabled = previewZoom <= ZOOM_MIN;
  if (zoomIn) zoomIn.disabled = previewZoom >= ZOOM_MAX;
}

/**
 * Set up all toolbar button event listeners.
 */
export function setupToolbar(doc) {
  doc.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const mode = btn.dataset.mode;
      const md = btn.dataset.md;

      if (mode) {
        setViewMode(doc, mode);
      } else if (md) {
        if (mdCommandHandler) mdCommandHandler(md);
      } else if (action === 'zoomIn') {
        previewZoom = Math.min(ZOOM_MAX, previewZoom + ZOOM_STEP);
        applyZoom(doc);
      } else if (action === 'zoomOut') {
        previewZoom = Math.max(ZOOM_MIN, previewZoom - ZOOM_STEP);
        applyZoom(doc);
      } else if (action) {
        onAction(action);
      }
    });
  });

  // Apply default zoom on init
  applyZoom(doc);
}
