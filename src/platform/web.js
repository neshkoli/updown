/**
 * Web platform initialization (guest mode + Google Drive).
 */
import { setStorageProvider, getStorageProvider } from '../storage/provider.js';
import { createGuestProvider } from '../storage/guest-provider.js';
import { createGDriveProvider, initGoogleAuth } from '../storage/gdrive-provider.js';
import {
  fileNew,
  fileSave,
  fileOpenPath,
  fileOpenPdfFile,
  getCurrentFilePath,
  setCurrentFilePath,
  setCurrentFileName,
  checkDirty,
  markFileSaved,
  resetToMarkdownView,
} from '../file-ops.js';
import { setupWebDragDrop } from '../drag-drop.js';
import {
  setupFolderPanel,
  setEmptyStateMessage,
  getCurrentFolder,
  refreshFolder,
  navigateToFolder,
  syncToFile,
} from '../folder-panel.js';
import { bootstrapApp } from '../app/bootstrap.js';
import { showAboutDialog } from '../app/about.js';
import { showFileNameDialog } from '../app/modal.js';

setStorageProvider(createGuestProvider());

/**
 * @param {{ editor: HTMLTextAreaElement|null, refreshPreview: () => void }} ctx
 */
function createConfig({ editor, refreshPreview }) {
  return {
    fileHandlers: {
      new: () => fileNew(editor, refreshPreview),
      open: () => openLocalFile(editor, refreshPreview),
      save: async () => {
        const provider = getStorageProvider();
        if (provider?.createFile) {
          await driveFileSave(editor);
        } else {
          downloadMarkdown(editor, getCurrentFilePath());
        }
      },
      saveAs: async () => {
        const provider = getStorageProvider();
        if (provider?.createFile) {
          await driveFileSaveAs(editor);
        } else {
          downloadMarkdown(editor, getCurrentFilePath());
        }
      },
      refresh: async () => {
        const { fileRefresh } = await import('../file-ops.js');
        await fileRefresh(editor, refreshPreview);
        await syncToFile(getCurrentFilePath());
      },
    },
    viewHandlers: {
      installQuickLook: () => {},
    },
    setupDragDrop: (ed, refresh) => {
      setupWebDragDrop(ed, refresh, (filename) => {
        setCurrentFilePath(filename);
        checkDirty(ed.value);
      });
    },
    setupFolderPanel: (openFromPanel) =>
      setupFolderPanel(openFromPanel, () => createNewFolder()).then(() => {
        setEmptyStateMessage(document.getElementById('folder-list'), 'Sign in to browse files');
        const panel = document.getElementById('folder-panel');
        if (panel) panel.classList.add('hidden');
      }),
    onReady: async ({ editor: ed, refreshPreview: refresh, openFromPanel }) => {
      document.getElementById('app-icon-group')?.addEventListener('click', showAboutDialog);
      setupAuthButton(ed, refresh, openFromPanel);
    },
  };
}

export async function initPlatform() {
  await bootstrapApp({ createConfig });
}

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

function openLocalFile(editor, refreshPreview) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.md,.markdown,.pdf,text/markdown,text/x-markdown,application/pdf';
  input.style.display = 'none';
  document.body.appendChild(input);

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    document.body.removeChild(input);
    if (!file) return;

    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      fileOpenPdfFile(file, editor, refreshPreview);
    } else {
      resetToMarkdownView();
      const reader = new FileReader();
      reader.onload = (e) => {
        editor.value = e.target.result;
        setCurrentFilePath(file.name);
        checkDirty(editor.value);
        refreshPreview();
      };
      reader.onerror = () => console.error('Failed to read file:', file.name);
      reader.readAsText(file);
      return;
    }

    setCurrentFilePath(file.name);
    checkDirty(editor.value);
  });

  input.click();
}

async function driveFileSave(editor) {
  const currentPath = getCurrentFilePath();
  if (currentPath) {
    await fileSave(editor);
    await refreshFolder();
  } else {
    await driveFileSaveAs(editor);
  }
}

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
    setCurrentFileName(finalName);
    markFileSaved(editor.value);
    await syncToFile(fileId);
  } catch (err) {
    alert(`Failed to save: ${err.message || err}`);
  }
}

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
