/**
 * File operations for UpDown.
 * Uses the storage provider abstraction (Tauri, Google Drive, or guest).
 */

import { setViewMode } from './editor-ui.js';
import { getDocumentKind, setDocumentKind, shouldOpenAsPdf } from './document-type.js';
import { getStorageProvider } from './storage/provider.js';
import {
  hidePdfViewer,
  reloadPdfViewer,
  showPdfForPath,
  showPdfFromArrayBuffer,
  showPdfFromFile,
} from './pdf-view.js';

let currentFilePath = null;
let currentFileDisplayName = null; // human-readable name (set when Drive ID is used as path)
let dirty = false;
let savedContent = '';

export function getCurrentFilePath() {
  return currentFilePath;
}

export function setCurrentFilePath(path) {
  currentFilePath = path;
  currentFileDisplayName = null; // reset; caller may set via setCurrentFileName
}

/**
 * Override the display name shown in the title bar.
 * Useful when currentFilePath is an opaque ID (e.g. Google Drive file ID).
 * @param {string|null} name
 */
export function setCurrentFileName(name) {
  currentFileDisplayName = name || null;
  updateTitle();
}

export function isDirty() {
  return dirty;
}

/**
 * Update the window title bar, showing * when modified.
 */
function updateTitle() {
  const name = currentFileDisplayName || (currentFilePath ? basename(currentFilePath) : 'Untitled');
  const modifier = dirty ? ' *' : '';
  const title = `${name}${modifier} — UpDown`;
  document.title = title;
  // Update native Tauri window title via IPC
  if (window.__TAURI__?.core?.invoke) {
    window.__TAURI__.core.invoke('plugin:window|set_title', {
      label: 'main',
      value: title,
    }).catch(() => {});
  }
}

/**
 * Mark the document as clean (just saved / just opened).
 * @param {string} content - the current saved content
 */
function markClean(content) {
  savedContent = content;
  dirty = false;
  updateTitle();
}

/**
 * Externally mark the document as saved with the given content.
 * Used by web-specific save flows that bypass fileSave/fileSaveAs.
 * @param {string} content
 */
export function markFileSaved(content) {
  markClean(content);
}

/**
 * Mark the document as dirty (has unsaved changes).
 */
export function markDirty() {
  if (!dirty) {
    dirty = true;
    updateTitle();
  }
}

/**
 * Check if content differs from the last saved snapshot and update dirty state.
 * @param {string} content
 */
export function checkDirty(content) {
  const wasDirty = dirty;
  dirty = content !== savedContent;
  if (dirty !== wasDirty) {
    updateTitle();
  }
}

/**
 * Extract filename from a path or id.
 * @param {string} path
 * @returns {string}
 */
function basename(path) {
  if (!path) return '';
  return path.replace(/.*[\\/]/, '');
}

/** True for absolute/Windows paths; false for opaque ids (e.g. Google Drive file id). */
function isLikelyFilesystemPath(fileId) {
  return (
    fileId.includes('/') ||
    fileId.includes('\\') ||
    /^[A-Za-z]:[\\/]/.test(fileId)
  );
}

/**
 * New file: clear editor, reset path and title.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview - re-render the preview
 */
export function fileNew(editor, refreshPreview) {
  hidePdfViewer();
  setDocumentKind('markdown');
  editor.value = '';
  currentFilePath = null;
  currentFileDisplayName = null;
  markClean('');
  refreshPreview();
}

/**
 * Show an error message to the user.
 * @param {string} message
 */
function showError(message) {
  console.error(message);
  if (window.__TAURI__?.dialog?.message) {
    window.__TAURI__.dialog.message(message, { title: 'UpDown — Error', kind: 'error' });
  } else {
    alert(message);
  }
}

/**
 * Reload the current file from disk (discard in-memory changes).
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
export async function fileRefresh(editor, refreshPreview) {
  if (!currentFilePath) {
    showError('No file open to refresh.');
    return;
  }
  if (getDocumentKind() === 'pdf') {
    const provider = getStorageProvider();
    if (provider?.readFileAsArrayBuffer && !window.__TAURI__) {
      try {
        const buf = await provider.readFileAsArrayBuffer(currentFilePath);
        if (!showPdfFromArrayBuffer(buf)) {
          showError('Failed to reload PDF.');
        }
      } catch (err) {
        showError(`Failed to reload PDF: ${err.message || err}`);
      }
      return;
    }
    reloadPdfViewer();
    return;
  }
  await fileOpenPath(currentFilePath, editor, refreshPreview);
}

/**
 * Open a file by its id (path for Tauri, fileId for Drive).
 * @param {string} fileId
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 * @param {{ displayName?: string }} [options] - Drive file name when fileId is opaque (for PDF detection and title)
 */
