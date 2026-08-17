import { describe, it, expect } from 'vitest';
import { parseSlides, countSlideSeparators } from '../src/slides-parser.js';

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
});
