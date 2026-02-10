/**
 * File operations for UpDown.
 * Uses Tauri global APIs (window.__TAURI__) when available, falls back to no-ops.
 */

let currentFilePath = null;
let dirty = false;
let savedContent = '';

export function getCurrentFilePath() {
  return currentFilePath;
}

export function setCurrentFilePath(path) {
  currentFilePath = path;
}

export function isDirty() {
  return dirty;
}

/**
 * Update the window title bar, showing * when modified.
 */
function updateTitle() {
  const name = currentFilePath ? basename(currentFilePath) : 'Untitled';
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
 * Extract filename from a full path.
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
  }
}

/**
 * Open a file by its absolute path. Shared by dialog-open and drag-drop.
 * @param {string} path
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
export async function fileOpenPath(path, editor, refreshPreview) {
  if (!window.__TAURI__) return;

  try {
    const { readTextFile } = window.__TAURI__.fs;
    const content = await readTextFile(path);
    editor.value = content;
    currentFilePath = path;
    markClean(content);
    refreshPreview();
  } catch (err) {
    showError(`Failed to open file: ${err.message || err}`);
  }
}

/**
 * Open file: show dialog, read file, set editor content.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
export async function fileOpen(editor, refreshPreview) {
  if (!window.__TAURI__) return;

  try {
    const { open } = window.__TAURI__.dialog;

    const selected = await open({
      title: 'Open Markdown',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All files', extensions: ['*'] },
      ],
      multiple: false,
    });

    if (!selected) return; // user cancelled

    await fileOpenPath(selected, editor, refreshPreview);
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
    if (!window.__TAURI__) return;
    try {
      const { writeTextFile } = window.__TAURI__.fs;
      await writeTextFile(currentFilePath, editor.value);
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
  if (!window.__TAURI__) return;

  try {
    const { save } = window.__TAURI__.dialog;
    const { writeTextFile } = window.__TAURI__.fs;

    const path = await save({
      title: 'Save Markdown',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'All files', extensions: ['*'] },
      ],
      defaultPath: currentFilePath || 'untitled.md',
    });

    if (!path) return; // user cancelled

    await writeTextFile(path, editor.value);
    currentFilePath = path;
    markClean(editor.value);
  } catch (err) {
    showError(`Failed to save file: ${err.message || err}`);
  }
}
