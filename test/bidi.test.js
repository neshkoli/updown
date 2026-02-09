import { describe, it, expect, beforeEach } from 'vitest';
import { detectDirection, applyBidi } from '../src/bidi.js';

describe('detectDirection', () => {
  it('returns rtl for mostly Hebrew text', () => {
    expect(detectDirection('שלום עולם hello')).toBe('rtl');
  });

  it('returns ltr for mostly Latin text', () => {
    expect(detectDirection('hello world שלום')).toBe('ltr');
  });

  it('returns ltr for all-Latin text', () => {
    expect(detectDirection('just english text')).toBe('ltr');
  });

  it('returns rtl for all-Hebrew text', () => {
    expect(detectDirection('רק טקסט בעברית')).toBe('rtl');
  });

  it('returns ltr for empty string', () => {
    expect(detectDirection('')).toBe('ltr');
  });

  it('returns ltr for numbers only (no letters)', () => {
    expect(detectDirection('12345')).toBe('ltr');
  });

  it('handles mixed with equal counts as ltr (Hebrew not > Latin)', () => {
    // 3 Hebrew letters + 3 Latin letters → not strictly more Hebrew → ltr
    expect(detectDirection('אבג abc')).toBe('ltr');
  });

  it('returns rtl when Hebrew is majority in a mixed paragraph', () => {
    // 5 Hebrew + 2 Latin
    expect(detectDirection('זהו טקסט ok בעברית')).toBe('rtl');
  });
});

describe('applyBidi', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sets dir=rtl and text-align right on a Hebrew paragraph', () => {
    document.body.innerHTML = '<div id="c"><p>שלום עולם</p></div>';
    const container = document.getElementById('c');
    applyBidi(container);
    const p = container.querySelector('p');
    expect(p.getAttribute('dir')).toBe('rtl');
    expect(p.style.textAlign).toBe('right');
  });

  it('sets dir=ltr and text-align left on an English paragraph', () => {
    document.body.innerHTML = '<div id="c"><p>Hello world</p></div>';
    const container = document.getElementById('c');
    applyBidi(container);
    const p = container.querySelector('p');
    expect(p.getAttribute('dir')).toBe('ltr');
    expect(p.style.textAlign).toBe('left');
  });

  it('handles multiple paragraphs with different directions', () => {
    document.body.innerHTML = `
      <div id="c">
        <p>שלום עולם</p>
        <p>Hello world</p>
        <p>עוד משפט בעברית עם some english</p>
      </div>`;
    const container = document.getElementById('c');
    applyBidi(container);
    const ps = container.querySelectorAll('p');
    expect(ps[0].getAttribute('dir')).toBe('rtl');
    expect(ps[1].getAttribute('dir')).toBe('ltr');
    expect(ps[2].getAttribute('dir')).toBe('rtl'); // more Hebrew
  });

  it('applies to list items', () => {
    document.body.innerHTML = '<div id="c"><ul><li>פריט</li><li>item</li></ul></div>';
    const container = document.getElementById('c');
    applyBidi(container);
    const lis = container.querySelectorAll('li');
    expect(lis[0].getAttribute('dir')).toBe('rtl');
    expect(lis[1].getAttribute('dir')).toBe('ltr');
  });

  it('sets dir on ul/ol parent so markers flip for RTL lists', () => {
    document.body.innerHTML = '<div id="c"><ul><li>פריט ראשון</li><li>פריט שני</li></ul></div>';
    const container = document.getElementById('c');
    applyBidi(container);
    expect(container.querySelector('ul').getAttribute('dir')).toBe('rtl');
  });

  it('sets dir=ltr on ul/ol when content is mostly English', () => {
    document.body.innerHTML = '<div id="c"><ol><li>first item</li><li>second item</li></ol></div>';
    const container = document.getElementById('c');
    applyBidi(container);
    expect(container.querySelector('ol').getAttribute('dir')).toBe('ltr');
  });

  it('applies to headings', () => {
    document.body.innerHTML = '<div id="c"><h1>כותרת</h1><h2>Title</h2></div>';
    const container = document.getElementById('c');
    applyBidi(container);
    expect(container.querySelector('h1').getAttribute('dir')).toBe('rtl');
    expect(container.querySelector('h2').getAttribute('dir')).toBe('ltr');
  });
});
