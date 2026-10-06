/**
 * Keep the source editor and rendered preview aligned in split view.
 *
 * The panes are synchronized by headings, then interpolated between those
 * landmarks. A single percentage of the two scroll ranges drifts because
 * rendered Markdown and source text have different line heights, wrapping,
 * and block spacing. Source positions are measured with a mirror element so
 * soft-wrapped lines count toward the heading offset.
 */

const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^\s{0,3}(```+|~~~+)/;

const MIRROR_PROPS = [
  'direction',
  'boxSizing',
  'overflowX',
  'overflowY',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderTopStyle',
  'borderRightStyle',
  'borderBottomStyle',
  'borderLeftStyle',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'fontStretch',
  'fontSize',
  'lineHeight',
  'fontFamily',
  'textAlign',
  'textTransform',
  'textIndent',
  'letterSpacing',
  'wordSpacing',
  'tabSize',
  'whiteSpace',
];

function normalizeHeading(text) {
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/#+\s*$/, '')
    .trim()
    .toLowerCase();
}

function sourceHeadings(source) {
  const headings = [];
  let inFence = false;
  let inFrontmatter = false;

  source.split(/\r?\n/).forEach((line, lineIndex) => {
    if (lineIndex === 0 && line.trim() === '---') {
      inFrontmatter = true;
      return;
    }
    if (inFrontmatter) {
      if (line.trim() === '---' || line.trim() === '...') {
        inFrontmatter = false;
      }
      return;
    }
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const match = line.match(HEADING_RE);
    if (match) {
      headings.push({
        level: match[1].length,
        text: normalizeHeading(match[2]),
        lineIndex,
      });
    }
  });

  return headings;
}

function previewHeadings(preview) {
  return [...preview.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((element) => ({
    level: Number(element.tagName.slice(1)),
    text: normalizeHeading(element.textContent || ''),
    element,
  }));
}

/**
 * Match rendered headings to source headings. Matching by text and level
 * avoids getting out of sync when unsupported Markdown blocks are present.
 */
function matchedHeadings(editor, preview) {
  const source = sourceHeadings(editor.value || '');
  const rendered = previewHeadings(preview);
  const matches = [];
  let sourceIndex = 0;

  for (const heading of rendered) {
    while (
      sourceIndex < source.length &&
      (source[sourceIndex].level !== heading.level ||
        source[sourceIndex].text !== heading.text)
    ) {
      sourceIndex += 1;
    }
    if (sourceIndex < source.length) {
      matches.push({ source: source[sourceIndex], rendered: heading.element });
      sourceIndex += 1;
    }
  }

  // Inline Markdown in a heading (for example `# **Title**`) changes the
  // rendered text, so text matching can legitimately miss every heading.
  // When the heading counts agree, document order is the reliable fallback.
  if (matches.length !== rendered.length && source.length === rendered.length) {
    return source.map((sourceHeading, index) => ({
      source: sourceHeading,
      rendered: rendered[index].element,
    }));
  }

  return matches;
}

function parsedPx(value, fallback) {
  const parsed = Number.parseFloat(value || '');
  return Number.isFinite(parsed) ? parsed : fallback;
}

function lineHeightPx(style) {
  const value = parsedPx(style?.lineHeight, NaN);
  if (Number.isFinite(value)) return value;
  const fontSize = parsedPx(style?.fontSize, NaN);
  return Number.isFinite(fontSize) ? fontSize * 1.5 : 21.6;
}

function unwrappedLineOffset(style, lineIndex) {
  return parsedPx(style?.paddingTop, 0) + lineIndex * lineHeightPx(style);
}

/**
 * Pixel offset of each source line, accounting for soft wrapping.
 * Falls back to line-height math when the document has no layout (tests).
 * @param {HTMLTextAreaElement} editor
 * @param {number[]} lineIndexes
 * @returns {Map<number, number>}
 */
function measureSourceLineOffsets(editor, lineIndexes) {
  const view = editor.ownerDocument.defaultView;
  const style = view?.getComputedStyle(editor);
  const wanted = [...new Set(lineIndexes)].filter((index) => index >= 0);
  const fallback = new Map(wanted.map((index) => [index, unwrappedLineOffset(style, index)]));
  if (wanted.length === 0 || editor.clientWidth === 0 || !editor.ownerDocument.body) {
    return fallback;
  }

  const doc = editor.ownerDocument;
  const mirror = doc.createElement('div');
  mirror.setAttribute('aria-hidden', 'true');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.top = '0';
  mirror.style.left = '0';
  mirror.style.height = 'auto';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';
  mirror.style.overflowWrap = 'break-word';
  for (const prop of MIRROR_PROPS) {
    const value = style?.[prop];
    if (value) mirror.style[prop] = value;
  }
  mirror.style.width = `${editor.offsetWidth}px`;

  const lines = (editor.value || '').split(/\r?\n/);
  const wantedSet = new Set(wanted);
  const markers = new Map();
  lines.forEach((line, index) => {
    if (wantedSet.has(index)) {
      const marker = doc.createElement('span');
      marker.textContent = line;
      markers.set(index, marker);
      mirror.appendChild(marker);
    } else {
      mirror.appendChild(doc.createTextNode(line));
    }
    if (index < lines.length - 1) mirror.appendChild(doc.createTextNode('\n'));
  });

  doc.body.appendChild(mirror);
  const offsets = new Map(fallback);
  if (mirror.offsetHeight > 0) {
    const mirrorTop = mirror.getBoundingClientRect().top;
    for (const [index, marker] of markers) {
      offsets.set(index, marker.getBoundingClientRect().top - mirrorTop);
    }
  }
  mirror.remove();
  return offsets;
}

