import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setDocumentKind } from '../src/document-type.js';
import { setViewMode, onAction, getViewMode, setFileActionHandlers, setViewActionHandlers, setupToolbar, resetPreviewZoom } from '../src/editor-ui.js';

/** Build a minimal app DOM matching the toolbar structure in index.html */
function createAppDOM() {
  document.body.innerHTML = `
    <div id="app">
      <header class="toolbar">
        <div class="toolbar-group">
          <button type="button" class="toolbar-btn" data-action="new" title="New file"></button>
          <button type="button" class="toolbar-btn" data-action="open" title="Open file"></button>
          <button type="button" class="toolbar-btn" data-action="save" title="Save"></button>
          <button type="button" class="toolbar-btn" data-action="saveAs" title="Save As"></button>
        </div>
        <div class="toolbar-separator"></div>
        <div class="toolbar-group">
          <button type="button" class="toolbar-btn view-btn" data-mode="source" title="Source view"></button>
          <button type="button" class="toolbar-btn view-btn" data-mode="preview" title="Preview"></button>
          <button type="button" class="toolbar-btn view-btn active" data-mode="split" title="Split view"></button>
        </div>
        <div class="toolbar-separator"></div>
        <div class="toolbar-group zoom-buttons">
          <button type="button" class="toolbar-btn" data-action="zoomOut"></button>
          <span id="zoom-level" class="zoom-level">100%</span>
          <button type="button" class="toolbar-btn" data-action="zoomIn"></button>
          <button type="button" class="toolbar-btn zoom-reset-btn" data-action="zoomReset"></button>
        </div>
        <div class="toolbar-separator"></div>
        <div class="toolbar-group">
          <button type="button" class="toolbar-btn" data-action="toggleFolder" title="Toggle folder panel"></button>
        </div>
      </header>
      <main class="main-content">
        <textarea id="editor"></textarea>
        <div class="preview-container">
          <div id="preview" class="preview">Preview</div>
          <div id="pdf-viewer-wrap" class="pdf-viewer-wrap hidden">
            <div class="pdf-viewer-zoom-outer"><div class="pdf-viewer-zoom-inner"><iframe id="pdf-viewer"></iframe></div></div>
          </div>
        </div>
      </main>
    </div>
  `;
}

