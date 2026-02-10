/**
 * Folder panel for UpDown.
 * Lists markdown files and sub-folders in the current directory.
 * Supports navigation via ".." (parent) and folder clicks.
 * Remembers last opened folder in localStorage.
 */

const STORAGE_KEY = 'updown-last-folder';

let currentFolder = null;
let onFileSelect = null; // callback: (filePath) => void

/**
 * Get the last used folder from localStorage, default to root.
 * The Tauri home-dir API in setupFolderPanel provides the real fallback.
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
 * Get parent directory of a path.
 * @param {string} path
 * @returns {string}
 */
function parentDir(path) {
  if (!path || path === '/') return '/';
  const parts = path.replace(/\/$/, '').split('/');
  parts.pop();
  return parts.join('/') || '/';
}

/**
 * Read directory entries from Tauri FS.
 * Returns { name, isDirectory, isFile } entries.
 * @param {string} dirPath
 * @returns {Promise<Array<{name: string, isDirectory: boolean, path: string}>>}
 */
async function readDirectory(dirPath) {
  if (!window.__TAURI__) return [];
  const { readDir } = window.__TAURI__.fs;

  try {
    const entries = await readDir(dirPath);
    return entries
      .filter(entry => entry.name) // skip entries with no name
      .map(entry => ({
        name: entry.name,
        isDirectory: Boolean(entry.isDirectory),
        path: dirPath.replace(/\/$/, '') + '/' + entry.name,
      }))
      .filter(entry => {
        // Show only: folders, .md/.markdown files
        if (entry.isDirectory) return !entry.name.startsWith('.');
        return /\.(md|markdown)$/i.test(entry.name);
      })
      .sort((a, b) => {
        // Directories first, then files; alphabetical within each group
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
  } catch (err) {
    console.error('Failed to read directory:', dirPath, err);
    return [];
  }
}

/**
 * Render the folder list into the panel element.
 * @param {HTMLElement} listEl
 * @param {Array} entries
 * @param {string} folderPath
 */
function renderList(listEl, entries, folderPath) {
  listEl.innerHTML = '';

  // ".." entry (go to parent), unless at root
  if (folderPath !== '/') {
    const li = document.createElement('div');
    li.className = 'folder-item folder-parent';
    li.textContent = '..';
    li.title = 'Go to parent folder';
    li.addEventListener('click', () => navigateTo(parentDir(folderPath), listEl));
    listEl.appendChild(li);
  }

  for (const entry of entries) {
    const li = document.createElement('div');
    li.className = 'folder-item ' + (entry.isDirectory ? 'folder-dir' : 'folder-file');
    li.textContent = entry.isDirectory ? `📁 ${entry.name}` : entry.name;
    li.title = entry.path;

    if (entry.isDirectory) {
      li.addEventListener('click', () => navigateTo(entry.path, listEl));
    } else {
      li.addEventListener('click', () => {
        if (onFileSelect) onFileSelect(entry.path);
        // Highlight selected file
        listEl.querySelectorAll('.folder-item').forEach(el => el.classList.remove('selected'));
        li.classList.add('selected');
      });
    }

    listEl.appendChild(li);
  }

  if (entries.length === 0 && folderPath === '/') {
    const empty = document.createElement('div');
    empty.className = 'folder-empty';
    empty.textContent = 'No markdown files';
    listEl.appendChild(empty);
  }
}

/**
 * Navigate to a folder: read it, render list, save to storage.
 * @param {string} folderPath
 * @param {HTMLElement} listEl
 */
async function navigateTo(folderPath, listEl) {
  currentFolder = folderPath;
  saveFolder(folderPath);

  // Update the folder path display
  const pathEl = listEl.parentElement?.querySelector('.folder-path');
  if (pathEl) {
    // Show abbreviated path: replace home prefix with ~
    let display = folderPath;
    const homeMatch = folderPath.match(/^\/Users\/[^/]+/);
    if (homeMatch) {
      display = folderPath.replace(homeMatch[0], '~');
    }
    pathEl.textContent = display || '/';
    pathEl.title = folderPath;
  }

  const entries = await readDirectory(folderPath);
  renderList(listEl, entries, folderPath);
}

/**
 * Navigate to the folder containing a specific file (sync on open).
 * @param {string} filePath
 */
export function syncToFile(filePath) {
  if (!filePath) return;
  const folder = parentDir(filePath);
  const listEl = document.getElementById('folder-list');
  if (listEl && folder !== currentFolder) {
    navigateTo(folder, listEl);
  }
}

/**
 * Get the current folder path.
 * @returns {string|null}
 */
export function getCurrentFolder() {
  return currentFolder;
}

/**
 * Initialize the folder panel.
 * @param {function} fileSelectCallback - called with (filePath) when a file is clicked
 */
export async function setupFolderPanel(fileSelectCallback) {
  onFileSelect = fileSelectCallback;

  const panel = document.getElementById('folder-panel');
  const listEl = document.getElementById('folder-list');
  if (!panel || !listEl) return;

  // Resolve the initial folder
  let initialFolder = getInitialFolder();

  // If we're in Tauri, use the home dir API for a reliable path
  if (window.__TAURI__) {
    try {
      const homeDir = await window.__TAURI__.core.invoke('plugin:path|resolve_directory', {
        directory: 'Home',
        path: '',
      });
      if (homeDir && !localStorage.getItem(STORAGE_KEY)) {
        initialFolder = homeDir;
      }
    } catch {
      // Fallback: try path API
      try {
        const { homeDir } = window.__TAURI__.path;
        if (homeDir) {
          const home = await homeDir();
          if (home && !localStorage.getItem(STORAGE_KEY)) {
            initialFolder = home.replace(/\/$/, '');
          }
        }
      } catch {
        // Use the guessed path
      }
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
    // Save width preference
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

  // Restore saved width
  const savedWidth = localStorage.getItem('updown-panel-width');
  if (savedWidth) {
    panel.style.width = savedWidth;
  }
}
