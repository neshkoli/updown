/**
 * UpDown — Web entry point.
 * Wires toolbar, editor, preview, file ops, autosave, and folder panel.
 * Uses guest or Google Drive provider based on auth state.
 */

// Set up markdown-it and mermaid globals before any module that uses them
import markdownit from 'markdown-it';
import mermaid from 'mermaid';
window.markdownit = markdownit;
window.mermaid = mermaid;

import { setStorageProvider, getStorageProvider } from './storage/provider.js';
import { createGuestProvider } from './storage/guest-provider.js';
import { createGDriveProvider, initGoogleAuth } from './storage/gdrive-provider.js';
import { setupToolbar, setViewMode, getViewMode, setFileActionHandlers, setViewActionHandlers, setMdCommandHandler, onAction } from './editor-ui.js';
import { setupLivePreview } from './render.js';
import { fileNew, fileSave, getCurrentFilePath, setCurrentFilePath, checkDirty, markFileSaved } from './file-ops.js';
import { setupWebDragDrop } from './drag-drop.js';
import { setupAutosave } from './autosave.js';
import { setupFolderPanel, setupPanelResize, toggleFolderPanel, syncToFile, setEmptyStateMessage, getCurrentFolder, refreshFolder, navigateToFolder } from './folder-panel.js';
import { execMdCommand } from './md-commands.js';

// Start with guest provider (edit + preview, no save)
setStorageProvider(createGuestProvider());

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
    open: () => openLocalFile(editor, refreshPreview),
    save: async () => {
      const provider = getStorageProvider();
      if (provider?.createFile) {
        // Signed in to Drive: save to Drive (ask for name if new file)
        await driveFileSave(editor);
      } else {
        // Guest: download
        downloadMarkdown(editor, getCurrentFilePath());
      }
    },
    saveAs: async () => {
      const provider = getStorageProvider();
      if (provider?.createFile) {
        // Signed in to Drive: save as new Drive file
        await driveFileSaveAs(editor);
      } else {
        // Guest: download
        downloadMarkdown(editor, getCurrentFilePath());
      }
    },
  });

  // Wire view actions
  setViewActionHandlers({
    toggleFolder: toggleFolderPanel,
    viewSource: () => setViewMode(document, 'source'),
    viewPreview: () => setViewMode(document, 'preview'),
    viewSplit: () => setViewMode(document, 'split'),
    installQuickLook: () => {}, // No-op on web
    about: showAboutDialog,
  });

  // Wire markdown formatting commands
  setMdCommandHandler((command) => execMdCommand(editor, command));

  setupToolbar(document);
  setViewMode(document, getViewMode() || 'split');

  // Autosave on edit (1.5s debounce)
  if (editor) {
    setupAutosave(editor);
  }

  // Folder panel
  const openFromPanel = async (fileId) => {
    await fileOpenPath(fileId, editor, refreshPreview);
  };

  setupFolderPanel(openFromPanel, () => createNewFolder()).then(() => {
    setEmptyStateMessage(document.getElementById('folder-list'), 'Sign in to browse files');
  });
  setupPanelResize();

  // HTML5 drag-and-drop to open local .md files
  setupWebDragDrop(editor, refreshPreview, (filename) => {
    setCurrentFilePath(filename);
    checkDirty(editor.value);
  });

  // App icon → About dialog
  document.getElementById('app-icon-group')?.addEventListener('click', showAboutDialog);

  // Sign-in / Sign-out button
  setupAuthButton(editor, refreshPreview, openFromPanel);

  // Handle menu actions (e.g. from future web menu)
  window.__menuAction = (action) => {
    onAction(action);
  };
});

function setupAuthButton(editor, refreshPreview, openFromPanel) {
  const btn = document.getElementById('sign-in-btn');
  const label = btn?.querySelector('.auth-label');
  if (!btn) return;

  let accessToken = sessionStorage.getItem('updown-gdrive-token');

  function setSignedIn(token) {
    accessToken = token;
    if (token) {
      sessionStorage.setItem('updown-gdrive-token', token);
      setStorageProvider(createGDriveProvider(token));
      if (label) label.textContent = 'Sign out';
      btn.title = 'Sign out';
      localStorage.removeItem('updown-last-folder');
      setupFolderPanel(openFromPanel, () => createNewFolder());
    } else {
      sessionStorage.removeItem('updown-gdrive-token');
      setStorageProvider(createGuestProvider());
      if (label) label.textContent = 'Sign in';
      btn.title = 'Sign in with Google';
      localStorage.removeItem('updown-last-folder');
      setupFolderPanel(openFromPanel, () => createNewFolder()).then(() => {
        setEmptyStateMessage(document.getElementById('folder-list'), 'Sign in to browse files');
      });
    }
  }

  if (accessToken) {
    setSignedIn(accessToken);
  }

  btn.addEventListener('click', () => {
    if (accessToken) {
      setSignedIn(null);
    } else {
      initGoogleAuth(
        (token) => setSignedIn(token),
        (err) => alert(err.message || 'Sign in failed')
      );
    }
  });
}

