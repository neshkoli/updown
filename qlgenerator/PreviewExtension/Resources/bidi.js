/**
 * Bidi helper for Quick Look extension (no DOM, works on HTML strings).
 *
 * Mirrors the logic in src/bidi.js:
 * For each block-level element (p, li, h1-h6, td, th, ul, ol),
 * count Hebrew letters (U+0590-U+05FF) vs Latin letters (a-z, A-Z).
 * If Hebrew > Latin -> dir="rtl", text-align: right.
 * Otherwise -> dir="ltr", text-align: left.
 */

var HEBREW_RE = /[\u0590-\u05FF]/g;
var LATIN_RE  = /[a-zA-Z]/g;

function countMatches(text, re) {
  var m = text.match(re);
  return m ? m.length : 0;
}

function detectDirection(text) {
  var hebrew = countMatches(text, HEBREW_RE);
  var latin  = countMatches(text, LATIN_RE);
  return hebrew > latin ? 'rtl' : 'ltr';
}

/**
 * Strip HTML tags from a string to get plain text content.
 */
function stripTags(html) {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Apply bidi direction attributes to block-level elements in an HTML string.
 * Works without a DOM by using regex to find opening tags and inject dir + style.
 *
 * @param {string} html - The rendered HTML string
 * @returns {string} - HTML with dir and text-align attributes added
 */
function applyBidiToHTML(html) {
  // Pass 1: Add dir + text-align to p, li, h1-h6, td, th
  html = html.replace(/<(p|li|h[1-6]|td|th)([ >])([\s\S]*?)(<\/\1>)/gi,
    function(match, tag, afterTag, inner, closeTag) {
      var text = stripTags(inner);
      var dir = detectDirection(text);
      var align = dir === 'rtl' ? 'right' : 'left';
      return '<' + tag + ' dir="' + dir + '" style="text-align:' + align + '"' + afterTag + inner + closeTag;
    }
  );

  // Pass 2: Add dir to ul, ol
  html = html.replace(/<(ul|ol)([ >])([\s\S]*?)(<\/\1>)/gi,
    function(match, tag, afterTag, inner, closeTag) {
      var text = stripTags(inner);
      var dir = detectDirection(text);
      return '<' + tag + ' dir="' + dir + '"' + afterTag + inner + closeTag;
    }
  );

  return html;
}
