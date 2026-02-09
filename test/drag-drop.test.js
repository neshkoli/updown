import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupDragDrop } from '../src/drag-drop.js';

describe('drag-drop', () => {
  let editor;
  let refreshPreview;
  let fileOpenPath;
  let dragDropHandler;
  let savedTauri;

  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <textarea id="editor"></textarea>
        <div id="preview"></div>
      </div>
    `;
    editor = document.getElementById('editor');
    refreshPreview = vi.fn();
    fileOpenPath = vi.fn().mockResolvedValue(undefined);
    dragDropHandler = null;
    savedTauri = window.__TAURI__;

    window.__TAURI__ = {
      webview: {
        getCurrentWebview: () => ({
          onDragDropEvent: vi.fn((handler) => {
            dragDropHandler = handler;
            return Promise.resolve(() => {});
          }),
        }),
      },
    };
  });

  afterEach(() => {
    if (savedTauri) {
      window.__TAURI__ = savedTauri;
    } else {
      delete window.__TAURI__;
    }
  });

  it('creates a drop overlay element', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);
    const overlay = document.getElementById('drop-overlay');
    expect(overlay).toBeTruthy();
    expect(overlay.textContent).toContain('Drop markdown file here');
  });

  it('registers an onDragDropEvent handler', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);
    expect(dragDropHandler).toBeTypeOf('function');
  });

  it('shows overlay on "over" event', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);
    const overlay = document.getElementById('drop-overlay');
    dragDropHandler({ payload: { type: 'over' } });
    expect(overlay.classList.contains('visible')).toBe(true);
  });

  it('hides overlay and opens file on "drop" event', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);
    const overlay = document.getElementById('drop-overlay');
    overlay.classList.add('visible');

    dragDropHandler({
      payload: {
        type: 'drop',
        paths: ['/Users/me/notes.md'],
      },
    });

    expect(overlay.classList.contains('visible')).toBe(false);
    expect(fileOpenPath).toHaveBeenCalledWith('/Users/me/notes.md', editor, refreshPreview);
  });

  it('prefers .md file when multiple files are dropped', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);

    dragDropHandler({
      payload: {
        type: 'drop',
        paths: ['/Users/me/image.png', '/Users/me/readme.md', '/Users/me/data.json'],
      },
    });

    expect(fileOpenPath).toHaveBeenCalledWith('/Users/me/readme.md', editor, refreshPreview);
  });

  it('falls back to first file if no .md file in drop', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);

    dragDropHandler({
      payload: {
        type: 'drop',
        paths: ['/Users/me/notes.txt'],
      },
    });

    expect(fileOpenPath).toHaveBeenCalledWith('/Users/me/notes.txt', editor, refreshPreview);
  });

  it('hides overlay on "cancel" event', () => {
    setupDragDrop(editor, refreshPreview, fileOpenPath);
    const overlay = document.getElementById('drop-overlay');
    overlay.classList.add('visible');

    dragDropHandler({ payload: { type: 'cancel' } });
    expect(overlay.classList.contains('visible')).toBe(false);
  });

  it('does nothing without __TAURI__', () => {
    delete window.__TAURI__;
    setupDragDrop(editor, refreshPreview, fileOpenPath);
    expect(document.getElementById('drop-overlay')).toBeNull();
  });
});
