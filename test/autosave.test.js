import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock file-ops before importing autosave
vi.mock('../src/file-ops.js', () => ({
  getCurrentFilePath: vi.fn(),
  checkDirty: vi.fn(),
  fileSave: vi.fn().mockResolvedValue(undefined),
}));

const { getCurrentFilePath, checkDirty, fileSave } = await import('../src/file-ops.js');
const { setupAutosave } = await import('../src/autosave.js');

describe('autosave', () => {
  let editor;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '<textarea id="editor"></textarea>';
    editor = document.getElementById('editor');
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls checkDirty on editor input', () => {
    getCurrentFilePath.mockReturnValue(null);
    setupAutosave(editor, 500);

    editor.value = 'hello';
    editor.dispatchEvent(new Event('input'));

    expect(checkDirty).toHaveBeenCalledWith('hello');
  });

  it('does not autosave when no file path is set', () => {
    getCurrentFilePath.mockReturnValue(null);
    setupAutosave(editor, 500);

    editor.value = 'hello';
    editor.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(600);

    expect(fileSave).not.toHaveBeenCalled();
  });

  it('autosaves after debounce when file path is set', () => {
    getCurrentFilePath.mockReturnValue('/path/to/file.md');
    setupAutosave(editor, 500);

    editor.value = 'hello';
    editor.dispatchEvent(new Event('input'));

    // Not saved yet (debouncing)
    expect(fileSave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);

    expect(fileSave).toHaveBeenCalledWith(editor);
  });

  it('debounces multiple rapid inputs', () => {
    getCurrentFilePath.mockReturnValue('/path/to/file.md');
    setupAutosave(editor, 500);

    editor.value = 'a';
    editor.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);

    editor.value = 'ab';
    editor.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(200);

    editor.value = 'abc';
    editor.dispatchEvent(new Event('input'));

    // Still hasn't fired
    expect(fileSave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);

    // Only one save call after all inputs settled
    expect(fileSave).toHaveBeenCalledTimes(1);
  });

  it('responds to paste events', () => {
    getCurrentFilePath.mockReturnValue('/path/to/file.md');
    setupAutosave(editor, 500);

    editor.value = 'pasted text';
    editor.dispatchEvent(new Event('paste'));

    vi.advanceTimersByTime(600);
    expect(fileSave).toHaveBeenCalledTimes(1);
  });
});
