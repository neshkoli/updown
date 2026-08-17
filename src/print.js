/**
 * Print formatted document content (rendered markdown or PDF).
 */
import { getDocumentKind } from './document-type.js';

/**
 * Wait for layout/paint after applying print-only CSS classes.
 * @param {Window} win
 */
function waitForPrintLayout(win) {
  return new Promise((resolve) => {
    win.requestAnimationFrame(() => {
      win.requestAnimationFrame(() => {
        win.setTimeout(resolve, 50);
      });
    });
  });
}

/**
 * Invoke the native print dialog (Tauri command or window.print).
 * @returns {Promise<boolean>}
 */
async function invokeNativePrint() {
  const tauri = window.__TAURI__;
  if (tauri?.core?.invoke) {
    try {
      await tauri.core.invoke('print_webview');
      return true;
    } catch (err) {
      console.error('print_webview failed:', err);
    }
  }

  const win = window;
  if (typeof win.print === 'function') {
    win.print();
    return true;
  }

  return false;
}

/**
 * Open the system print dialog, temporarily applying a body class for @media print rules.
 * @param {Document} doc
 * @param {string} className
 */
async function printWithBodyClass(doc, className) {
  const body = doc.body;
  const win = doc.defaultView;
  if (!body || !win) {
    return;
  }

  body.classList.add(className);

  const cleanup = () => {
    body.classList.remove(className);
    win.removeEventListener('afterprint', cleanup);
  };

  win.addEventListener('afterprint', cleanup);
  win.setTimeout(() => {
    if (body.classList.contains(className)) {
      cleanup();
    }
  }, 60_000);

  await waitForPrintLayout(win);
  const ok = await invokeNativePrint();
  if (!ok) {
    cleanup();
    console.error('Print is not available in this environment');
  }
}

/**
 * Print the embedded PDF viewer when same-origin access is available.
 * @param {Document} doc
 */
async function printPdf(doc) {
  const iframe = doc.getElementById('pdf-viewer');
  const iwin = iframe?.contentWindow;

  // iframe.print() works in browsers/Windows but silently fails in Tauri/macOS.
  if (iwin && typeof iwin.print === 'function' && !window.__TAURI__) {
    try {
      iwin.focus();
      iwin.print();
      return;
    } catch {
      /* fall through to main-document print */
    }
  }

  await printWithBodyClass(doc, 'printing-pdf');
}

/**
 * Open the system print dialog for the formatted preview (markdown HTML or PDF).
 * @param {Document} [doc]
 * @param {{ refreshPreview?: () => void }} [options]
 */
export async function printFormattedDocument(doc = document, options = {}) {
  options.refreshPreview?.();

  if (getDocumentKind() === 'pdf') {
    await printPdf(doc);
    return;
  }

  await printWithBodyClass(doc, 'printing-markdown');
}
