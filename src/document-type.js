/**
 * Tracks whether the current document is markdown (editable) or PDF (view-only).
 */

let documentKind = 'markdown';

/** @returns {'markdown' | 'pdf'} */
export function getDocumentKind() {
  return documentKind;
}

/** @param {'markdown' | 'pdf'} kind */
export function setDocumentKind(kind) {
  documentKind = kind;
}

/**
 * @param {string} fileId - path or opaque id
 * @returns {boolean}
 */
export function isPdfPath(fileId) {
  return typeof fileId === 'string' && /\.pdf$/i.test(fileId);
}

/**
 * Open as PDF: path ends in .pdf (local) or display name ends in .pdf (e.g. Google Drive id + filename).
 * @param {string} fileId
 * @param {string|undefined} displayName
 */
export function shouldOpenAsPdf(fileId, displayName) {
  if (isPdfPath(fileId)) return true;
  return typeof displayName === 'string' && /\.pdf$/i.test(displayName);
}
