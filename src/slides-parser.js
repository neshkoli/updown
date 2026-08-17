/**
 * Slidev-inspired markdown slide parser.
 * Splits on --- separators with code-block and HTML-comment awareness.
 */
import { parseSimpleYaml } from './frontmatter.js';

const RE_CRLF = /\r?\n/g;
const RE_FRONTMATTER = /^---\r?\n([\s\S]*?)---/;
const RE_YAML_CODEBLOCK = /^\s*```ya?ml([\s\S]*?)```/;
const RE_HEADING = /^(#+) (.*)$/m;

function advanceHtmlCommentState(line, inHtmlComment) {
  let cursor = 0;
  while (cursor < line.length) {
    if (inHtmlComment) {
      const end = line.indexOf('-->', cursor);
      if (end < 0) return true;
      inHtmlComment = false;
      cursor = end + 3;
    } else {
      const start = line.indexOf('<!--', cursor);
      if (start < 0) return false;
      const end = line.indexOf('-->', start + 4);
      if (end < 0) return true;
      cursor = end + 3;
    }
  }
  return inHtmlComment;
}

/**
 * Parse YAML frontmatter or yaml code block from slide raw text.
 * @param {string} code
 * @returns {{ type?: string, data: Record<string, unknown>, content: string }}
 */
function matter(code) {
  let type;
  let raw;

  let content = code.replace(RE_FRONTMATTER, (_, f) => {
    type = 'frontmatter';
    raw = f;
    return '';
  });

  if (type !== 'frontmatter') {
    content = content.replace(RE_YAML_CODEBLOCK, (_, f) => {
      type = 'yaml';
      raw = f;
      return '';
    });
  }

  let data = {};
  if (raw) {
    data = parseSimpleYaml(raw);
  }

  return { type, data, content: content.trim() };
}

/**
 * Parse a single slide's raw markdown.
 * @param {string} raw
 */
function parseSlide(raw) {
  const matterResult = matter(raw);
  let note;
  let content = matterResult.content.trim();
  const frontmatter = matterResult.data || {};

  const comments = Array.from(content.matchAll(/<!--([\s\S]*?)-->/g));
  if (comments.length) {
    const last = comments[comments.length - 1];
    if (last.index !== undefined && last.index + last[0].length >= content.length) {
      note = last[1].trim();
      content = content.slice(0, last.index).trim();
    }
  }

  let title;
  let level;
  if (frontmatter.title || frontmatter.name) {
    title = String(frontmatter.title || frontmatter.name);
  } else {
    const match = content.match(RE_HEADING);
    title = match?.[2]?.trim();
    level = match?.[1]?.length;
  }
  if (frontmatter.level) {
    level = Number(frontmatter.level) || 1;
  }

  return {
    raw,
    title,
    level,
    content,
    frontmatter,
    note,
  };
}

/**
 * Count slide separators in markdown (for presentation detection).
 * @param {string} markdown
 * @returns {number}
 */
export function countSlideSeparators(markdown) {
  if (!markdown) return 0;
  const lines = markdown.split(RE_CRLF);
  let count = 0;
  let inHtmlComment = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();
    if (inHtmlComment) {
      inHtmlComment = advanceHtmlCommentState(rawLine, true);
      continue;
    }

    if (line.startsWith('---') && line.trimEnd() === '---') {
      count++;
    } else if (line.trimStart().startsWith('```')) {
      const ticks = line.match(/^(\s*`+)/)?.[1] ?? '```';
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].startsWith(ticks)) break;
      }
      if (j !== lines.length) i = j;
    } else {
      inHtmlComment = advanceHtmlCommentState(rawLine, false);
    }
  }

  return count;
}

/**
 * Parse markdown into slides with headmatter.
 * @param {string} markdown
 * @returns {{ headmatter: Record<string, unknown>, slides: Array<{ index: number, content: string, frontmatter: Record<string, unknown>, note?: string, title?: string, layout?: string }> }}
 */
export function parseSlides(markdown) {
  if (!markdown) {
    return { headmatter: {}, slides: [] };
  }

  const lines = markdown.split(RE_CRLF);
  const slides = [];
  let start = 0;
  let inHtmlComment = false;

  function slice(end) {
    if (start === end) return;
    const raw = lines.slice(start, end).join('\n');
    const parsed = parseSlide(raw);
    slides.push({
      index: slides.length,
      content: parsed.content,
      frontmatter: parsed.frontmatter,
      note: parsed.note,
      title: parsed.title,
      layout: typeof parsed.frontmatter.layout === 'string' ? parsed.frontmatter.layout : 'default',
    });
    start = end + 1;
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trimEnd();
    if (inHtmlComment) {
      inHtmlComment = advanceHtmlCommentState(rawLine, true);
      continue;
    }

    if (line.startsWith('---')) {
      slice(i);
      const next = lines[i + 1];
      if (line[3] !== '-' && next?.trim()) {
        start = i;
        for (i += 1; i < lines.length; i++) {
          if (lines[i].trimEnd() === '---') break;
        }
      }
    } else if (line.trimStart().startsWith('```')) {
      const ticks = line.match(/^(\s*`+)/)?.[1] ?? '```';
      let j = i + 1;
      for (; j < lines.length; j++) {
        if (lines[j].startsWith(ticks)) break;
      }
      if (j !== lines.length) i = j;
    } else {
      inHtmlComment = advanceHtmlCommentState(rawLine, false);
    }
  }

  if (start <= lines.length - 1) {
    slice(lines.length);
  }

  const headmatter = slides.length > 0 ? { ...slides[0].frontmatter } : {};

  return { headmatter, slides };
}
