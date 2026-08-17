/**
 * Find / Replace bar UI. Shows a bar below the toolbar with find input,
 * next/previous, and optional replace row (Replace, Replace All).
 * Only visible in edit mode (source or split); use openFind() / openFindReplace() to show.
 */

import { findNext, replaceOne, replaceAll } from './find-replace.js';

let getEditor = () => null;
let bar = null;
let findInput = null;
let replaceInput = null;
let replaceRow = null;

/**
 * Set up the find/replace bar: bind buttons and keyboard.
 * @param {Document} doc
 * @param {() => HTMLTextAreaElement | null} editorGetter - function that returns the editor element
 */
export function setupFindReplace(doc, editorGetter) {
  getEditor = editorGetter;
  bar = doc.getElementById('find-replace-bar');
  findInput = doc.getElementById('find-input');
  replaceInput = doc.getElementById('replace-input');
  replaceRow = doc.getElementById('replace-row');
  if (!bar || !findInput) return;

  doc.getElementById('find-next')?.addEventListener('click', () => doFindNext(false));
  doc.getElementById('find-prev')?.addEventListener('click', () => doFindNext(true));
  doc.getElementById('find-close')?.addEventListener('click', closeFindBar);
  doc.getElementById('replace-one')?.addEventListener('click', () => doReplaceOne());
  doc.getElementById('replace-all')?.addEventListener('click', () => doReplaceAll());

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doFindNext(e.shiftKey);
    }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      doReplaceOne();
    }
  });

  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar && !bar.classList.contains('hidden')) {
      closeFindBar();
      e.preventDefault();
    }
  });
}

function doFindNext(previous) {
  const editor = getEditor();
  if (!editor) return;
  const query = findInput?.value ?? '';
  findNext(editor, query, false, previous);
}

function doReplaceOne() {
  const editor = getEditor();
  if (!editor) return;
  const findQuery = findInput?.value ?? '';
  const replaceWith = replaceInput?.value ?? '';
  const replaced = replaceOne(editor, findQuery, replaceWith, false);
  if (replaced) doFindNext(false);
}

function doReplaceAll() {
  const editor = getEditor();
  if (!editor) return;
  const findQuery = findInput?.value ?? '';
  const replaceWith = replaceInput?.value ?? '';
  replaceAll(editor, findQuery, replaceWith, false);
}

function closeFindBar() {
  if (bar) bar.classList.add('hidden');
  getEditor()?.focus();
}

/**
 * Return true if the find/replace bar is currently visible.
 */
export function isFindBarOpen() {
  return !!(bar && !bar.classList.contains('hidden'));
}

/**
 * Open the find bar (find-only mode), or close it if already open. Focus find input when opening.
 */
export function openFind() {
  if (!bar || !replaceRow) return;
  if (isFindBarOpen()) {
    closeFindBar();
    return;
  }
  replaceRow.classList.add('hidden');
  bar.classList.remove('hidden');
  findInput?.focus();
  findInput?.select();
}

/**
 * Open the find bar with replace row visible, or close it if already open. Focus find input when opening.
 */
export function openFindReplace() {
  if (!bar || !replaceRow) return;
  if (isFindBarOpen()) {
    closeFindBar();
    return;
  }
  replaceRow.classList.remove('hidden');
  bar.classList.remove('hidden');
  findInput?.focus();
  findInput?.select();
}
