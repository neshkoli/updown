/**
 * Folder panel for UpDown.
 * Lists markdown files and sub-folders using the storage provider.
 * Supports navigation via ".." (parent) and folder clicks.
 * Remembers last opened folder in localStorage.
 */

import { getStorageProvider } from './storage/provider.js';

const STORAGE_KEY = 'updown-last-folder';

let currentFolder = null;
let onFileSelect = null; // callback: (fileId) => void

/**
 * Get the last used folder from localStorage, default to root.
 * @returns {string}
 */
function getInitialFolder() {
  return localStorage.getItem(STORAGE_KEY) || '/';
}

/**
 * Save the current folder to localStorage.
 * @param {string} folder
 */
function saveFolder(folder) {
  localStorage.setItem(STORAGE_KEY, folder);
}

/**
 * Read directory entries from the storage provider.
 * Returns { id, name, isDirectory } entries.
 * @param {string} folderId
 * @returns {Promise<Array<{id: string, name: string, isDirectory: boolean}>>}
 */
async function readDirectory(folderId) {
  const provider = getStorageProvider();
  if (!provider?.listDirectory) return [];

  try {
    const entries = await provider.listDirectory(folderId);
    return entries;
  } catch (err) {
    console.error('Failed to read directory:', folderId, err);
    return [];
  }
}

/**
 * Get the parent folder id.
 * @param {string} folderId
 * @returns {Promise<string|null>}
 */
async function getParentFolderId(folderId) {
  const provider = getStorageProvider();
  if (!provider?.getParentFolderId) return null;
  return provider.getParentFolderId(folderId);
}

/**
 * Check if we're at root (no parent).
 * @param {string} folderId
 * @returns {boolean}
 */
function isRoot(folderId) {
  return !folderId || folderId === '/';
}

/**
 * Get display path for the folder (abbreviate home for Tauri paths).
 * @param {string} folderId
 * @returns {string}
 */
function getDisplayPath(folderId) {
  if (!folderId) return '/';
  if (folderId === 'root') return 'My Drive';
  let display = folderId;
  const homeMatch = folderId.match(/^\/Users\/[^/]+/);
  if (homeMatch) {
    display = folderId.replace(homeMatch[0], '~');
  }
  return display || '/';
}

/**
 * Render the folder list into the panel element.
 * @param {HTMLElement} listEl
 * @param {Array} entries
 * @param {string} folderId
 * @param {boolean} hasParent - whether to show ".." entry
 */
function renderList(listEl, entries, folderId, hasParent) {
  listEl.innerHTML = '';

  // ".." entry (go to parent), unless at root
  if (hasParent) {
    const li = document.createElement('div');
    li.className = 'folder-item folder-parent';
    li.textContent = '..';
    li.title = 'Go to parent folder';
    li.dataset.parent = 'true';
    li.addEventListener('click', () => navigateToParent(listEl));
    listEl.appendChild(li);
  }

  for (const entry of entries) {
    const li = document.createElement('div');
    li.className = 'folder-item ' + (entry.isDirectory ? 'folder-dir' : 'folder-file');
    li.textContent = entry.isDirectory ? `📁 ${entry.name}` : entry.name;
    li.title = entry.id;
    li.dataset.id = entry.id;
    li.dataset.isDir = String(entry.isDirectory);

    if (entry.isDirectory) {
      li.addEventListener('click', () => navigateTo(entry.id, listEl));
    } else {
      li.addEventListener('click', () => {
        if (onFileSelect) onFileSelect(entry.id);
        listEl.querySelectorAll('.folder-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
      });
    }

    listEl.appendChild(li);
  }

  if (entries.length === 0 && !hasParent) {
    const empty = document.createElement('div');
    empty.className = 'folder-empty';
    empty.textContent = 'No markdown files';
    listEl.appendChild(empty);
  }
}

/**
 * Navigate to parent folder.
 * @param {HTMLElement} listEl
 */
async function navigateToParent(listEl) {
  const parentId = await getParentFolderId(currentFolder);
  if (parentId !== null) {
    await navigateTo(parentId, listEl);
  }
}

/**
 * Navigate to a folder: read it, render list, save to storage.
 * @param {string} folderId
 * @param {HTMLElement} listEl
 */
async function navigateTo(folderId, listEl) {
  currentFolder = folderId;
  saveFolder(folderId);

  // Update the folder path display
  const pathEl = listEl.parentElement?.querySelector('.folder-path');
  if (pathEl) {
    pathEl.textContent = getDisplayPath(folderId);
    pathEl.title = folderId;
  }

  const entries = await readDirectory(folderId);
  const parentId = await getParentFolderId(folderId);
  const hasParent = parentId !== null && parentId !== undefined;

  renderList(listEl, entries, folderId, hasParent);
}

/**
 * Navigate to the folder containing a specific file (sync on open).
 * @param {string} fileId
 */
export async function syncToFile(fileId) {
  if (!fileId) return;

  const provider = getStorageProvider();
  if (!provider?.getParentFolderId) return;

  const folderId = await provider.getParentFolderId(fileId);
  if (folderId === undefined || folderId === null) return;

  const listEl = document.getElementById('folder-list');
  if (listEl && folderId !== currentFolder) {
    await navigateTo(folderId, listEl);
  }
}

/**
 * Get the current folder id.
 * @returns {string|null}
 */
export function getCurrentFolder() {
  return currentFolder;
}

/**
 * Set a custom empty state message (e.g. "Sign in to browse files" for web guest).
 * @param {HTMLElement} listEl
 * @param {string} message
 */
export function setEmptyStateMessage(listEl, message) {
  const empty = listEl?.querySelector('.folder-empty');
  if (empty) {
    empty.textContent = message;
  }
}

/**
 * Initialize the folder panel.
 * @param {function} fileSelectCallback - called with (fileId) when a file is clicked
 */
export async function setupFolderPanel(fileSelectCallback) {
  onFileSelect = fileSelectCallback;

  const panel = document.getElementById('folder-panel');
  const listEl = document.getElementById('folder-list');
  if (!panel || !listEl) return;

  let initialFolder = getInitialFolder();

  // If provider has getRootFolderId, use it when no saved folder
  const provider = getStorageProvider();
  if (provider?.getRootFolderId && !localStorage.getItem(STORAGE_KEY)) {
    try {
      const root = await provider.getRootFolderId();
      if (root) initialFolder = root;
    } catch {
      // Use default
    }
  }

  await navigateTo(initialFolder, listEl);
}

/**
 * Toggle folder panel visibility.
 */
export function toggleFolderPanel() {
  const panel = document.getElementById('folder-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
}

/**
 * Set up the resize handle for the folder panel.
 */
export function setupPanelResize() {
  const handle = document.getElementById('folder-resize');
  const panel = document.getElementById('folder-panel');
  if (!handle || !panel) return;

  let startX = 0;
  let startWidth = 0;

  function onMouseMove(e) {
    const newWidth = Math.max(120, Math.min(500, startWidth + (e.clientX - startX)));
    panel.style.width = newWidth + 'px';
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
    localStorage.setItem('updown-panel-width', panel.style.width);
  }

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.offsetWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  const savedWidth = localStorage.getItem('updown-panel-width');
  if (savedWidth) {
    panel.style.width = savedWidth;
  }
}
