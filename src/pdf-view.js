/**
 * Embeds PDF files in an iframe.
 * - Tauri: window.__TAURI__.core.convertFileSrc (withGlobalTauri)
 * - Web: URL.createObjectURL(File)
 * Tests: set globalThis.__UPDOWN_TEST_PDF_SRC__ to a string URL.
 */

import { applyPreviewZoom, bindPdfIframeWheelZoom, detachPdfIframeWheelZoom } from './editor-ui.js';

/** @type {string|null} */
let blobUrlToRevoke = null;

function notifyPdfError(message) {
  console.error(message);
  if (window.__TAURI__?.dialog?.message) {
    window.__TAURI__.dialog.message(message, { title: 'UpDown', kind: 'warning' });
  } else {
    alert(message);
  }
}

function revokeBlobIfAny() {
  if (blobUrlToRevoke) {
    URL.revokeObjectURL(blobUrlToRevoke);
    blobUrlToRevoke = null;
  }
}

/**
 * @param {string} src - URL for iframe
 * @returns {boolean}
 */
function applyPdfSrc(src) {
  const iframe = document.getElementById('pdf-viewer');
  const wrap = document.getElementById('pdf-viewer-wrap');
  const preview = document.getElementById('preview');
  const metadataPanel = document.getElementById('metadata-panel');
  const app = document.getElementById('app');

  if (!iframe || !wrap || !preview) {
    notifyPdfError('PDF viewer is not available in this layout.');
    return false;
  }

  if (app) app.classList.add('document-pdf');
  preview.classList.add('preview-hidden-for-pdf');
  wrap.classList.remove('hidden');
  if (metadataPanel) metadataPanel.classList.add('hidden');
  iframe.src = src;
  bindPdfIframeWheelZoom(iframe);
  applyPreviewZoom(document);
  return true;
}

function convertLocalPathToSrc(filePath) {
  if (typeof globalThis.__UPDOWN_TEST_PDF_SRC__ === 'string') {
    return globalThis.__UPDOWN_TEST_PDF_SRC__;
  }
  // Tauri 2: convertFileSrc lives on __TAURI_INTERNALS__; core.convertFileSrc when withGlobalTauri bundles it.
  const internals = window.__TAURI_INTERNALS__;
  if (typeof internals?.convertFileSrc === 'function') {
    return internals.convertFileSrc(filePath, 'asset');
  }
  const convert = window.__TAURI__?.core?.convertFileSrc;
  if (typeof convert === 'function') {
    return convert(filePath, 'asset');
  }
  return null;
}

/**
 * Show PDF for an absolute filesystem path (desktop). Returns false if the viewer could not be shown.
 * @param {string} filePath
 * @returns {boolean}
 */
export function showPdfForPath(filePath) {
  revokeBlobIfAny();

  const src = convertLocalPathToSrc(filePath);
  if (!src) {
    notifyPdfError('Could not load this PDF.');
    return false;
  }

  return applyPdfSrc(src);
}

/**
 * Show PDF from a File object (web drag-and-drop). Caller sets document state in file-ops.
 * @param {File} file
 * @returns {boolean}
 */
export function showPdfFromFile(file) {
  revokeBlobIfAny();
  if (!file || typeof file.name !== 'string' || !/\.pdf$/i.test(file.name)) {
    return false;
  }
  const src = URL.createObjectURL(file);
  blobUrlToRevoke = src;
  return applyPdfSrc(src);
}

/**
 * Show PDF from raw bytes (e.g. Google Drive download).
 * @param {ArrayBuffer} buffer
 * @returns {boolean}
 */
export function showPdfFromArrayBuffer(buffer) {
  revokeBlobIfAny();
  if (!buffer || !(buffer instanceof ArrayBuffer)) {
    return false;
  }
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const src = URL.createObjectURL(blob);
  blobUrlToRevoke = src;
  return applyPdfSrc(src);
}

/** Tear down PDF UI (does not change document kind — caller sets that). */
export function hidePdfViewer() {
  detachPdfIframeWheelZoom();
  revokeBlobIfAny();

  const iframe = document.getElementById('pdf-viewer');
  const wrap = document.getElementById('pdf-viewer-wrap');
  const preview = document.getElementById('preview');
  const metadataPanel = document.getElementById('metadata-panel');
  const app = document.getElementById('app');

  if (iframe) {
    iframe.removeAttribute('src');
  }
  if (wrap) {
    wrap.classList.add('hidden');
  }
  if (preview) {
    preview.classList.remove('preview-hidden-for-pdf');
  }
  if (app) {
    app.classList.remove('document-pdf');
  }
  if (metadataPanel) {
    metadataPanel.classList.remove('hidden');
  }
}

/** Reload the current PDF (e.g. after Refresh). */
export function reloadPdfViewer() {
  const iframe = document.getElementById('pdf-viewer');
  if (!iframe?.src) return;
  const url = iframe.src;
  iframe.src = '';
  iframe.src = url;
  bindPdfIframeWheelZoom(iframe);
}
