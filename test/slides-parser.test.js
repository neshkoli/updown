import { describe, it, expect } from 'vitest';
import { parseSlides, countSlideSeparators, slideIndexAtOffset } from '../src/slides-parser.js';

describe('countSlideSeparators', () => {
  it('counts --- lines as separators', () => {
    const md = '# Slide 1\n---\n# Slide 2\n---\n# Slide 3';
    expect(countSlideSeparators(md)).toBe(2);
  });

  it('ignores --- inside code blocks', () => {
    const md = '```\n---\n```\n---\nend';
    expect(countSlideSeparators(md)).toBe(1);
  });

  it('ignores --- inside HTML comments', () => {
    const md = '<!--\n---\n-->\n---\nend';
    expect(countSlideSeparators(md)).toBe(1);
  });
});

describe('parseSlides', () => {
  it('parses a simple two-slide deck', () => {
    const md = `---
theme: default
title: Test
---

# First

---

# Second
`;
    const { headmatter, slides } = parseSlides(md);
    expect(slides).toHaveLength(2);
    expect(headmatter.theme).toBe('default');
    expect(headmatter.title).toBe('Test');
    expect(slides[0].content).toContain('# First');
    expect(slides[1].content).toContain('# Second');
  });

  it('parses per-slide frontmatter', () => {
    const md = `---
theme: seriph
---

# Intro

---
layout: center
---

# Centered
`;
    const { slides } = parseSlides(md);
    expect(slides).toHaveLength(2);
    expect(slides[1].frontmatter.layout).toBe('center');
    expect(slides[1].layout).toBe('center');
  });

  it('extracts speaker notes from trailing HTML comment', () => {
    const md = `# Slide

Some content

<!--
Remember to mention the roadmap
-->
`;
    const { slides } = parseSlides(md);
    expect(slides).toHaveLength(1);
    expect(slides[0].note).toBe('Remember to mention the roadmap');
    expect(slides[0].content).not.toContain('Remember to mention');
  });

  it('does not split on --- inside fenced code', () => {
    const md = `# Code

\`\`\`js
const x = '---';
\`\`\`

---

# After
`;
    const { slides } = parseSlides(md);
    expect(slides).toHaveLength(2);
    expect(slides[0].content).toContain('const x');
  });

  it('returns empty slides for empty input', () => {
    const { slides, headmatter } = parseSlides('');
    expect(slides).toHaveLength(0);
    expect(headmatter).toEqual({});
  });

  it('records source offsets for each slide', () => {
    const md = '# First\n---\n\n# Second';
    const { slides } = parseSlides(md);
    expect(slides).toHaveLength(2);
    expect(slides[0].startOffset).toBe(0);
    expect(md.slice(slides[1].startOffset, slides[1].endOffset)).toContain('# Second');
    expect(slides[0].endOffset).toBeLessThanOrEqual(slides[1].startOffset);
    expect(slides[1].endOffset).toBe(md.length);
  });
});

describe('slideIndexAtOffset', () => {
  const md = '# First\n---\n\n# Second\n---\n\n# Third';

  it('returns 0 when offset is missing or not a number', () => {
    expect(slideIndexAtOffset(md, undefined)).toBe(0);
    expect(slideIndexAtOffset(md, null)).toBe(0);
    expect(slideIndexAtOffset('', 10)).toBe(0);
  });

  it('maps a cursor inside a slide to that slide', () => {
    expect(slideIndexAtOffset(md, 0)).toBe(0);
    expect(slideIndexAtOffset(md, md.indexOf('# Second'))).toBe(1);
    expect(slideIndexAtOffset(md, md.indexOf('# Third'))).toBe(2);
  });

  it('maps a cursor on a separator to the preceding slide', () => {
    expect(slideIndexAtOffset(md, md.indexOf('---'))).toBe(0);
  });
});
