/**
 * Remove raw HTML from markdown before preview rendering.
 * Preserves content inside fenced code blocks.
 */

const FENCED_CODE_RE = /(```[\s\S]*?```)/g;
const HTML_TAG_RE = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;

/**
 * Sanitize a single HTML tag, keeping only allowed tags/attributes.
 * @param {string} tag
 * @param {{ allowLayoutHtml?: boolean }} options
 * @returns {string}
 */
function sanitizeHtmlTag(tag, options) {
  const match = /^<\/?([a-z][a-z0-9]*)\b([^>]*)>$/i.exec(tag);
  if (!match) return '';

  const name = match[1].toLowerCase();
  const isClose = tag.startsWith('</');

  if (name === 'kbd') {
    return isClose ? '</kbd>' : '<kbd>';
  }

  if (options.allowLayoutHtml && (name === 'div' || name === 'span')) {
    if (isClose) return `</${name}>`;
    const classMatch = match[2].match(/\bclass\s*=\s*["']([^"']*)["']/i);
    if (classMatch) {
      const safeClass = classMatch[1].replace(/[^\w\s-]/g, '').trim();
      return safeClass ? `<${name} class="${safeClass}">` : `<${name}>`;
    }
    return `<${name}>`;
  }

  return '';
}

/**
 * Strip HTML comments and tags from a text segment (not code).
 * @param {string} text
 * @param {{ allowLayoutHtml?: boolean }} options
 * @returns {string}
 */
function stripHtmlFromText(text, options) {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(HTML_TAG_RE, (tag) => sanitizeHtmlTag(tag, options))
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Remove HTML comments and inline/block tags from markdown for preview.
 * Fenced code blocks are left unchanged.
 * @param {string} source
 * @param {{ allowLayoutHtml?: boolean }} [options]
 * @returns {string}
 */
export function stripHtmlForPreview(source, options = {}) {
  if (!source) return '';

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = FENCED_CODE_RE.exec(source)) !== null) {
    parts.push(stripHtmlFromText(source.slice(lastIndex, match.index), options));
    parts.push(match[1]);
    lastIndex = match.index + match[1].length;
  }

  parts.push(stripHtmlFromText(source.slice(lastIndex), options));
  return parts.join('');
}
