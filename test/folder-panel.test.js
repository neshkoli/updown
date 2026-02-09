import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  setupFolderPanel, toggleFolderPanel, syncToFile,
  getCurrentFolder, setupPanelResize,
} from '../src/folder-panel.js';

describe('folder-panel', () => {
  let fileSelectCallback;
  let savedTauri;
  let mockStorage;

  function createPanelDOM() {
    document.body.innerHTML = `
      <div id="app">
        <main class="main-content">
          <aside id="folder-panel" class="folder-panel">
            <div class="folder-path"></div>
            <div id="folder-list" class="folder-list"></div>
            <div id="folder-resize" class="folder-resize"></div>
          </aside>
          <textarea id="editor"></textarea>
          <div id="preview"></div>
        </main>
      </div>
    `;
  }

  beforeEach(() => {
    createPanelDOM();
    fileSelectCallback = vi.fn();
    savedTauri = window.__TAURI__;

    // Mock localStorage since happy-dom's may be limited
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockStorage[key] ?? null),
      setItem: vi.fn((key, val) => { mockStorage[key] = String(val); }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; }),
    });
  });

  afterEach(() => {
    if (savedTauri) {
      window.__TAURI__ = savedTauri;
    } else {
      delete window.__TAURI__;
    }
  });

  describe('toggleFolderPanel', () => {
    it('hides the panel when visible', () => {
      const panel = document.getElementById('folder-panel');
      expect(panel.classList.contains('hidden')).toBe(false);
      toggleFolderPanel();
      expect(panel.classList.contains('hidden')).toBe(true);
    });

    it('shows the panel when hidden', () => {
      const panel = document.getElementById('folder-panel');
      panel.classList.add('hidden');
      toggleFolderPanel();
      expect(panel.classList.contains('hidden')).toBe(false);
    });

    it('toggles back and forth', () => {
      toggleFolderPanel();
      expect(document.getElementById('folder-panel').classList.contains('hidden')).toBe(true);
      toggleFolderPanel();
      expect(document.getElementById('folder-panel').classList.contains('hidden')).toBe(false);
    });
  });

  describe('setupFolderPanel', () => {
    it('populates folder list with entries from readDir', async () => {
      window.__TAURI__ = {
        fs: {
          readDir: vi.fn().mockResolvedValue([
            { name: 'notes.md', isDirectory: false },
            { name: 'subfolder', isDirectory: true },
            { name: 'image.png', isDirectory: false },
            { name: 'readme.markdown', isDirectory: false },
          ]),
        },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      const items = document.querySelectorAll('.folder-item');
      // Should have: "..", subfolder, notes.md, readme.markdown (image.png filtered)
      expect(items.length).toBe(4);
      expect(items[0].textContent).toBe('..');
      expect(items[1].textContent).toContain('subfolder');
      expect(items[2].textContent).toBe('notes.md');
      expect(items[3].textContent).toBe('readme.markdown');
    });

    it('filters out hidden directories', async () => {
      window.__TAURI__ = {
        fs: {
          readDir: vi.fn().mockResolvedValue([
            { name: '.git', isDirectory: true },
            { name: 'docs', isDirectory: true },
          ]),
        },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      const items = document.querySelectorAll('.folder-item');
      // ".." and "docs" only (.git filtered)
      expect(items.length).toBe(2);
      expect(items[1].textContent).toContain('docs');
    });

    it('calls fileSelectCallback when a file item is clicked', async () => {
      window.__TAURI__ = {
        fs: {
          readDir: vi.fn().mockResolvedValue([
            { name: 'test.md', isDirectory: false },
          ]),
        },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      const fileItem = document.querySelector('.folder-file');
      fileItem.click();
      expect(fileSelectCallback).toHaveBeenCalledWith('/home/user/test.md');
    });

    it('navigates into a subfolder when clicked', async () => {
      const readDir = vi.fn()
        .mockResolvedValueOnce([
          { name: 'sub', isDirectory: true },
        ])
        .mockResolvedValueOnce([
          { name: 'inner.md', isDirectory: false },
        ]);

      window.__TAURI__ = {
        fs: { readDir },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home';
      await setupFolderPanel(fileSelectCallback);

      const dirItem = document.querySelector('.folder-dir');
      dirItem.click();

      // Wait for async navigateTo
      await new Promise(r => setTimeout(r, 10));

      expect(readDir).toHaveBeenCalledWith('/home/sub');
      const pathEl = document.querySelector('.folder-path');
      expect(pathEl.textContent).toContain('sub');
    });

    it('navigates to parent when ".." is clicked', async () => {
      const readDir = vi.fn()
        .mockResolvedValueOnce([
          { name: 'file.md', isDirectory: false },
        ])
        .mockResolvedValueOnce([
          { name: 'child', isDirectory: true },
        ]);

      window.__TAURI__ = {
        fs: { readDir },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home/user/docs';
      await setupFolderPanel(fileSelectCallback);

      const parentItem = document.querySelector('.folder-parent');
      parentItem.click();

      await new Promise(r => setTimeout(r, 10));

      expect(readDir).toHaveBeenCalledWith('/home/user');
    });

    it('saves current folder to localStorage', async () => {
      window.__TAURI__ = {
        fs: { readDir: vi.fn().mockResolvedValue([]) },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      expect(localStorage.setItem).toHaveBeenCalledWith('updown-last-folder', '/home/user');
    });
  });

  describe('syncToFile', () => {
    it('navigates to the parent folder of the given file', async () => {
      const readDir = vi.fn()
        .mockResolvedValueOnce([])  // initial load
        .mockResolvedValueOnce([    // after sync
          { name: 'notes.md', isDirectory: false },
        ]);

      window.__TAURI__ = {
        fs: { readDir },
        core: { invoke: vi.fn().mockRejectedValue(new Error('mock')) },
      };

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      syncToFile('/home/user/docs/notes.md');

      await new Promise(r => setTimeout(r, 10));

      expect(readDir).toHaveBeenCalledWith('/home/user/docs');
    });

    it('does nothing for null path', () => {
      syncToFile(null);
      // No error thrown
    });
  });

  describe('setupPanelResize', () => {
    it('restores saved width from localStorage', () => {
      mockStorage['updown-panel-width'] = '300px';
      setupPanelResize();
      const panel = document.getElementById('folder-panel');
      expect(panel.style.width).toBe('300px');
    });
  });
});
