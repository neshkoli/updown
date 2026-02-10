/**
 * Autosave module for UpDown.
 * Debounced save on editor input when a file is already associated.
 */
import { getCurrentFilePath, checkDirty, fileSave } from './file-ops.js';
import { debounce } from './utils.js';

/**
 * Set up autosave: on editor input, mark dirty and debounce-save.
 * @param {HTMLTextAreaElement} editor
 * @param {number} [delayMs=1500] - autosave debounce delay in ms
 */
export function setupAutosave(editor, delayMs = 1500) {
  const debouncedSave = debounce(() => {
    if (getCurrentFilePath()) {
      fileSave(editor).catch(err => console.error('Autosave failed:', err));
    }
  }, delayMs);

  function onInput() {
    checkDirty(editor.value);
    if (getCurrentFilePath()) {
      debouncedSave();
    }
  }

  editor.addEventListener('input', onInput);
  editor.addEventListener('paste', onInput);
}
