import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setStorageProvider } from '../src/storage/provider.js';
import {
  setupFolderPanel, toggleFolderPanel, syncToFile,
  getCurrentFolder, setupPanelResize,
} from '../src/folder-panel.js';

describe('folder-panel', () => {
  let fileSelectCallback;
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

    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockStorage[key] ?? null),
      setItem: vi.fn((key, val) => { mockStorage[key] = String(val); }),
      removeItem: vi.fn((key) => { delete mockStorage[key]; }),
    });
  });

  afterEach(() => {
    setStorageProvider(null);
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
    it('populates folder list with entries from provider', async () => {
      const listDir = vi.fn().mockResolvedValue([
        { id: '/home/user/subfolder', name: 'subfolder', isDirectory: true },
        { id: '/home/user/notes.md', name: 'notes.md', isDirectory: false },
        { id: '/home/user/readme.markdown', name: 'readme.markdown', isDirectory: false },
      ]);
      const getParent = vi.fn().mockResolvedValue('/home');
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      const items = document.querySelectorAll('.folder-item');
      expect(items.length).toBe(4);
      expect(items[0].textContent).toBe('..');
      expect(items[1].textContent).toContain('subfolder');
      expect(items[2].textContent).toBe('notes.md');
      expect(items[3].textContent).toBe('readme.markdown');
    });

    it('filters out hidden directories', async () => {
      const listDir = vi.fn().mockResolvedValue([
        { id: '/home/user/docs', name: 'docs', isDirectory: true },
      ]);
      const getParent = vi.fn().mockResolvedValue('/home');
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      const items = document.querySelectorAll('.folder-item');
      expect(items.length).toBe(2);
      expect(items[1].textContent).toContain('docs');
    });

    it('calls fileSelectCallback when a file item is clicked', async () => {
      const listDir = vi.fn().mockResolvedValue([
        { id: '/home/user/test.md', name: 'test.md', isDirectory: false },
      ]);
      const getParent = vi.fn().mockResolvedValue('/home');
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      const fileItem = document.querySelector('.folder-file');
      fileItem.click();
      expect(fileSelectCallback).toHaveBeenCalledWith('/home/user/test.md');
    });

    it('navigates into a subfolder when clicked', async () => {
      const listDir = vi.fn()
        .mockResolvedValueOnce([
          { id: '/home/sub', name: 'sub', isDirectory: true },
        ])
        .mockResolvedValueOnce([
          { id: '/home/sub/inner.md', name: 'inner.md', isDirectory: false },
        ]);
      const getParent = vi.fn()
        .mockResolvedValueOnce('/home')
        .mockResolvedValueOnce('/home');
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home';
      await setupFolderPanel(fileSelectCallback);

      const dirItem = document.querySelector('.folder-dir');
      dirItem.click();

      await new Promise(r => setTimeout(r, 10));

      expect(listDir).toHaveBeenCalledWith('/home/sub');
      const pathEl = document.querySelector('.folder-path');
      expect(pathEl.textContent).toContain('sub');
    });

    it('navigates to parent when ".." is clicked', async () => {
      const listDir = vi.fn()
        .mockResolvedValueOnce([
          { id: '/home/user/file.md', name: 'file.md', isDirectory: false },
        ])
        .mockResolvedValueOnce([
          { id: '/home/user/child', name: 'child', isDirectory: true },
        ]);
      const getParent = vi.fn()
        .mockResolvedValueOnce('/home/user')
        .mockResolvedValueOnce('/home/user');
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home/user/docs';
      await setupFolderPanel(fileSelectCallback);

      const parentItem = document.querySelector('.folder-parent');
      parentItem.click();

      await new Promise(r => setTimeout(r, 10));

      expect(listDir).toHaveBeenCalledWith('/home/user');
    });

    it('saves current folder to localStorage', async () => {
      const listDir = vi.fn().mockResolvedValue([]);
      const getParent = vi.fn().mockResolvedValue(null);
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      expect(localStorage.setItem).toHaveBeenCalledWith('updown-last-folder', '/home/user');
    });
  });

  describe('syncToFile', () => {
    it('navigates to the parent folder of the given file', async () => {
      const listDir = vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          { id: '/home/user/docs/notes.md', name: 'notes.md', isDirectory: false },
        ]);
      const getParent = vi.fn((id) => {
        if (id === '/home/user/docs/notes.md') return Promise.resolve('/home/user/docs');
        if (id === '/home/user') return Promise.resolve('/home');
        return Promise.resolve(null);
      });
      setStorageProvider({
        listDirectory: listDir,
        getParentFolderId: getParent,
      });

      mockStorage['updown-last-folder'] = '/home/user';
      await setupFolderPanel(fileSelectCallback);

      syncToFile('/home/user/docs/notes.md');

      await new Promise(r => setTimeout(r, 10));

      expect(listDir).toHaveBeenCalledWith('/home/user/docs');
    });

    it('does nothing for null path', () => {
      syncToFile(null);
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
