/**
 * Find and replace logic for the editor textarea.
 * Supports find next, replace one, replace all with optional case sensitivity.
 */

/**
 * Escape special regex characters in a string for use in RegExp.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the next occurrence of query in text, starting from fromIndex.
 * @param {string} text - Full editor text
 * @param {string} query - Search string
 * @param {number} fromIndex - Index to start searching from
 * @param {boolean} caseSensitive
 * @returns {{ start: number, end: number } | null}
 */
export function findNextInText(text, query, fromIndex = 0, caseSensitive = false) {
  if (!query) return null;
  const flags = caseSensitive ? 'g' : 'gi';
  const escaped = escapeRegex(query);
  const re = new RegExp(escaped, flags);
  re.lastIndex = fromIndex;
  const match = re.exec(text);
  if (match) {
    return { start: match.index, end: match.index + match[0].length };
  }
  return null;
}

/**
 * Find next occurrence in editor from current cursor (or from start). Wraps from end to beginning.
 * Selects the match and scrolls it into view. Returns true if found.
 * @param {HTMLTextAreaElement} editor
 * @param {string} query
 * @param {boolean} caseSensitive
 * @param {boolean} findPrevious - if true, search backward
 * @returns {boolean}
 */
export function findNext(editor, query, caseSensitive = false, findPrevious = false) {
  if (!editor || !query) return false;
  const text = editor.value;
  if (findPrevious) {
    const before = text.slice(0, editor.selectionStart);
    const matches = [];
    const flags = caseSensitive ? 'g' : 'gi';
    const re = new RegExp(escapeRegex(query), flags);
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m.index < editor.selectionStart) matches.push({ start: m.index, end: m.index + m[0].length });
    }
    if (matches.length === 0) return false;
    const last = matches[matches.length - 1];
    editor.selectionStart = last.start;
    editor.selectionEnd = last.end;
  } else {
    const fromIndex = editor.selectionEnd;
    let result = findNextInText(text, query, fromIndex, caseSensitive);
    if (!result) result = findNextInText(text, query, 0, caseSensitive);
    if (!result) return false;
    editor.selectionStart = result.start;
    editor.selectionEnd = result.end;
  }
  editor.focus();
  return true;
}

/**
 * Replace current selection if it matches the find query (case-sensitive match per option).
 * @param {HTMLTextAreaElement} editor
 * @param {string} findQuery
 * @param {string} replaceWith
 * @param {boolean} caseSensitive
 * @returns {boolean} - true if a replacement was made
 */
export function replaceOne(editor, findQuery, replaceWith, caseSensitive = false) {
  if (!editor || !findQuery) return false;
  const text = editor.value;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = text.slice(start, end);
  const flags = caseSensitive ? '' : 'i';
  const re = new RegExp('^' + escapeRegex(findQuery) + '$', flags);
  if (!re.test(selected)) return false;
  const before = text.slice(0, start);
  const after = text.slice(end);
  editor.value = before + replaceWith + after;
  editor.selectionStart = start;
  editor.selectionEnd = start + replaceWith.length;
  editor.focus();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Replace all occurrences of findQuery with replaceWith in the editor.
 * @param {HTMLTextAreaElement} editor
 * @param {string} findQuery
 * @param {string} replaceWith
 * @param {boolean} caseSensitive
 * @returns {number} - count of replacements
 */
export function replaceAll(editor, findQuery, replaceWith, caseSensitive = false) {
  if (!editor || !findQuery) return 0;
  const flags = caseSensitive ? 'g' : 'gi';
  const re = new RegExp(escapeRegex(findQuery), flags);
  const newValue = editor.value.replace(re, replaceWith);
  const count = (editor.value.match(re) || []).length;
  if (count === 0) return 0;
  editor.value = newValue;
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return count;
}
