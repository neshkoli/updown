import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fileNew, fileOpenPath, fileSave,
  getCurrentFilePath, setCurrentFilePath,
  isDirty, markDirty, checkDirty,
} from '../src/file-ops.js';

describe('file-ops', () => {
  let editor;
  let refreshPreview;

  beforeEach(() => {
    document.body.innerHTML = '<textarea id="editor">existing content</textarea>';
    editor = document.getElementById('editor');
    refreshPreview = vi.fn();
    // Reset module state
    setCurrentFilePath(null);
    // Start clean by doing a fileNew
    fileNew(editor, refreshPreview);
    refreshPreview.mockClear();
  });

  afterEach(() => {
    delete window.__TAURI__;
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
  });

  describe('fileOpenPath', () => {
    it('reads file content and sets editor value', async () => {
      const fakeContent = '# Hello from file';
      window.__TAURI__ = {
        fs: { readTextFile: vi.fn().mockResolvedValue(fakeContent) },
      };

      await fileOpenPath('/home/user/doc.md', editor, refreshPreview);

      expect(window.__TAURI__.fs.readTextFile).toHaveBeenCalledWith('/home/user/doc.md');
      expect(editor.value).toBe(fakeContent);
      expect(getCurrentFilePath()).toBe('/home/user/doc.md');
      expect(document.title).toBe('doc.md — UpDown');
      expect(refreshPreview).toHaveBeenCalledTimes(1);
    });

    it('marks file as clean after opening', async () => {
      window.__TAURI__ = {
        fs: { readTextFile: vi.fn().mockResolvedValue('content') },
      };
      markDirty();
      await fileOpenPath('/home/user/doc.md', editor, refreshPreview);
      expect(isDirty()).toBe(false);
    });

    it('does nothing when __TAURI__ is not available', async () => {
      delete window.__TAURI__;
      editor.value = 'original';
      await fileOpenPath('/some/file.md', editor, refreshPreview);
      expect(editor.value).toBe('original');
      expect(refreshPreview).not.toHaveBeenCalled();
    });
  });

  describe('fileSave', () => {
    it('writes file and marks clean', async () => {
      const writeTextFile = vi.fn().mockResolvedValue(undefined);
      window.__TAURI__ = { fs: { writeTextFile } };
      setCurrentFilePath('/path/to/file.md');
      editor.value = 'new content';
      markDirty();

      await fileSave(editor);

      expect(writeTextFile).toHaveBeenCalledWith('/path/to/file.md', 'new content');
      expect(isDirty()).toBe(false);
      expect(document.title).toBe('file.md — UpDown');
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
      // force title update by calling markDirty then checking title
      markDirty();
      // markDirty calls updateTitle which uses currentFilePath
      expect(document.title).toContain('*');
      expect(document.title).toBe('doc.md * — UpDown');
    });

    it('title has no * when clean', () => {
      fileNew(editor, refreshPreview);
      expect(document.title).not.toContain('*');
    });

    it('checkDirty detects change from saved content', () => {
      fileNew(editor, refreshPreview); // savedContent = ''
      checkDirty('modified');
      expect(isDirty()).toBe(true);
    });

    it('checkDirty marks clean when content matches saved', () => {
      fileNew(editor, refreshPreview); // savedContent = ''
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
