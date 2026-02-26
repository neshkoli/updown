import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setStorageProvider } from '../src/storage/provider.js';
import {
  fileNew, fileOpenPath, fileRefresh, fileSave,
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
    setCurrentFilePath(null);
    fileNew(editor, refreshPreview);
    refreshPreview.mockClear();
  });

  afterEach(() => {
    setStorageProvider(null);
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
  });

  describe('fileRefresh', () => {
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
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      fileNew(editor, refreshPreview);

      await fileRefresh(editor, refreshPreview);

      expect(alertSpy).toHaveBeenCalledWith('No file open to refresh.');
      alertSpy.mockRestore();
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
