/**
 * UpDown — Tauri entry point.
 * Wires toolbar, editor, preview, file ops, drag-drop, autosave, and folder panel.
 */
import { setupToolbar, setViewMode, getViewMode, setFileActionHandlers, setViewActionHandlers, setMdCommandHandler, onAction } from './editor-ui.js';
import { setupLivePreview } from './render.js';
import { fileNew, fileOpen, fileOpenPath, fileSave, fileSaveAs, getCurrentFilePath } from './file-ops.js';
import { setupDragDrop } from './drag-drop.js';
import { setupAutosave } from './autosave.js';
import { setupFolderPanel, setupPanelResize, toggleFolderPanel, syncToFile } from './folder-panel.js';
import { execMdCommand } from './md-commands.js';

window.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  let refreshPreview = () => {};

  if (editor && preview) {
    refreshPreview = setupLivePreview(editor, preview);
  }

  // Wire file actions to file-ops module
  setFileActionHandlers({
    new: () => fileNew(editor, refreshPreview),
    open: async () => {
      await fileOpen(editor, refreshPreview);
      syncToFile(getCurrentFilePath());
    },
    save: async () => {
      await fileSave(editor);
      syncToFile(getCurrentFilePath());
    },
    saveAs: async () => {
      await fileSaveAs(editor);
      syncToFile(getCurrentFilePath());
    },
  });

  // Wire view actions
  setViewActionHandlers({
    toggleFolder: toggleFolderPanel,
    viewSource: () => setViewMode(document, 'source'),
    viewPreview: () => setViewMode(document, 'preview'),
    viewSplit: () => setViewMode(document, 'split'),
  });

  // Wire markdown formatting commands
  setMdCommandHandler((command) => execMdCommand(editor, command));

  // Set up toolbar after handlers are registered
  setupToolbar(document);
  setViewMode(document, getViewMode() || 'split');

  // Drag-and-drop to open files (sync folder panel after open)
  setupDragDrop(editor, refreshPreview, fileOpenPath, syncToFile);

  // Autosave on edit (1.5s debounce)
  if (editor) {
    setupAutosave(editor);
  }

  // Folder panel
  const openFromPanel = async (filePath) => {
    await fileOpenPath(filePath, editor, refreshPreview);
  };

  setupFolderPanel(openFromPanel);
  setupPanelResize();

  // Handle native menu actions — delegates to the same registered handlers
  window.__menuAction = (action) => {
    onAction(action);
  };

  // Handle files opened via macOS "Open With" / Finder file associations.
  // Called from Rust (lib.rs) via eval when the app is already running.
  window.__openFile = (filePath) => {
    fileOpenPath(filePath, editor, refreshPreview).then(() => {
      syncToFile(getCurrentFilePath());
    });
  };

  // Check if the app was launched by opening a .md file (e.g. double-click in Finder).
  // The Rust backend stores the path in managed state; we retrieve it via a Tauri command.
  if (window.__TAURI__) {
    window.__TAURI__.core.invoke('get_opened_file').then((filePath) => {
      if (filePath) {
        window.__openFile(filePath);
      }
    }).catch(() => {});
  }
});