describe('editor-ui', () => {
  beforeEach(() => {
    setDocumentKind('markdown');
    createAppDOM();
    resetPreviewZoom(document);
  });

  describe('setViewMode', () => {
    it('sets active class on the view button matching the mode', () => {
      setViewMode(document, 'source');
      const source = document.querySelector('.view-btn[data-mode="source"]');
      const split = document.querySelector('.view-btn[data-mode="split"]');
      expect(source.classList.contains('active')).toBe(true);
      expect(split.classList.contains('active')).toBe(false);
    });

    it('removes active from other view buttons when switching to preview', () => {
      setViewMode(document, 'preview');
      const preview = document.querySelector('.view-btn[data-mode="preview"]');
      const split = document.querySelector('.view-btn[data-mode="split"]');
      expect(preview.classList.contains('active')).toBe(true);
      expect(split.classList.contains('active')).toBe(false);
    });

    it('updates getViewMode() return value', () => {
      setViewMode(document, 'source');
      expect(getViewMode()).toBe('source');
      setViewMode(document, 'split');
      expect(getViewMode()).toBe('split');
    });

    it('adds view-mode-source class to #app in source mode', () => {
      setViewMode(document, 'source');
      const app = document.getElementById('app');
      expect(app.classList.contains('view-mode-source')).toBe(true);
      expect(app.classList.contains('view-mode-preview')).toBe(false);
      expect(app.classList.contains('view-mode-split')).toBe(false);
    });

    it('adds view-mode-preview class to #app in preview mode', () => {
      setViewMode(document, 'preview');
      const app = document.getElementById('app');
      expect(app.classList.contains('view-mode-preview')).toBe(true);
      expect(app.classList.contains('view-mode-source')).toBe(false);
      expect(app.classList.contains('view-mode-split')).toBe(false);
    });

    it('adds view-mode-split class to #app in split mode', () => {
      setViewMode(document, 'split');
      const app = document.getElementById('app');
      expect(app.classList.contains('view-mode-split')).toBe(true);
      expect(app.classList.contains('view-mode-source')).toBe(false);
      expect(app.classList.contains('view-mode-preview')).toBe(false);
    });

    it('replaces the previous view-mode class when switching', () => {
      setViewMode(document, 'source');
      setViewMode(document, 'preview');
      const app = document.getElementById('app');
      expect(app.classList.contains('view-mode-preview')).toBe(true);
      expect(app.classList.contains('view-mode-source')).toBe(false);
    });

    it('forces preview when document is PDF and source is requested', () => {
      setDocumentKind('pdf');
      setViewMode(document, 'source');
      expect(getViewMode()).toBe('preview');
      const app = document.getElementById('app');
      expect(app.classList.contains('view-mode-preview')).toBe(true);
      expect(app.classList.contains('view-mode-source')).toBe(false);
    });

    it('forces preview when document is PDF and split is requested', () => {
      setDocumentKind('pdf');
      setViewMode(document, 'split');
      expect(getViewMode()).toBe('preview');
    });
  });

  describe('onAction', () => {
    it('calls registered handler for new action', () => {
      const handler = vi.fn();
      setFileActionHandlers({ new: handler });
      onAction('new');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls registered handler for open action', () => {
      const handler = vi.fn();
      setFileActionHandlers({ open: handler });
      onAction('open');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls registered handler for save action', () => {
      const handler = vi.fn();
      setFileActionHandlers({ save: handler });
      onAction('save');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls registered handler for saveAs action', () => {
      const handler = vi.fn();
      setFileActionHandlers({ saveAs: handler });
      onAction('saveAs');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('calls view action handler for toggleFolder', () => {
      const toggle = vi.fn();
      setViewActionHandlers({ toggleFolder: toggle });
      onAction('toggleFolder');
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('prefers view action handlers over file action handlers', () => {
      const viewHandler = vi.fn();
      const fileHandler = vi.fn();
      setViewActionHandlers({ test: viewHandler });
      setFileActionHandlers({ test: fileHandler });
      onAction('test');
      expect(viewHandler).toHaveBeenCalledTimes(1);
      expect(fileHandler).not.toHaveBeenCalled();
    });

    it('does nothing for unknown actions', () => {
      setFileActionHandlers({});
      setViewActionHandlers({});
      expect(() => onAction('unknown')).not.toThrow();
    });
  });

  describe('setupToolbar', () => {
    it('clicking a view-btn changes the view mode', () => {
      setupToolbar(document);
      const sourceBtn = document.querySelector('.view-btn[data-mode="source"]');
      sourceBtn.click();
      expect(getViewMode()).toBe('source');
      expect(sourceBtn.classList.contains('active')).toBe(true);
    });

    it('clicking a file action button calls the registered handler', () => {
      const handler = vi.fn();
      setFileActionHandlers({ new: handler });
      setupToolbar(document);
      document.querySelector('[data-action="new"]').click();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('clicking toggleFolder calls view action handler', () => {
      const toggle = vi.fn();
      setViewActionHandlers({ toggleFolder: toggle });
      setupToolbar(document);
      document.querySelector('[data-action="toggleFolder"]').click();
      expect(toggle).toHaveBeenCalledTimes(1);
    });

    it('zoom reset returns to 100% and disables reset button', () => {
      setupToolbar(document);
      document.querySelector('[data-action="zoomIn"]').click();
      expect(document.getElementById('zoom-level').textContent).toBe('110%');
      expect(document.querySelector('[data-action="zoomReset"]').disabled).toBe(false);
      document.querySelector('[data-action="zoomReset"]').click();
      expect(document.getElementById('zoom-level').textContent).toBe('100%');
      expect(document.querySelector('[data-action="zoomReset"]').disabled).toBe(true);
    });
  });

  describe('setViewActionHandlers', () => {
    it('is a function', () => {
      expect(typeof setViewActionHandlers).toBe('function');
    });
  });

  describe('DOM structure (smoke)', () => {
    it('has editor and preview elements', () => {
      expect(document.getElementById('editor')).toBeTruthy();
      expect(document.getElementById('preview')).toBeTruthy();
    });

    it('has toolbar with view buttons', () => {
      expect(document.querySelector('.toolbar')).toBeTruthy();
      expect(document.querySelectorAll('.view-btn').length).toBe(3);
    });

    it('has file action buttons', () => {
      expect(document.querySelector('[data-action="new"]')).toBeTruthy();
      expect(document.querySelector('[data-action="open"]')).toBeTruthy();
      expect(document.querySelector('[data-action="save"]')).toBeTruthy();
      expect(document.querySelector('[data-action="saveAs"]')).toBeTruthy();
    });
  });
});
