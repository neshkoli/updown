/**
 * UpDown - Tauri entry point.
 */
import { setupToolbar, setViewMode, getViewMode, setFileActionHandlers, setViewActionHandlers, setMdCommandHandler } from './editor-ui.js';
import { setupLivePreview } from './render.js';
import { fileNew, fileOpen, fileOpenPath, fileSave, fileSaveAs, getCurrentFilePath } from './file-ops.js';
import { setupDragDrop } from './drag-drop.js';
import { setupAutosave } from './autosave.js';
import { setupFolderPanel, setupPanelResize, toggleFolderPanel, syncToFile } from './folder-panel.js';
import { execMdCommand } from './md-commands.js';

// Build a shim that matches what editor-ui.js expects for the exit action.
const appShim = {
  app: {
    exit() {
      if (window.__TAURI__) {
        window.__TAURI__.core.invoke('plugin:process|exit', { exitCode: 0 });
      } else {
        window.close();
      }
    }
  }
};

window.addEventListener('DOMContentLoaded', () => {
  setupToolbar(document, appShim);
  setViewMode(document, getViewMode() || 'split');

  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  let refreshPreview = () => {};

  if (editor && preview) {
    refreshPreview = setupLivePreview(editor, preview);
  }

  // Wire file menu actions to file-ops module
  setFileActionHandlers({
    new: () => fileNew(editor, refreshPreview),
    open: async () => {
      await fileOpen(editor, refreshPreview);
      syncToFile(getCurrentFilePath());
    },
    save: () => fileSave(editor),
    saveAs: () => fileSaveAs(editor),
  });

  // Wire view menu custom actions
  setViewActionHandlers({
    toggleFolder: toggleFolderPanel,
  });

  // Wire markdown formatting commands
  setMdCommandHandler((command) => execMdCommand(editor, command));

  // Phase 6: drag-and-drop to open files (sync folder panel after open)
  setupDragDrop(editor, refreshPreview, fileOpenPath, syncToFile);

  // Phase 7: autosave on edit (1.5s debounce)
  if (editor) {
    setupAutosave(editor);
  }

  // Phase 8-10: folder panel
  const openFromPanel = async (filePath) => {
    await fileOpenPath(filePath, editor, refreshPreview);
  };

  setupFolderPanel(openFromPanel);
  setupPanelResize();
});
