/**
 * Editor UI logic (toolbar, view mode). Manages icon toolbar buttons and view state.
 */

import { getDocumentKind } from './document-type.js';

let viewMode = 'split';

/** Preview zoom level in percent (default 100, range 50–300). */
let previewZoom = 100;
const ZOOM_MIN = 50;
const ZOOM_MAX = 300;
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
  if (getDocumentKind() === 'pdf' && mode !== 'preview') {
    mode = 'preview';
  }

  const prevMode = viewMode;
  viewMode = mode;

  // Update active state on view buttons in toolbar
  doc.querySelectorAll('.toolbar-btn.view-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });

  // Set layout class on #app so CSS controls editor/preview visibility
  const app = doc.getElementById('app');
  if (app) {
    app.classList.remove('view-mode-source', 'view-mode-preview', 'view-mode-split', 'view-mode-slides');
    app.classList.add('view-mode-' + mode);
  }

  if (prevMode === 'slides' && mode !== 'slides') {
    viewActionHandlers.deactivateSlides?.();
  }
  if (mode === 'slides') {
    viewActionHandlers.activateSlides?.();
  }
}

/**
 * Show/hide preview vs slides toolbar buttons based on deck detection.
 * @param {Document} doc
 * @param {boolean} isDeck
 */
export function updatePresentationToolbar(doc, isDeck) {
  const app = doc.getElementById('app');
  const previewBtn = doc.querySelector('.preview-view-btn');
  const slidesBtn = doc.querySelector('.slides-view-btn');

  if (app) {
    app.classList.toggle('document-slides', isDeck);
  }
  if (previewBtn) {
    previewBtn.classList.toggle('hidden', isDeck);
  }
  if (slidesBtn) {
    slidesBtn.classList.toggle('hidden', !isDeck);
  }

  if (!isDeck && getViewMode() === 'slides') {
    setViewMode(doc, 'split');
  }
}

/**
 * True when pinch-zoom / Ctrl+wheel should affect preview (not source-only).
 */
function isZoomGestureAllowed(doc) {
  const app = doc.getElementById('app');
  return Boolean(app && !app.classList.contains('view-mode-source'));
}

/** Last pointer position (trackpad pinch often reports 0,0 for wheel events). */
let lastPointerX = 0;
let lastPointerY = 0;

const pointerTrackingWindows = new WeakSet();

/** @type {(() => void) | null} */
let pdfIframeWheelDocCleanup = null;
/** @type {AbortController | null} */
let pdfIframeWheelLoadAc = null;

function setupPointerTrackingForZoom(win) {
  if (!win || pointerTrackingWindows.has(win)) {
    return;
  }
  pointerTrackingWindows.add(win);
  const track = (e) => {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  };
  win.addEventListener('pointermove', track, { capture: true, passive: true });
  win.addEventListener('pointerdown', track, { capture: true, passive: true });
}

/**
 * Coordinates to use for hit-testing pinch/Ctrl+wheel (avoids broken 0,0 from trackpads).
 * @param {WheelEvent} e
 * @param {Document} doc
 */
function pointerPositionForZoomHitTest(e, doc) {
  let x = e.clientX;
  let y = e.clientY;
  if (x === 0 && y === 0) {
    x = lastPointerX;
    y = lastPointerY;
  }
  if (x === 0 && y === 0) {
    const pc = doc.querySelector('.preview-container');
    if (pc) {
      const r = pc.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
  }
  return { x, y };
}

/**
 * True if (clientX, clientY) lies over the preview column (markdown preview or PDF area).
 */
function isPointerOverPreviewPane(clientX, clientY, doc) {
  const preview = doc.getElementById('preview');
  const pdfWrap = doc.getElementById('pdf-viewer-wrap');
  const slidesWrap = doc.getElementById('slides-viewer-wrap');
  const container = doc.querySelector('.preview-container');

  if (container) {
    const win = doc.defaultView;
    const cs = win?.getComputedStyle(container);
    if (cs && cs.display !== 'none') {
      const r = container.getBoundingClientRect();
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        const pdfVisible = Boolean(pdfWrap && !pdfWrap.classList.contains('hidden'));
        const slidesVisible = Boolean(slidesWrap && !slidesWrap.classList.contains('hidden'));
        const mdPreviewVisible = Boolean(
          preview && !preview.classList.contains('preview-hidden-for-pdf') &&
          !preview.classList.contains('preview-hidden-for-slides')
        );
        if (pdfVisible || mdPreviewVisible || slidesVisible) {
          return true;
        }
      }
    }
  }

  // Fallback when `.preview-container` is missing (minimal test fixtures / older markup).
  const pdfOuter = doc.querySelector('.pdf-viewer-zoom-outer');
  if (preview && !preview.classList.contains('preview-hidden-for-pdf')) {
    const r = preview.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return true;
    }
  }
  if (pdfWrap && !pdfWrap.classList.contains('hidden') && pdfOuter) {
    const r = pdfOuter.getBoundingClientRect();
    if (
      clientX >= r.left &&
      clientX <= r.right &&
      clientY >= r.top &&
      clientY <= r.bottom
    ) {
      return true;
    }
  }

  return false;
}

function isEditableZoomTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest?.('[contenteditable="true"]'));
}

/** Avoid duplicate capture listeners if setupToolbar runs more than once (e.g. tests). */
const wheelZoomAttached = new WeakMap();

