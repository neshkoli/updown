import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setStorageProvider } from '../src/storage/provider.js';
import { getDocumentKind, setDocumentKind } from '../src/document-type.js';
import * as pdfView from '../src/pdf-view.js';
import {
  fileNew, fileOpenPath, fileRefresh, fileSave,
  getCurrentFilePath, setCurrentFilePath,
  isDirty, markDirty, checkDirty,
} from '../src/file-ops.js';

describe('file-ops', () => {
  let editor;
  let refreshPreview;
  /** @type {unknown} */
  let tauriBackup;

  beforeEach(() => {
    vi.stubGlobal('alert', vi.fn());
    tauriBackup = window.__TAURI__;
    window.__TAURI__ = {
      core: {
        convertFileSrc: vi.fn(() => globalThis.__UPDOWN_TEST_PDF_SRC__ ?? 'about:blank'),
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      dialog: { message: vi.fn().mockResolvedValue(undefined) },
    };
    globalThis.__UPDOWN_TEST_PDF_SRC__ = 'about:blank';
    document.body.innerHTML = `
      <div id="app">
        <textarea id="editor">existing content</textarea>
        <div id="preview"></div>
        <div id="pdf-viewer-wrap" class="hidden"><div class="pdf-viewer-zoom-outer"><div class="pdf-viewer-zoom-inner"><iframe id="pdf-viewer"></iframe></div></div></div>
      </div>`;
    editor = document.getElementById('editor');
    refreshPreview = vi.fn();
    setCurrentFilePath(null);
    setDocumentKind('markdown');
    fileNew(editor, refreshPreview);
    refreshPreview.mockClear();
  });

  afterEach(() => {
    setStorageProvider(null);
    delete globalThis.__UPDOWN_TEST_PDF_SRC__;
    vi.unstubAllGlobals();
    window.__TAURI__ = tauriBackup;
  });

  describe('fileNew', () => {
    it('clears the editor content', () => {
      editor.value = 'some markdown';
      fileNew(editor, refreshPreview);
      expect(editor.value).toBe('');
    });

    it('resets currentFilePath to null', () => {
      setCurrentFilePath('/some/file.md');
      fileNew(editor, refreshPreview);
      expect(getCurrentFilePath()).toBeNull();
    });

    it('sets the document title to Untitled', () => {
      fileNew(editor, refreshPreview);
      expect(document.title).toBe('Untitled — UpDown');
    });

    it('marks file as clean (not dirty)', () => {
      markDirty();
      fileNew(editor, refreshPreview);
      expect(isDirty()).toBe(false);
    });

    it('calls refreshPreview', () => {
      fileNew(editor, refreshPreview);
      expect(refreshPreview).toHaveBeenCalledTimes(1);
    });

    it('clears PDF mode after opening a PDF then New', async () => {
      setStorageProvider({ readFile: vi.fn().mockResolvedValue('') });
      await fileOpenPath('/x/y.pdf', editor, refreshPreview);
      expect(getDocumentKind()).toBe('pdf');
      fileNew(editor, refreshPreview);
      expect(getDocumentKind()).toBe('markdown');
      expect(document.getElementById('app').classList.contains('document-pdf')).toBe(false);
    });
  });

  describe('fileOpenPath', () => {
    it('reads file content and sets editor value', async () => {
      const fakeContent = '# Hello from file';
      const mockProvider = {
        readFile: vi.fn().mockResolvedValue(fakeContent),
      };
      setStorageProvider(mockProvider);

      await fileOpenPath('/home/user/doc.md', editor, refreshPreview);

      expect(mockProvider.readFile).toHaveBeenCalledWith('/home/user/doc.md');
      expect(editor.value).toBe(fakeContent);
      expect(getCurrentFilePath()).toBe('/home/user/doc.md');
      expect(document.title).toBe('doc.md — UpDown');
      expect(refreshPreview).toHaveBeenCalledTimes(1);
    });

    it('marks file as clean after opening', async () => {
      const mockProvider = {
        readFile: vi.fn().mockResolvedValue('content'),
      };
      setStorageProvider(mockProvider);
      markDirty();
      await fileOpenPath('/home/user/doc.md', editor, refreshPreview);
      expect(isDirty()).toBe(false);
    });

    it('does nothing when no storage provider', async () => {
      setStorageProvider(null);
      editor.value = 'original';
      await fileOpenPath('/some/file.md', editor, refreshPreview);
      expect(editor.value).toBe('original');
      expect(refreshPreview).not.toHaveBeenCalled();
    });

    it('opens PDF without calling readFile', async () => {
      const readFile = vi.fn().mockResolvedValue('binary');
      setStorageProvider({ readFile });

      await fileOpenPath('/home/user/doc.PDF', editor, refreshPreview);

      expect(readFile).not.toHaveBeenCalled();
      expect(getDocumentKind()).toBe('pdf');
      expect(getCurrentFilePath()).toBe('/home/user/doc.PDF');
      expect(editor.value).toBe('');
      expect(document.getElementById('app').classList.contains('document-pdf')).toBe(true);
    });

    it('opens markdown after PDF and calls readFile', async () => {
      const readFile = vi.fn().mockResolvedValue('# second');
      setStorageProvider({ readFile });

      await fileOpenPath('/a/file.pdf', editor, refreshPreview);
      await fileOpenPath('/b/x.md', editor, refreshPreview);

      expect(getDocumentKind()).toBe('markdown');
      expect(readFile).toHaveBeenCalledTimes(1);
      expect(readFile).toHaveBeenCalledWith('/b/x.md');
      expect(document.getElementById('app').classList.contains('document-pdf')).toBe(false);
    });

    it('opens PDF from opaque id using readFileAsArrayBuffer when display name ends in .pdf', async () => {
      const readFile = vi.fn().mockResolvedValue('text');
      const readFileAsArrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(4));
      setStorageProvider({ readFile, readFileAsArrayBuffer });
      const saved = window.__TAURI__;
      delete window.__TAURI__;
      const showAb = vi.spyOn(pdfView, 'showPdfFromArrayBuffer').mockReturnValue(true);
      try {
        await fileOpenPath('driveFileIdXYZ', editor, refreshPreview, { displayName: 'Report.pdf' });
      } finally {
        showAb.mockRestore();
        window.__TAURI__ = saved;
      }

      expect(readFileAsArrayBuffer).toHaveBeenCalledWith('driveFileIdXYZ');
      expect(readFile).not.toHaveBeenCalled();
      expect(getDocumentKind()).toBe('pdf');
      expect(document.title).toContain('Report.pdf');
    });
  });

  describe('fileRefresh', () => {
    it('reloads PDF via reloadPdfViewer without readFile', async () => {
      const readFile = vi.fn().mockResolvedValue('x');
      setStorageProvider({ readFile });
      const reloadSpy = vi.spyOn(pdfView, 'reloadPdfViewer').mockImplementation(() => {});

      await fileOpenPath('/path/doc.pdf', editor, refreshPreview);
      readFile.mockClear();
      await fileRefresh(editor, refreshPreview);

      expect(reloadSpy).toHaveBeenCalledTimes(1);
      expect(readFile).not.toHaveBeenCalled();
      reloadSpy.mockRestore();
    });

    it('reloads current file from disk and updates editor', async () => {
      const diskContent = '# Reloaded from disk';
      const mockProvider = {
        readFile: vi.fn().mockResolvedValue(diskContent),
      };
      setStorageProvider(mockProvider);
      await fileOpenPath('/path/doc.md', editor, refreshPreview);
      refreshPreview.mockClear();
      editor.value = 'local unsaved changes';

      await fileRefresh(editor, refreshPreview);

      expect(mockProvider.readFile).toHaveBeenCalledWith('/path/doc.md');
      expect(editor.value).toBe(diskContent);
      expect(refreshPreview).toHaveBeenCalledTimes(1);
    });

    it('shows error when no file is open', async () => {
      setStorageProvider({ readFile: vi.fn() });
      const messageSpy = vi.spyOn(window.__TAURI__.dialog, 'message').mockResolvedValue(undefined);
      fileNew(editor, refreshPreview);

      await fileRefresh(editor, refreshPreview);

      expect(messageSpy).toHaveBeenCalledWith('No file open to refresh.', {
        title: 'UpDown — Error',
        kind: 'error',
      });
      messageSpy.mockRestore();
    });
  });

  describe('fileSave', () => {
    it('writes file and marks clean', async () => {
      const writeFile = vi.fn().mockResolvedValue(undefined);
      const mockProvider = { writeFile };
      setStorageProvider(mockProvider);
      setCurrentFilePath('/path/to/file.md');
      editor.value = 'new content';
      markDirty();

      await fileSave(editor);

      expect(writeFile).toHaveBeenCalledWith('/path/to/file.md', 'new content');
      expect(isDirty()).toBe(false);
      expect(document.title).toBe('file.md — UpDown');
    });

    it('does not write when current file is PDF', async () => {
      const writeFile = vi.fn().mockResolvedValue(undefined);
      setStorageProvider({ readFile: vi.fn().mockResolvedValue(''), writeFile });
      await fileOpenPath('/path/doc.pdf', editor, refreshPreview);
      editor.value = 'garbage';
      writeFile.mockClear();

      await fileSave(editor);

      expect(writeFile).not.toHaveBeenCalled();
    });
  });

  describe('dirty tracking', () => {
    it('starts clean after fileNew', () => {
      fileNew(editor, refreshPreview);
      expect(isDirty()).toBe(false);
    });

    it('markDirty sets dirty flag', () => {
      markDirty();
      expect(isDirty()).toBe(true);
    });

    it('title shows * when dirty with a file path', () => {
      setCurrentFilePath('/path/doc.md');
      markDirty();
      expect(document.title).toContain('*');
      expect(document.title).toBe('doc.md * — UpDown');
    });

    it('title has no * when clean', () => {
      fileNew(editor, refreshPreview);
      expect(document.title).not.toContain('*');
    });

    it('checkDirty detects change from saved content', () => {
      fileNew(editor, refreshPreview);
      checkDirty('modified');
      expect(isDirty()).toBe(true);
    });

    it('checkDirty marks clean when content matches saved', () => {
      fileNew(editor, refreshPreview);
      checkDirty('changed');
      expect(isDirty()).toBe(true);
      checkDirty('');
      expect(isDirty()).toBe(false);
    });
  });

  describe('getCurrentFilePath / setCurrentFilePath', () => {
    it('starts as null', () => {
      expect(getCurrentFilePath()).toBeNull();
    });

    it('returns the path after setting', () => {
      setCurrentFilePath('/path/to/file.md');
      expect(getCurrentFilePath()).toBe('/path/to/file.md');
    });
  });
});