function showAboutDialog() {
  const overlay = document.getElementById('about-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  function onOverlayClick(e) {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    }
  }

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
  if (href) {
    window.open(href, '_blank');
  }
});

/**
 * Open a local file from disk using a hidden <input type="file"> picker.
 * Reads the content and loads it into the editor.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 */
function openLocalFile(editor, refreshPreview) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,text/markdown,text/x-markdown';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      editor.value = e.target.result;
      setCurrentFilePath(file.name);
      checkDirty(editor.value);
      refreshPreview();
    };
    reader.onerror = () => console.error('Failed to read file:', file.name);
    reader.readAsText(file);
  });

  input.click();
}

/**
 * Show a modal dialog asking the user for a name.
 * Returns the entered name, or null if cancelled.
 * @param {string} [defaultName]
 * @param {string} [title]
 * @param {string} [okLabel]
 * @returns {Promise<string|null>}
 */
function showFileNameDialog(defaultName = 'untitled.md', title = 'Save to Google Drive', okLabel = 'Save') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-dialog">
        <h3 class="modal-title">${title}</h3>
        <input type="text" class="modal-input" value="${defaultName.replace(/"/g, '&quot;')}" placeholder="name">
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel">Cancel</button>
          <button class="modal-btn modal-btn-ok">${okLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.modal-input');
    // Pre-select the name portion without the .md extension
    setTimeout(() => {
      input.focus();
      const dotIdx = input.value.lastIndexOf('.');
      input.setSelectionRange(0, dotIdx > 0 ? dotIdx : input.value.length);
    }, 0);

    const finish = (value) => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    overlay.querySelector('.modal-btn-ok').addEventListener('click', () => {
      const name = input.value.trim();
      finish(name || null);
    });
    overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const name = input.value.trim(); finish(name || null); }
      if (e.key === 'Escape') finish(null);
    });
  });
}

/**
 * Save the current editor content to Google Drive.
 * If the file already has a Drive ID, overwrites it.
 * If new, asks for a filename and creates in the current folder.
 * @param {HTMLTextAreaElement} editor
 */
async function driveFileSave(editor) {
  const currentPath = getCurrentFilePath();
  if (currentPath) {
    await fileSave(editor);
    await refreshFolder();
  } else {
    await driveFileSaveAs(editor);
  }
}

/**
 * Save the editor content as a new file in Google Drive.
 * Always prompts for a filename.
 * @param {HTMLTextAreaElement} editor
 */
async function driveFileSaveAs(editor) {
  const provider = getStorageProvider();
  if (!provider?.createFile) return;

  const currentPath = getCurrentFilePath();
  const baseName = currentPath
    ? currentPath.replace(/^.*[\\/]/, '')
    : 'untitled.md';
  const defaultName = baseName.endsWith('.md') || baseName.endsWith('.markdown')
    ? baseName : baseName + '.md';

  const name = await showFileNameDialog(defaultName);
  if (!name) return;

  const finalName = name.endsWith('.md') || name.endsWith('.markdown') ? name : name + '.md';
  const parentId = getCurrentFolder() || await provider.getRootFolderId();

  try {
    const fileId = await provider.createFile(parentId, finalName, editor.value);
    setCurrentFilePath(fileId);
    markFileSaved(editor.value);
    await syncToFile(fileId);
  } catch (err) {
    alert(`Failed to save: ${err.message || err}`);
  }
}

/**
 * Prompt for a folder name and create it in the current folder on Google Drive.
 */
async function createNewFolder() {
  const provider = getStorageProvider();
  if (!provider?.createFolder) return;

  const name = await showFileNameDialog('New Folder', 'New Folder', 'Create');
  if (!name) return;

  const parentId = getCurrentFolder() || await provider.getRootFolderId();
  try {
    const folderId = await provider.createFolder(parentId, name);
    await navigateToFolder(folderId);
  } catch (err) {
    alert(`Failed to create folder: ${err.message || err}`);
  }
}

/**
 * Download editor content as a .md file via the browser download API.
 * @param {HTMLTextAreaElement} editor
 * @param {string|null} currentFileId - used to derive a default filename
 */
function downloadMarkdown(editor, currentFileId) {
  const content = editor.value;
  let filename = 'untitled.md';
  if (currentFileId) {
    const parts = currentFileId.replace(/\\/g, '/').split('/');
    const last = parts[parts.length - 1];
    if (last) filename = last.endsWith('.md') || last.endsWith('.markdown') ? last : last + '.md';
  }

  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