/**
 * Apply one wheel delta to preview/PDF zoom (shared: main document + PDF iframe).
 * @param {WheelEvent} e
 * @param {Document} doc - host document (#app)
 */
function applyWheelToPreviewZoom(e, doc) {
  let dy = e.deltaY;
  if (e.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    dy *= 16;
  } else if (e.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    dy *= 400;
  }

  const direction = dy > 0 ? -1 : 1;
  const magnitude = Math.min(45, Math.max(4, Math.round(Math.abs(dy) * 0.12)));
  let next = previewZoom + direction * magnitude;
  next = Math.round(next / 5) * 5;
  previewZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
  applyZoom(doc);
}

/**
 * Wheel on same-origin PDF iframe does not bubble to the host document; bind inside the iframe.
 * Cross-origin (e.g. Tauri asset URL) cannot be hooked — use toolbar zoom there.
 * @param {HTMLIFrameElement} iframe
 */
export function bindPdfIframeWheelZoom(iframe) {
  detachPdfIframeWheelZoom();
  const rootDoc = iframe.ownerDocument;
  const win = rootDoc.defaultView;
  if (!win) {
    return;
  }

  const onLoad = () => {
    pdfIframeWheelDocCleanup?.();
    pdfIframeWheelDocCleanup = null;
    try {
      const idoc = iframe.contentWindow?.document;
      if (!idoc) {
        return;
      }
      const handler = (e) => {
        if (!(e.ctrlKey || e.metaKey)) {
          return;
        }
        if (!isZoomGestureAllowed(rootDoc)) {
          return;
        }
        e.preventDefault();
        applyWheelToPreviewZoom(e, rootDoc);
      };
      idoc.addEventListener('wheel', handler, { capture: true, passive: false });
      pdfIframeWheelDocCleanup = () => {
        idoc.removeEventListener('wheel', handler, { capture: true });
      };
    } catch {
      /* cross-origin PDF viewer */
    }
  };

  pdfIframeWheelLoadAc = new AbortController();
  iframe.addEventListener('load', onLoad, { signal: pdfIframeWheelLoadAc.signal });
  requestAnimationFrame(() => {
    try {
      if (iframe.contentDocument?.readyState === 'complete') {
        onLoad();
      }
    } catch {
      /* cross-origin */
    }
  });
}

/** Remove PDF iframe wheel forwarding (new file or hide viewer). */
export function detachPdfIframeWheelZoom() {
  pdfIframeWheelLoadAc?.abort();
  pdfIframeWheelLoadAc = null;
  pdfIframeWheelDocCleanup?.();
  pdfIframeWheelDocCleanup = null;
}

/**
 * Ctrl+wheel / trackpad pinch zooms preview and PDF. Uses capture on the host document.
 */
function setupPreviewWheelZoom(doc) {
  if (wheelZoomAttached.get(doc)) {
    return;
  }
  wheelZoomAttached.set(doc, true);

  const win = doc.defaultView;
  if (win) {
    setupPointerTrackingForZoom(win);
  }

  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) {
      return;
    }
    if (!isZoomGestureAllowed(doc)) {
      return;
    }
    const { x, y } = pointerPositionForZoomHitTest(e, doc);
    if (!isPointerOverPreviewPane(x, y, doc)) {
      return;
    }
    if (isEditableZoomTarget(e.target)) {
      return;
    }

    e.preventDefault();

    applyWheelToPreviewZoom(e, doc);
  };

  doc.addEventListener('wheel', onWheel, { capture: true, passive: false });
}

/**
 * Apply the current previewZoom to markdown preview, PDF viewer, and toolbar label.
 * @param {Document} doc
 */
function applyZoom(doc) {
  const z = previewZoom / 100;
  const preview = doc.getElementById('preview');
  const pdfWrap = doc.getElementById('pdf-viewer-wrap');
  const slidesWrap = doc.getElementById('slides-viewer-wrap');
  const label = doc.getElementById('zoom-level');
  if (preview) {
    preview.style.setProperty('--preview-zoom', String(z));
  }
  if (pdfWrap) {
    pdfWrap.style.setProperty('--preview-zoom', String(z));
  }
  if (slidesWrap) {
    slidesWrap.style.setProperty('--preview-zoom', String(z));
  }
  if (label) {
    label.textContent = previewZoom + '%';
  }
  const zoomOut = doc.querySelector('[data-action="zoomOut"]');
  const zoomIn = doc.querySelector('[data-action="zoomIn"]');
  const zoomReset = doc.querySelector('[data-action="zoomReset"]');
  if (zoomOut) zoomOut.disabled = previewZoom <= ZOOM_MIN;
  if (zoomIn) zoomIn.disabled = previewZoom >= ZOOM_MAX;
  if (zoomReset) zoomReset.disabled = previewZoom === 100;
}

/**
 * Re-apply zoom (e.g. after a PDF iframe is shown) so PDF uses the current preview zoom level.
 * @param {Document} [doc]
 */
export function applyPreviewZoom(doc = document) {
  applyZoom(doc);
}

/**
 * Reset preview/PDF zoom to 100%.
 * @param {Document} [doc]
 */
export function resetPreviewZoom(doc = document) {
  previewZoom = 100;
  applyZoom(doc);
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
      } else if (action === 'zoomReset') {
        resetPreviewZoom(doc);
      } else if (action) {
        onAction(action);
      }
    });
  });

  setupPreviewWheelZoom(doc);
  applyZoom(doc);
}
