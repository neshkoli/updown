/**
 * Bidi helper: per-paragraph Hebrew/English alignment.
 *
 * For each block-level element (p, li, h1–h6, blockquote > p, td, th),
 * count Hebrew letters (U+0590–U+05FF) vs Latin letters (a-z, A-Z).
 * If Hebrew > Latin → dir="rtl", text-align: right.
 * Otherwise → dir="ltr", text-align: left.
 */

const HEBREW_RE = /[\u0590-\u05FF]/g;
const LATIN_RE  = /[a-zA-Z]/g;

/**
 * Count occurrences of a regex in a string.
 * @param {string} text
 * @param {RegExp} re - must have the `g` flag
 * @returns {number}
 */
function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

/**
 * Determine the dominant direction of a text string.
 * @param {string} text
 * @returns {'rtl' | 'ltr'}
 */
export function detectDirection(text) {
  const hebrew = countMatches(text, HEBREW_RE);
  const latin  = countMatches(text, LATIN_RE);
  return hebrew > latin ? 'rtl' : 'ltr';
}

/**
 * Apply bidi direction and alignment to block-level elements inside a container.
 * @param {HTMLElement} container - the preview element
 */
export function applyBidi(container) {
  // 1. Apply dir and text-align to inline block elements
  const selector = 'p, li, h1, h2, h3, h4, h5, h6, td, th';
  const elements = container.querySelectorAll(selector);
  for (const el of elements) {
    const text = el.textContent || '';
    const dir = detectDirection(text);
    el.setAttribute('dir', dir);
    el.style.textAlign = dir === 'rtl' ? 'right' : 'left';
  }

  // 2. Set dir on ul/ol based on the overall direction of their text content.
  //    This flips list-marker placement so bullets/numbers stay visible.
  const lists = container.querySelectorAll('ul, ol');
  for (const list of lists) {
    const text = list.textContent || '';
    const dir = detectDirection(text);
    list.setAttribute('dir', dir);
  }
}