export async function fileOpenPath(fileId, editor, refreshPreview, options = {}) {
  const displayName = options.displayName;

  if (shouldOpenAsPdf(fileId, displayName)) {
    hidePdfViewer();
    setDocumentKind('pdf');
    editor.value = '';
    currentFilePath = fileId;
    if (Object.prototype.hasOwnProperty.call(options, 'displayName')) {
      setCurrentFileName(displayName || null);
    } else if (isLikelyFilesystemPath(fileId)) {
      setCurrentFileName(null);
    }
    markClean('');

    let ok = false;
    if (window.__TAURI__) {
      ok = showPdfForPath(fileId);
    } else {
      const provider = getStorageProvider();
      if (provider?.readFileAsArrayBuffer) {
        try {
          const buf = await provider.readFileAsArrayBuffer(fileId);
          ok = showPdfFromArrayBuffer(buf);
        } catch (err) {
          showError(`Failed to open PDF: ${err.message || err}`);
        }
      } else {
        showError('PDF is not available for this storage.');
      }
    }

    if (!ok) {
      currentFilePath = null;
      currentFileDisplayName = null;
      setDocumentKind('markdown');
      hidePdfViewer();
      return;
    }
    setViewMode(document, 'preview');
    refreshPreview();

    if (window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('add_recent_file', { path: fileId }).catch(() => {});
    }
    return;
  }

  const provider = getStorageProvider();
  if (!provider?.readFile) return;

  try {
    hidePdfViewer();
    setDocumentKind('markdown');
    const content = await provider.readFile(fileId);
    editor.value = content;
    currentFilePath = fileId;
    if (Object.prototype.hasOwnProperty.call(options, 'displayName')) {
      setCurrentFileName(displayName || null);
    } else if (isLikelyFilesystemPath(fileId)) {
      setCurrentFileName(null);
    }
    markClean(content);
    refreshPreview();

    if (window.__TAURI__?.core?.invoke) {
      window.__TAURI__.core.invoke('add_recent_file', { path: fileId }).catch(() => {});
    }
  } catch (err) {
    showError(`Failed to open file: ${err.message || err}`);
  }
}

/**
 * Open file: show dialog (or picker), read file, set editor content.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
export async function fileOpen(editor, refreshPreview) {
  const provider = getStorageProvider();
  if (!provider?.showOpenDialog) return;

  try {
    const fileId = await provider.showOpenDialog();
    if (!fileId) return;

    await fileOpenPath(fileId, editor, refreshPreview);
  } catch (err) {
    showError(`Failed to open file: ${err.message || err}`);
  }
}

/**
 * Save file: write to currentFilePath, or fall through to Save As.
 * @param {HTMLTextAreaElement} editor
 */
export async function fileSave(editor) {
  if (getDocumentKind() === 'pdf') {
    return;
  }
  if (currentFilePath) {
    const provider = getStorageProvider();
    if (!provider?.writeFile) return;
    try {
      await provider.writeFile(currentFilePath, editor.value);
      markClean(editor.value);
    } catch (err) {
      showError(`Failed to save file: ${err.message || err}`);
    }
  } else {
    await fileSaveAs(editor);
  }
}

/** Leave PDF mode and tear down the iframe (e.g. before loading markdown from web drop). */
export function resetToMarkdownView() {
  hidePdfViewer();
  setDocumentKind('markdown');
}

/**
 * Open a PDF from a browser File (web drag-and-drop).
 * @param {File} file
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
export function fileOpenPdfFile(file, editor, refreshPreview) {
  hidePdfViewer();
  setDocumentKind('pdf');
  editor.value = '';
  currentFilePath = file.name;
  setCurrentFileName(null);
  markClean('');
  const ok = showPdfFromFile(file);
  if (!ok) {
    currentFilePath = null;
    setDocumentKind('markdown');
    hidePdfViewer();
    return;
  }
  setViewMode(document, 'preview');
  refreshPreview();
}

export async function fileSaveAs(editor) {
  if (getDocumentKind() === 'pdf') {
    return;
  }
  const provider = getStorageProvider();
  if (!provider?.showSaveDialog) return;

  try {
    const defaultName = currentFilePath ? basename(currentFilePath) : 'untitled.md';
    const result = await provider.showSaveDialog(defaultName);
    if (!result) return;

    let fileId;
    if (result.fileId) {
      await provider.writeFile(result.fileId, editor.value);
      fileId = result.fileId;
    } else {
      fileId = await provider.createFile(result.parentId, result.name, editor.value);
    }
    currentFilePath = fileId;
    markClean(editor.value);
  } catch (err) {
    showError(`Failed to save file: ${err.message || err}`);
  }
}
