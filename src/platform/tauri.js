/**
 * Tauri desktop platform initialization.
 */
import { setStorageProvider } from '../storage/provider.js';
import { createTauriProvider } from '../storage/tauri-provider.js';
import {
  fileNew,
  fileOpen,
  fileOpenPath,
  fileRefresh,
  fileSave,
  fileSaveAs,
  getCurrentFilePath,
} from '../file-ops.js';
import { setupDragDrop } from '../drag-drop.js';
import { bootstrapApp, withFolderSync } from '../app/bootstrap.js';
import { syncToFile } from '../folder-panel.js';

/**
 * @param {{ editor: HTMLTextAreaElement|null, refreshPreview: () => void }} ctx
 */
function createConfig({ editor, refreshPreview }) {
  return {
    fileHandlers: {
      new: () => fileNew(editor, refreshPreview),
      open: async () => {
        await withFolderSync(() => fileOpen(editor, refreshPreview));
      },
      save: async () => {
        await withFolderSync(() => fileSave(editor));
      },
      saveAs: async () => {
        await withFolderSync(() => fileSaveAs(editor));
      },
      refresh: async () => {
        await withFolderSync(() => fileRefresh(editor, refreshPreview));
      },
    },
    viewHandlers: {
      installQuickLook: () => installQuickLookPlugin(),
    },
    setupDragDrop: (ed, refresh, syncToFile) => {
      setupDragDrop(ed, refresh, fileOpenPath, syncToFile);
    },
    onReady: async ({ editor: ed, refreshPreview: refresh }) => {
      window.__openFile = (filePath) => {
        fileOpenPath(filePath, ed, refresh).then(() => {
          syncToFile(getCurrentFilePath());
        });
      };

      if (window.__TAURI__) {
        window.__TAURI__.core.invoke('get_opened_file').then((filePath) => {
          if (filePath) {
            window.__openFile(filePath);
          }
        }).catch(() => {});

        offerQuickLookInstall();
      }
    },
  };
}

export async function initPlatform() {
  const tauriProvider = createTauriProvider();
  if (tauriProvider) {
    setStorageProvider(tauriProvider);
  }

  await bootstrapApp({
    createConfig,
  });
}

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

async function offerQuickLookInstall() {
  if (!window.__TAURI__) return;
  if (localStorage.getItem('ql_plugin_offered')) return;

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
    // Dialog was cancelled or errored
  }
}