function previewHeadingOffset(preview, heading) {
  const previewRect = preview.getBoundingClientRect();
  const headingRect = heading.getBoundingClientRect();
  return headingRect.top - previewRect.top + preview.scrollTop;
}

function maxScroll(el) {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/**
 * Map scrollTop through parallel, ascending anchor positions.
 * @param {number} scrollTop
 * @param {number[]} fromAnchors
 * @param {number[]} toAnchors
 */
export function mapScrollPosition(scrollTop, fromAnchors, toAnchors) {
  if (fromAnchors.length === 0) return 0;
  let index = 0;
  for (let i = 0; i < fromAnchors.length - 1; i += 1) {
    // Stay on the earlier anchor when two landmarks share a scroll position,
    // so the top of one pane is not forced to the other pane's first heading.
    if (fromAnchors[i + 1] < scrollTop - 0.5) index = i + 1;
    else break;
  }
  const end = Math.min(index + 1, fromAnchors.length - 1);
  const fromStart = fromAnchors[index];
  const fromEnd = fromAnchors[end];
  const toStart = toAnchors[index] ?? 0;
  const toEnd = toAnchors[end] ?? toStart;
  if (fromEnd <= fromStart) return toStart;
  const t = (scrollTop - fromStart) / (fromEnd - fromStart);
  return toStart + t * (toEnd - toStart);
}

/**
 * Pair heading offsets and pin both documents at 0 and at their scroll ends.
 * Landmarks past the scrollable range are omitted so the bottoms still meet.
 */
function anchorPairs(sourceOffsets, previewOffsets, sourceMax, previewMax) {
  const from = [0];
  const to = [0];
  for (let i = 0; i < sourceOffsets.length; i += 1) {
    const sourceOffset = sourceOffsets[i];
    const previewOffset = previewOffsets[i];
    if (sourceOffset > sourceMax + 0.5 || previewOffset > previewMax + 0.5) continue;
    if (sourceOffset + 0.5 < from[from.length - 1]) continue;
    // A heading can sit at the same scroll offset as the previous anchor on
    // one side only (padding above the first source line, for example).
    // Keep that pair so the other side still interpolates from the heading.
    if (
      sourceOffset <= from[from.length - 1] + 0.5 &&
      previewOffset <= to[to.length - 1] + 0.5
    ) {
      continue;
    }
    from.push(sourceOffset);
    to.push(previewOffset);
  }
  if (sourceMax > from[from.length - 1] + 0.5) {
    from.push(sourceMax);
    to.push(previewMax);
  }
  return { from, to };
}

function shown(el) {
  const display = el.ownerDocument.defaultView?.getComputedStyle(el).display;
  return display !== 'none';
}

/**
 * Set up bidirectional heading-based synchronization.
 *
 * @param {HTMLTextAreaElement} editor
 * @param {HTMLElement} preview
 * @returns {() => void} cleanup function
 */
export function setupScrollSync(editor, preview) {
  if (!editor || !preview) return () => {};

  let suppressed = null;
  let sourceMeasure = { key: '', map: new Map() };

  const sourceOffsetList = (lineIndexes) => {
    const style = editor.ownerDocument.defaultView?.getComputedStyle(editor);
    const key = [
      editor.value,
      editor.offsetWidth,
      style?.fontSize,
      style?.lineHeight,
      style?.fontFamily,
      style?.paddingTop,
      style?.paddingLeft,
      style?.paddingRight,
    ].join('\0');
    const missing = lineIndexes.some((line) => !sourceMeasure.map.has(line));
    if (sourceMeasure.key !== key || missing) {
      sourceMeasure = { key, map: measureSourceLineOffsets(editor, lineIndexes) };
    }
    return lineIndexes.map((line) => sourceMeasure.map.get(line) ?? 0);
  };

  const applyScroll = (el, top) => {
    const max = maxScroll(el);
    const next = Math.min(max, Math.max(0, Number.isFinite(top) ? top : 0));
    if (Math.abs(el.scrollTop - next) < 1) return;
    suppressed = el;
    el.scrollTop = next;
    requestAnimationFrame(() => {
      if (suppressed === el) suppressed = null;
    });
  };

  const sync = (from) => {
    if (suppressed === from) return;
    if (!shown(editor) || !shown(preview)) return;

    const target = from === editor ? preview : editor;
    const matches = matchedHeadings(editor, preview);
    if (matches.length === 0) {
      const fromMax = maxScroll(from);
      const toMax = maxScroll(target);
      if (fromMax <= 0) return;
      applyScroll(target, (from.scrollTop / fromMax) * toMax);
      return;
    }

    const sourceOffsets = sourceOffsetList(matches.map(({ source }) => source.lineIndex));
    const previewOffsets = matches.map(({ rendered }) => previewHeadingOffset(preview, rendered));
    const sourceMax = maxScroll(editor);
    const previewMax = maxScroll(preview);
    const pairs = from === editor
      ? anchorPairs(sourceOffsets, previewOffsets, sourceMax, previewMax)
      : anchorPairs(previewOffsets, sourceOffsets, previewMax, sourceMax);

    applyScroll(target, mapScrollPosition(from.scrollTop, pairs.from, pairs.to));
  };

  const onEditorScroll = () => sync(editor);
  const onPreviewScroll = () => sync(preview);
  editor.addEventListener('scroll', onEditorScroll, { passive: true });
  preview.addEventListener('scroll', onPreviewScroll, { passive: true });

  return () => {
    editor.removeEventListener('scroll', onEditorScroll);
    preview.removeEventListener('scroll', onPreviewScroll);
  };
}
