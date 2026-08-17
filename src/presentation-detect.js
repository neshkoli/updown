/**
 * Detect whether markdown source is a presentation deck (Slidev / Marp).
 */
import { extractFrontmatter } from './frontmatter.js';
import { countSlideSeparators } from './slides-parser.js';

/**
 * @param {string} source
 * @returns {boolean}
 */
export function isPresentationDeck(source) {
  const { metadata, body } = extractFrontmatter(source);
  if (!metadata) return false;

  const meta = Object.fromEntries(metadata.map(({ key, value }) => [key, value]));

  if (meta.marp === true || meta.marp === 'true') return true;
  if (meta.theme || meta.presentation === true || meta.presentation === 'true') return true;
  if (meta.type === 'slides') return true;

  return countSlideSeparators(body) > 0;
}
