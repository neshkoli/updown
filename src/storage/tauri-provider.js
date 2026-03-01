/**
 * Tauri storage provider.
 * Wraps Tauri FS and dialog APIs for local file system access.
 * Uses path strings as ids (e.g. "/Users/name/folder/file.md").
 */

/**
 * Create the Tauri storage provider.
 * @returns {Object} Provider implementing the storage interface
 */
export function createTauriProvider() {
  const tauri = window.__TAURI__;
  if (!tauri?.fs) return null;

  const { readTextFile, writeTextFile, readDir } = tauri.fs;
  const { open, save } = tauri.dialog;

  return {
    async listDirectory(folderId) {
      try {
        const entries = await readDir(folderId);
        return entries
          .filter((entry) => entry.name)
          .map((entry) => {
            const path = folderId.replace(/\/$/, '') + '/' + entry.name;
            return {
              id: path,
              name: entry.name,
              isDirectory: Boolean(entry.isDirectory),
            };
          })
          .filter((entry) => {
            if (entry.isDirectory) return !entry.name.startsWith('.');
            return /\.(md|markdown)$/i.test(entry.name);
          })
          .sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
      } catch (err) {
        console.error('Failed to read directory:', folderId, err);
        return [];
      }
    },

    async readFile(fileId) {
      return readTextFile(fileId);
    },

    async writeFile(fileId, content) {
      await writeTextFile(fileId, content);
    },

    async createFile(parentId, name, content) {
      const path = parentId.replace(/\/$/, '') + '/' + name;
      await writeTextFile(path, content);
      return path;
    },

    async getFolderPath(folderId) {
      if (!folderId) return '/';
      const homeMatch = folderId.match(/^\/Users\/[^/]+$/);
      if (homeMatch) return '~';
      return folderId.replace(/^\/Users\/[^/]+/, '~');
    },

    async getParentFolderId(folderId) {
      if (!folderId || folderId === '/') return null;
      const parts = folderId.replace(/\/$/, '').split('/');
      parts.pop();
      return parts.join('/') || '/';
    },

    async showOpenDialog() {
      const selected = await open({
        title: 'Open Markdown',
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'All files', extensions: ['*'] },
        ],
        multiple: false,
      });
      return selected || null;
    },

    async showSaveDialog(defaultName) {
      const path = await save({
        title: 'Save Markdown',
        filters: [
          { name: 'Markdown', extensions: ['md', 'markdown'] },
          { name: 'All files', extensions: ['*'] },
        ],
        defaultPath: defaultName || 'untitled.md',
      });
      if (!path) return null;
      const lastSlash = path.lastIndexOf('/');
      const parentId = lastSlash >= 0 ? path.slice(0, lastSlash) || '/' : '/';
      const name = lastSlash >= 0 ? path.slice(lastSlash + 1) : path;
      return { parentId, name, fileId: path };
    },

    async getRootFolderId() {
      try {
        const homeDir = await tauri.core.invoke('plugin:path|resolve_directory', {
          directory: 'Home',
          path: '',
        });
        return homeDir ? homeDir.replace(/\/$/, '') : '/';
      } catch {
        return '/';
      }
    },
  };
}
