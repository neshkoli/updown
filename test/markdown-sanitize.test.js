import { describe, it, expect } from 'vitest';
import markdownit from 'markdown-it';

globalThis.window = globalThis.window || globalThis;
globalThis.window.markdownit = markdownit;

const { stripHtmlForPreview } = await import('../src/markdown-sanitize.js');
const { renderMarkdown } = await import('../src/render.js');

describe('stripHtmlForPreview', () => {
  it('removes HTML comments', () => {
    const input = '# Title\n\n<!-- speaker note -->\n\nParagraph';
    expect(stripHtmlForPreview(input)).toBe('# Title\n\nParagraph');
  });

  it('removes Marp-style directive comments', () => {
    const input = '<!-- _class: lead -->\n\n# Hello';
    expect(stripHtmlForPreview(input)).not.toContain('<!--');
    expect(stripHtmlForPreview(input)).toContain('# Hello');
  });

  it('removes HTML tags outside code blocks', () => {
    const input = '<div class="note">hidden</div>\n\nVisible text';
    expect(stripHtmlForPreview(input)).not.toContain('<div');
    expect(stripHtmlForPreview(input)).toContain('hidden');
    expect(stripHtmlForPreview(input)).toContain('Visible text');
  });

  it('preserves HTML inside fenced code blocks', () => {
    const input = '```html\n<!-- comment -->\n<div>code</div>\n```';
    expect(stripHtmlForPreview(input)).toContain('<!-- comment -->');
    expect(stripHtmlForPreview(input)).toContain('<div>code</div>');
  });

  it('preserves kbd tags outside code blocks', () => {
    const input = '<kbd>right</kbd> / <kbd>space</kbd>';
    expect(stripHtmlForPreview(input)).toBe('<kbd>right</kbd> / <kbd>space</kbd>');
  });

  it('strips attributes from kbd tags', () => {
    const input = '<kbd onclick="alert(1)">space</kbd>';
    expect(stripHtmlForPreview(input)).toBe('<kbd>space</kbd>');
  });

  it('still removes non-kbd HTML tags', () => {
    const input = '<div>x</div><kbd>enter</kbd><script>bad()</script>';
    expect(stripHtmlForPreview(input)).toBe('x<kbd>enter</kbd>bad()');
  });
});

describe('renderMarkdown HTML stripping', () => {
  it('does not render HTML comments in preview output', () => {
    const html = renderMarkdown('# Hi\n\n<!-- hidden note -->');
    expect(html).not.toContain('<!--');
    expect(html).not.toContain('hidden note');
    expect(html).toContain('Hi');
  });

  it('renders kbd tags in table cells', () => {
    const src = [
      '| | |',
      '| --- | --- |',
      '| <kbd>right</kbd> / <kbd>space</kbd> | next slide |',
    ].join('\n');
    const html = renderMarkdown(src);
    expect(html).toContain('<kbd>right</kbd>');
    expect(html).toContain('<kbd>space</kbd>');
    expect(html).toContain('next slide');
  });
});
