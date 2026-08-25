/**
 * Shared app bootstrap — wires toolbar, editor, preview, folder panel, and shortcuts.
 */
import {
  setupToolbar,
  setViewMode,
  getViewMode,
  setFileActionHandlers,
  setViewActionHandlers,
  setMdCommandHandler,
  onAction,
} from '../editor-ui.js';
import { setupLivePreview } from '../render.js';
import { fileOpenPath } from '../file-ops.js';
import { setupAutosave } from '../autosave.js';
import {
  setupFolderPanel,
  setupPanelResize,
  toggleFolderPanel,
  syncToFile,
} from '../folder-panel.js';
import { execMdCommand } from '../md-commands.js';
import { setupFindReplace, openFind, openFindReplace } from '../find-replace-ui.js';
import { printFormattedDocument } from '../print.js';
import {
  initSlidesView,
  activateSlidesView,
  hideSlidesViewer,
  onWindowFullscreenChange,
} from '../slides-view.js';
import { showAboutDialog, setupAboutLinkHandler } from './about.js';
import { setupKeyboardShortcuts } from './keyboard.js';
import { isTauri } from '../platform/detect.js';

/**
 * @typedef {Object} BootstrapContext
 * @property {HTMLTextAreaElement|null} editor
 * @property {() => void} refreshPreview
 * @property {(fileId: string, fileName: string) => Promise<void>} openFromPanel
 */

/**
 * @typedef {Object} PlatformConfig
 * @property {Record<string, () => void | Promise<void>>} fileHandlers
 * @property {Record<string, () => void | Promise<void>>} [viewHandlers]
 * @property {(editor: HTMLTextAreaElement|null, refreshPreview: () => void, syncToFile: (id: string|null) => void) => void} setupDragDrop
 * @property {(openFromPanel: (fileId: string, fileName: string) => Promise<void>) => Promise<void>} [setupFolderPanel]
 * @property {(ctx: BootstrapContext) => void | Promise<void>} [onReady]
 */

/**
 * @typedef {Object} PlatformModule
 * @property {(ctx: Pick<BootstrapContext, 'editor' | 'refreshPreview'>) => PlatformConfig} createConfig
 */

/**
 * Show or hide platform-specific toolbar elements.
 */
function configurePlatformUI() {
  document.querySelectorAll('.web-only').forEach((el) => {
    el.classList.toggle('hidden', isTauri());
  });
  document.querySelectorAll('.tauri-only').forEach((el) => {
    el.classList.toggle('hidden', !isTauri());
  });
}

/**
 * @param {PlatformModule} platform
 */
export async function bootstrapApp(platform) {
  setupAboutLinkHandler();
  configurePlatformUI();

  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  let refreshPreview = () => {};

  if (editor && preview) {
    refreshPreview = setupLivePreview(editor, preview);
  }

  initSlidesView();
  window.__onWindowFullscreenChange = onWindowFullscreenChange;

  const openFromPanel = async (fileId, fileName) => {
    await fileOpenPath(fileId, editor, refreshPreview, { displayName: fileName });
  };

  const ctx = { editor, refreshPreview, openFromPanel };
  const config = platform.createConfig({ editor, refreshPreview });

  setFileActionHandlers(config.fileHandlers);

  setViewActionHandlers({
    toggleFolder: toggleFolderPanel,
    viewSource: () => setViewMode(document, 'source'),
    viewPreview: () => setViewMode(document, 'preview'),
    viewSplit: () => setViewMode(document, 'split'),
    activateSlides: () => {
      if (editor) activateSlidesView(editor.value);
    },
    deactivateSlides: () => hideSlidesViewer(),
    find: openFind,
    findReplace: openFindReplace,
    print: () => printFormattedDocument(document, { refreshPreview }),
    about: showAboutDialog,
    ...config.viewHandlers,
  });

  if (editor) {
    setMdCommandHandler((command) => execMdCommand(editor, command));
  }

  setupToolbar(document);
  setViewMode(document, getViewMode() || 'preview');

  config.setupDragDrop(editor, refreshPreview, syncToFile);

  if (editor) {
    setupAutosave(editor);
  }

  const setupFolder = config.setupFolderPanel ?? ((open) =>
    setupFolderPanel(open).then(() => {
      const panel = document.getElementById('folder-panel');
      if (panel) panel.classList.add('hidden');
    })
  );

  await setupFolder(openFromPanel);
  setupPanelResize();
  setupFindReplace(document, () => document.getElementById('editor'));
  setupKeyboardShortcuts(refreshPreview);

  window.__menuAction = (action) => {
    onAction(action);
  };

  if (config.onReady) {
    await config.onReady(ctx);
  }
}

/**
 * Helper for handlers that sync the folder panel after file operations.
 * @param {() => void | Promise<void>} action
 */
export async function withFolderSync(action) {
  await action();
  const { getCurrentFilePath } = await import('../file-ops.js');
  syncToFile(getCurrentFilePath());
}
