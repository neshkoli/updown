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

import { setStorageProvider } from './storage/provider.js';
import { createGuestProvider } from './storage/guest-provider.js';
import { createGDriveProvider, initGoogleAuth } from './storage/gdrive-provider.js';
import { setupToolbar, setViewMode, getViewMode, setFileActionHandlers, setViewActionHandlers, setMdCommandHandler, onAction } from './editor-ui.js';
import { setupLivePreview } from './render.js';
import { fileNew, fileSave, getCurrentFilePath, setCurrentFilePath, checkDirty } from './file-ops.js';
import { setupWebDragDrop } from './drag-drop.js';
import { setupAutosave } from './autosave.js';
import { setupFolderPanel, setupPanelResize, toggleFolderPanel, syncToFile, setEmptyStateMessage } from './folder-panel.js';
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
      await fileSave(editor);
      syncToFile(getCurrentFilePath());
    },
    saveAs: () => downloadMarkdown(editor, getCurrentFilePath()),
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

  setupFolderPanel(openFromPanel).then(() => {
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
      setupFolderPanel(openFromPanel);
    } else {
      sessionStorage.removeItem('updown-gdrive-token');
      setStorageProvider(createGuestProvider());
      if (label) label.textContent = 'Sign in';
      btn.title = 'Sign in with Google';
      localStorage.removeItem('updown-last-folder');
      setupFolderPanel(openFromPanel).then(() => {
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
