import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveLocalMediaPath,
  toLoadableMediaUrl,
  rewriteLocalMediaInElement,
} from '../src/local-media.js';

describe('resolveLocalMediaPath', () => {
  it('resolves relative paths against the markdown file directory', () => {
    expect(resolveLocalMediaPath('/Users/me/docs/notes.md', './deprecation-ui.png'))
      .toBe('/Users/me/docs/deprecation-ui.png');
    expect(resolveLocalMediaPath('/Users/me/docs/notes.md', 'deprecation-ui.png'))
      .toBe('/Users/me/docs/deprecation-ui.png');
    expect(resolveLocalMediaPath('/Users/me/docs/notes.md', '../img/shot.png'))
      .toBe('/Users/me/img/shot.png');
  });

  it('keeps absolute filesystem paths', () => {
    expect(resolveLocalMediaPath('/Users/me/docs/notes.md', '/tmp/photo.png'))
      .toBe('/tmp/photo.png');
  });

  it('decodes percent-encoded relative names', () => {
    expect(resolveLocalMediaPath('/Users/me/docs/notes.md', './my%20ui.png'))
      .toBe('/Users/me/docs/my ui.png');
  });

  it('returns null for remote, data, and hash URLs', () => {
    expect(resolveLocalMediaPath('/Users/me/a.md', 'https://example.com/a.png')).toBeNull();
    expect(resolveLocalMediaPath('/Users/me/a.md', 'data:image/png;base64,xx')).toBeNull();
    expect(resolveLocalMediaPath('/Users/me/a.md', '#anchor')).toBeNull();
  });

  it('returns null without a filesystem markdown path', () => {
    expect(resolveLocalMediaPath(null, './a.png')).toBeNull();
    expect(resolveLocalMediaPath('1AbCdriveId', './a.png')).toBeNull();
  });
});

describe('toLoadableMediaUrl', () => {
  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    delete window.__TAURI__;
  });

  it('converts local files via Tauri convertFileSrc', () => {
    window.__TAURI_INTERNALS__ = {
      convertFileSrc: vi.fn((path) => `asset://localhost${path}`),
    };
    expect(toLoadableMediaUrl('/Users/me/docs/notes.md', './deprecation-ui.png'))
      .toBe('asset://localhost/Users/me/docs/deprecation-ui.png');
    expect(window.__TAURI_INTERNALS__.convertFileSrc)
      .toHaveBeenCalledWith('/Users/me/docs/deprecation-ui.png', 'asset');
  });

  it('leaves remote URLs unchanged', () => {
    expect(toLoadableMediaUrl('/Users/me/a.md', 'https://cdn.example/x.png'))
      .toBe('https://cdn.example/x.png');
  });
});

describe('rewriteLocalMediaInElement', () => {
  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
  });

  it('rewrites img src and CSS background-image', () => {
    window.__TAURI_INTERNALS__ = {
      convertFileSrc: (path) => `asset://localhost${path}`,
    };
    const root = document.createElement('div');
    root.innerHTML = '<img alt="ui" src="./deprecation-ui.png">';
    const slide = document.createElement('div');
    slide.style.backgroundImage = "url('./bg.png')";
    root.appendChild(slide);

    rewriteLocalMediaInElement(root, '/Users/me/talk/deck.md');

    expect(root.querySelector('img').getAttribute('src'))
      .toBe('asset://localhost/Users/me/talk/deprecation-ui.png');
    expect(slide.style.backgroundImage)
      .toContain('asset://localhost/Users/me/talk/bg.png');
  });
});
