import { describe, it, expect, beforeEach } from 'vitest';
import { mapScrollPosition, setupScrollSync } from '../src/scroll-sync.js';

function setScrollMetrics(el, { scrollHeight, clientHeight }) {
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(el, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

function stubPreviewGeometry(preview, offsets) {
  preview.getBoundingClientRect = () => ({
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
  });
  for (const heading of preview.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const offset = offsets.get(heading.textContent.trim()) ?? 0;
    heading.getBoundingClientRect = () => ({
      top: offset - preview.scrollTop,
      left: 0,
      right: 80,
      bottom: offset - preview.scrollTop + 20,
      width: 80,
      height: 20,
    });
  }
}

describe('mapScrollPosition', () => {
  it('interpolates between heading anchors', () => {
    const mapped = mapScrollPosition(60, [0, 12, 108, 400], [0, 0, 400, 900]);
    expect(mapped).toBeCloseTo(200);
  });

  it('maps the top and bottom onto the other pane', () => {
    expect(mapScrollPosition(0, [0, 100], [0, 250])).toBe(0);
    expect(mapScrollPosition(100, [0, 100], [0, 250])).toBe(250);
  });

  it('keeps the top at zero when the first heading shares that scroll position', () => {
    const from = [0, 0, 300];
    const to = [0, 12, 60];
    expect(mapScrollPosition(0, from, to)).toBe(0);
    expect(mapScrollPosition(150, from, to)).toBeCloseTo(36);
  });
});

describe('setupScrollSync', () => {
  let editor;
  let preview;

  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="editor" style="padding-top: 12px; line-height: 24px; font-size: 16px"></textarea>
      <div id="preview"></div>
    `;
    editor = document.getElementById('editor');
    preview = document.getElementById('preview');
  });

  it('moves the preview in proportion to the editor position between headings', () => {
    editor.value = '# Alpha\n\n# Beta\n';
    preview.innerHTML = '<h1>Alpha</h1><p>body</p><h1>Beta</h1>';
    setScrollMetrics(editor, { scrollHeight: 500, clientHeight: 100 });
    setScrollMetrics(preview, { scrollHeight: 900, clientHeight: 100 });
    stubPreviewGeometry(preview, new Map([
      ['Alpha', 0],
      ['Beta', 300],
    ]));

    setupScrollSync(editor, preview);
    editor.scrollTop = 36;
    editor.dispatchEvent(new Event('scroll'));

    // Source headings sit at 12px and 60px; 36px is halfway, so the preview
    // lands halfway between its headings at 0 and 300.
    expect(preview.scrollTop).toBeCloseTo(150);
  });

  it('moves the editor when the preview scrolls', () => {
    editor.value = '# Alpha\n\n# Beta\n';
    preview.innerHTML = '<h1>Alpha</h1><p>body</p><h1>Beta</h1>';
    setScrollMetrics(editor, { scrollHeight: 500, clientHeight: 100 });
    setScrollMetrics(preview, { scrollHeight: 900, clientHeight: 100 });
    stubPreviewGeometry(preview, new Map([
      ['Alpha', 0],
      ['Beta', 300],
    ]));

    setupScrollSync(editor, preview);
    preview.scrollTop = 150;
    expect(() => preview.dispatchEvent(new Event('scroll'))).not.toThrow();

    expect(editor.scrollTop).toBeCloseTo(36);
  });

  it('falls back to the full scroll range when the document has no headings', () => {
    editor.value = 'Just a paragraph.\n'.repeat(20);
    preview.innerHTML = '<p>Just a paragraph.</p>';
    setScrollMetrics(editor, { scrollHeight: 500, clientHeight: 100 });
    setScrollMetrics(preview, { scrollHeight: 300, clientHeight: 100 });

    setupScrollSync(editor, preview);
    editor.scrollTop = 100;
    editor.dispatchEvent(new Event('scroll'));

    expect(preview.scrollTop).toBeCloseTo(50);
  });

  it('stops syncing after cleanup', () => {
    editor.value = 'Just a paragraph.\n'.repeat(20);
    preview.innerHTML = '<p>Just a paragraph.</p>';
    setScrollMetrics(editor, { scrollHeight: 500, clientHeight: 100 });
    setScrollMetrics(preview, { scrollHeight: 300, clientHeight: 100 });

    const cleanup = setupScrollSync(editor, preview);
    cleanup();
    editor.scrollTop = 100;
    editor.dispatchEvent(new Event('scroll'));

    expect(preview.scrollTop).toBe(0);
  });

  it('does not sync a hidden pane', () => {
    editor.value = '# Alpha\n\n# Beta\n';
    preview.innerHTML = '<h1>Alpha</h1><h1>Beta</h1>';
    editor.style.display = 'none';
    setScrollMetrics(editor, { scrollHeight: 500, clientHeight: 100 });
    setScrollMetrics(preview, { scrollHeight: 900, clientHeight: 100 });
    stubPreviewGeometry(preview, new Map([
      ['Alpha', 0],
      ['Beta', 300],
    ]));

    setupScrollSync(editor, preview);
    editor.scrollTop = 36;
    editor.dispatchEvent(new Event('scroll'));

    expect(preview.scrollTop).toBe(0);
  });
});
