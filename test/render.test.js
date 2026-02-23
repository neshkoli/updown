import { describe, it, expect, vi, beforeEach } from 'vitest';

// markdown-it is loaded as a global UMD in the browser.
// For tests, we load it into the global scope so render.js can use it.
import markdownit from 'markdown-it';
globalThis.window = globalThis.window || globalThis;
globalThis.window.markdownit = markdownit;

// Now import our modules (render.js reads window.markdownit at import time).
const { renderMarkdown, setupLivePreview } = await import('../src/render.js');
const { debounce } = await import('../src/utils.js');

describe('renderMarkdown', () => {
  it('renders a heading with id', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1 id="hello">Hello</h1>');
  });

  it('renders a paragraph', () => {
    const html = renderMarkdown('Some text');
    expect(html).toContain('<p>Some text</p>');
  });

  it('renders bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders a bullet list', () => {
    const html = renderMarkdown('- one\n- two');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
    expect(html).toContain('<li>two</li>');
  });

  it('renders inline code', () => {
    const html = renderMarkdown('use `npm test`');
    expect(html).toContain('<code>npm test</code>');
  });

  it('renders a fenced code block', () => {
    const html = renderMarkdown('```\nconst x = 1;\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code>');
    expect(html).toContain('const x = 1;');
  });

  it('renders a blockquote', () => {
    const html = renderMarkdown('> quoted');
    expect(html).toContain('<blockquote>');
    expect(html).toContain('quoted');
  });

  it('auto-links URLs when linkify is on', () => {
    const html = renderMarkdown('Visit https://example.com');
    expect(html).toContain('href="https://example.com"');
  });

  it('returns empty for empty input', () => {
    const html = renderMarkdown('');
    expect(html).toBe('');
  });

  it('returns empty for null/undefined input', () => {
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });

  describe('table alignment', () => {
    const src = [
      '| Left | Center | Right |',
      '|------|:------:|------:|',
      '| a    |   b    |     c |',
    ].join('\n');

    it('renders a table element', () => {
      expect(renderMarkdown(src)).toContain('<table>');
    });

    it('applies center alignment to header', () => {
      const html = renderMarkdown(src);
      expect(html).toContain('<th style="text-align:center">Center</th>');
    });

    it('applies right alignment to header', () => {
      const html = renderMarkdown(src);
      expect(html).toContain('<th style="text-align:right">Right</th>');
    });

    it('left-aligned column has no inline style (browser default)', () => {
      const html = renderMarkdown(src);
      expect(html).toContain('<th>Left</th>');
    });

    it('applies center alignment to body cells', () => {
      const html = renderMarkdown(src);
      expect(html).toContain('<td style="text-align:center">b</td>');
    });

    it('applies right alignment to body cells', () => {
      const html = renderMarkdown(src);
      expect(html).toContain('<td style="text-align:right">c</td>');
    });
  });

  describe('mermaid fenced blocks', () => {
    it('renders mermaid block as <pre class="mermaid">', () => {
      const html = renderMarkdown('```mermaid\nflowchart LR\n  A --> B\n```');
      expect(html).toContain('<pre class="mermaid">');
      expect(html).toContain('flowchart LR');
    });

    it('does not wrap mermaid in <code>', () => {
      const html = renderMarkdown('```mermaid\nflowchart LR\n  A --> B\n```');
      expect(html).not.toContain('<code>');
    });

    it('escapes HTML in mermaid source', () => {
      const html = renderMarkdown('```mermaid\nA --> B["<script>"];\n```');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});

describe('debounce', () => {
  it('calls the function after the delay', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 80));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('resets the timer on subsequent calls', async () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced();
    await new Promise(r => setTimeout(r, 30));
    debounced(); // reset
    await new Promise(r => setTimeout(r, 30));
    expect(fn).not.toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 40));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('setupLivePreview', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="editor"></textarea>
      <div id="preview"></div>
    `;
  });

  it('renders initial empty content', () => {
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    setupLivePreview(editor, preview, 0);
    // Empty textarea → empty preview
    expect(preview.innerHTML).toBe('');
  });

  it('renders after input event', async () => {
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    setupLivePreview(editor, preview, 0);
    editor.value = '# Test';
    editor.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r, 20));
    // After bidi pass, the h1 has dir and style attributes
    expect(preview.querySelector('h1').textContent).toBe('Test');
  });
});
