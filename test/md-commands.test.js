import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execMdCommand } from '../src/md-commands.js';

describe('md-commands', () => {
  let editor;

  beforeEach(() => {
    document.body.innerHTML = '<textarea id="editor"></textarea>';
    editor = document.getElementById('editor');
  });

  describe('bold', () => {
    it('wraps selected text with **', () => {
      editor.value = 'hello world';
      editor.selectionStart = 6;
      editor.selectionEnd = 11;
      execMdCommand(editor, 'bold');
      expect(editor.value).toBe('hello **world**');
    });

    it('inserts placeholder when nothing is selected', () => {
      editor.value = '';
      editor.selectionStart = 0;
      editor.selectionEnd = 0;
      execMdCommand(editor, 'bold');
      expect(editor.value).toBe('**bold text**');
      expect(editor.selectionStart).toBe(2);
      expect(editor.selectionEnd).toBe(11);
    });
  });

  describe('italic', () => {
    it('wraps selected text with _', () => {
      editor.value = 'hello world';
      editor.selectionStart = 6;
      editor.selectionEnd = 11;
      execMdCommand(editor, 'italic');
      expect(editor.value).toBe('hello _world_');
    });

    it('inserts placeholder when nothing is selected', () => {
      editor.value = '';
      execMdCommand(editor, 'italic');
      expect(editor.value).toBe('_italic text_');
    });
  });

  describe('heading1', () => {
    it('prefixes current line with # ', () => {
      editor.value = 'My Title';
      editor.selectionStart = 3;
      execMdCommand(editor, 'heading1');
      expect(editor.value).toBe('# My Title');
    });

    it('inserts placeholder on empty line', () => {
      editor.value = '';
      execMdCommand(editor, 'heading1');
      expect(editor.value).toBe('# Heading');
    });
  });

  describe('heading2', () => {
    it('prefixes current line with ## ', () => {
      editor.value = 'My Title';
      editor.selectionStart = 3;
      execMdCommand(editor, 'heading2');
      expect(editor.value).toBe('## My Title');
    });
  });

  describe('heading3', () => {
    it('prefixes current line with ### ', () => {
      editor.value = 'My Title';
      editor.selectionStart = 3;
      execMdCommand(editor, 'heading3');
      expect(editor.value).toBe('### My Title');
    });
  });

  describe('link', () => {
    it('wraps selected text as link', () => {
      editor.value = 'click here';
      editor.selectionStart = 0;
      editor.selectionEnd = 10;
      execMdCommand(editor, 'link');
      expect(editor.value).toBe('[click here](url)');
    });

    it('inserts placeholder when nothing is selected', () => {
      editor.value = '';
      execMdCommand(editor, 'link');
      expect(editor.value).toBe('[link text](url)');
    });
  });

  describe('image', () => {
    it('wraps selected text as image alt', () => {
      editor.value = 'photo';
      editor.selectionStart = 0;
      editor.selectionEnd = 5;
      execMdCommand(editor, 'image');
      expect(editor.value).toBe('![photo](url)');
    });

    it('inserts placeholder when nothing is selected', () => {
      editor.value = '';
      execMdCommand(editor, 'image');
      expect(editor.value).toBe('![alt text](url)');
    });
  });

  describe('bulletList', () => {
    it('prefixes line with - ', () => {
      editor.value = 'Item one';
      editor.selectionStart = 4;
      execMdCommand(editor, 'bulletList');
      expect(editor.value).toBe('- Item one');
    });
  });

  describe('numberedList', () => {
    it('prefixes line with 1. ', () => {
      editor.value = 'First item';
      editor.selectionStart = 0;
      execMdCommand(editor, 'numberedList');
      expect(editor.value).toBe('1. First item');
    });
  });

  describe('quote', () => {
    it('prefixes line with > ', () => {
      editor.value = 'Some text';
      editor.selectionStart = 0;
      execMdCommand(editor, 'quote');
      expect(editor.value).toBe('> Some text');
    });
  });

  describe('codeBlock', () => {
    it('inserts fenced code block', () => {
      editor.value = '';
      execMdCommand(editor, 'codeBlock');
      expect(editor.value).toBe('```\ncode\n```');
    });

    it('inserts on new line when cursor is mid-text', () => {
      editor.value = 'before';
      editor.selectionStart = 6;
      execMdCommand(editor, 'codeBlock');
      expect(editor.value).toBe('before\n```\ncode\n```');
    });
  });

  describe('hr', () => {
    it('inserts horizontal rule', () => {
      editor.value = '';
      execMdCommand(editor, 'hr');
      expect(editor.value).toBe('---');
    });
  });

  describe('table', () => {
    it('inserts a markdown table', () => {
      editor.value = '';
      execMdCommand(editor, 'table');
      expect(editor.value).toContain('| Column 1 | Column 2 |');
      expect(editor.value).toContain('| -------- | -------- |');
      expect(editor.value).toContain('| Cell     | Cell     |');
    });
  });

  describe('dispatches input event', () => {
    it('fires input event for live preview update', () => {
      const handler = vi.fn();
      editor.addEventListener('input', handler);
      execMdCommand(editor, 'bold');
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('does nothing with null editor', () => {
    it('does not throw', () => {
      expect(() => execMdCommand(null, 'bold')).not.toThrow();
    });
  });
});
