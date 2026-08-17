import { describe, it, expect, beforeEach } from 'vitest';
import markdownit from 'markdown-it';

globalThis.window = globalThis.window || globalThis;
globalThis.window.markdownit = markdownit;

const { isPresentationDeck } = await import('../src/presentation-detect.js');

describe('isPresentationDeck', () => {
  it('detects Marp decks with marp: true', () => {
    const source = `---
marp: true
theme: default
---

# Slide 1

---

# Slide 2
`;
    expect(isPresentationDeck(source)).toBe(true);
  });

  it('detects Slidev decks with theme key', () => {
    const source = `---
theme: seriph
title: Demo
---

# Hello
`;
    expect(isPresentationDeck(source)).toBe(true);
  });

  it('detects generic presentation marker', () => {
    const source = `---
presentation: true
---

# Hello
`;
    expect(isPresentationDeck(source)).toBe(true);
  });

  it('detects type: slides', () => {
    const source = `---
type: slides
---

# Hello
`;
    expect(isPresentationDeck(source)).toBe(true);
  });

  it('returns false for regular markdown without markers', () => {
    const source = `# Hello

Some paragraph text.
`;
    expect(isPresentationDeck(source)).toBe(false);
  });

  it('returns false for frontmatter without presentation markers or separators', () => {
    const source = `---
title: Notes
author: Someone
---

# Hello
`;
    expect(isPresentationDeck(source)).toBe(false);
  });

  it('detects deck with slide separators in body', () => {
    const source = `---
title: Deck
---

# Slide 1

---

# Slide 2
`;
    expect(isPresentationDeck(source)).toBe(true);
  });
});
