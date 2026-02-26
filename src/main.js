/**
 * UpDown — Tauri entry point.
 * Wires toolbar, editor, preview, file ops, drag-drop, autosave, and folder panel.
 */
import { setStorageProvider } from './storage/provider.js';
import { createTauriProvider } from './storage/tauri-provider.js';
import { setupToolbar, setViewMode, getViewMode, setFileActionHandlers, setViewActionHandlers, setMdCommandHandler, onAction } from './editor-ui.js';
import { setupLivePreview } from './render.js';
import { fileNew, fileOpen, fileOpenPath, fileRefresh, fileSave, fileSaveAs, getCurrentFilePath } from './file-ops.js';
import { setupDragDrop } from './drag-drop.js';
import { setupAutosave } from './autosave.js';
import { setupFolderPanel, setupPanelResize, toggleFolderPanel, syncToFile } from './folder-panel.js';
import { execMdCommand } from './md-commands.js';

window.addEventListener('DOMContentLoaded', () => {
  // Set storage provider for Tauri (local file system)
  const tauriProvider = createTauriProvider();
  if (tauriProvider) {
    setStorageProvider(tauriProvider);
  }
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
    refresh: async () => {
      await fileRefresh(editor, refreshPreview);
      syncToFile(getCurrentFilePath());
    },
  });

  // Wire view actions
  setViewActionHandlers({
    toggleFolder: toggleFolderPanel,
    viewSource: () => setViewMode(document, 'source'),
    viewPreview: () => setViewMode(document, 'preview'),
    viewSplit: () => setViewMode(document, 'split'),
    installQuickLook: installQuickLookPlugin,
    about: showAboutDialog,
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

    // First-run: offer to install the Quick Look plugin for Markdown
    offerQuickLookInstall();
  }
});

/**
 * Show the custom About dialog.
 */
function showAboutDialog() {
  const overlay = document.getElementById('about-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  // Close on clicking the overlay background (not the dialog itself)
  function onOverlayClick(e) {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    }
  }

  // Close on Escape key
  function onEsc(e) {
    if (e.key === 'Escape') {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    }
  }

  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onEsc);
}

// Handle clicks on the GitHub link in the About dialog
document.addEventListener('click', (e) => {
  const link = e.target.closest('.about-link');
  if (!link) return;
  e.preventDefault();
  const href = link.getAttribute('href');
  if (href && window.__TAURI__?.opener?.openUrl) {
    window.__TAURI__.opener.openUrl(href);
  } else if (href) {
    window.open(href, '_blank');
  }
});

/**
 * Install the Quick Look plugin for Markdown preview in Finder (Space key).
 * Called from the menu action or the first-run prompt.
 */
async function installQuickLookPlugin() {
  if (!window.__TAURI__) return;
  try {
    const result = await window.__TAURI__.core.invoke('install_quicklook_plugin');
    await window.__TAURI__.dialog.message(result, { title: 'Quick Look', kind: 'info' });
  } catch (err) {
    await window.__TAURI__.dialog.message(
      'Failed to install Quick Look plugin:\n' + err,
      { title: 'Quick Look', kind: 'error' }
    );
  }
}

/**
 * On first run, offer to install the Quick Look plugin.
 * Uses localStorage to remember that the offer was made.
 */
async function offerQuickLookInstall() {
  if (!window.__TAURI__) return;
  if (localStorage.getItem('ql_plugin_offered')) return;

  // Mark as offered so we only ask once
  localStorage.setItem('ql_plugin_offered', '1');

  try {
    const yes = await window.__TAURI__.dialog.confirm(
      'Would you like to install the Quick Look plugin?\n\n' +
      'This lets you preview Markdown files by pressing Space in Finder.',
      { title: 'Quick Look for Markdown', kind: 'info', okLabel: 'Install', cancelLabel: 'Not Now' }
    );
    if (yes) {
      await installQuickLookPlugin();
    }
  } catch {
    // Dialog was cancelled or errored — that's fine
  }
}
