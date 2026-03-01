/**
 * File operations for UpDown.
 * Uses the storage provider abstraction (Tauri, Google Drive, or guest).
 */

import { getStorageProvider, hasStorageCapability } from './storage/provider.js';

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

/**
 * New file: clear editor, reset path and title.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview - re-render the preview
 */
export function fileNew(editor, refreshPreview) {
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
  await fileOpenPath(currentFilePath, editor, refreshPreview);
}

/**
 * Open a file by its id (path for Tauri, fileId for Drive).
 * @param {string} fileId
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
export async function fileOpenPath(fileId, editor, refreshPreview) {
  const provider = getStorageProvider();
  if (!provider?.readFile) return;

  try {
    const content = await provider.readFile(fileId);
    editor.value = content;
    currentFilePath = fileId;
    markClean(content);
    refreshPreview();

    // Record in recent files (Tauri native "Open Recent" menu)
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

/**
 * Save As: show dialog, write file, update path and title.
 * @param {HTMLTextAreaElement} editor
 */
export async function fileSaveAs(editor) {
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
