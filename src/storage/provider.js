/**
 * Storage provider interface for UpDown.
 * Abstracts file/folder operations so the same UI works with local FS (Tauri)
 * or cloud storage (Google Drive).
 *
 * Provider interface:
 * - listDirectory(folderId) -> Promise<[{id, name, isDirectory}]>
 * - readFile(fileId) -> Promise<string>
 * - writeFile(fileId, content) -> Promise<void>
 * - createFile(parentId, name, content) -> Promise<fileId>
 * - getParentFolderId(folderId) -> Promise<folderId|null>
 * - showOpenDialog?() -> Promise<fileId|null>
 * - showSaveDialog?(defaultName) -> Promise<{parentId, name}|null>
 * - getRootFolderId?() -> Promise<folderId>
 */

let storageProvider = null;

/**
 * Set the active storage provider.
 * @param {Object} provider - Provider implementing the interface
 */
export function setStorageProvider(provider) {
  storageProvider = provider;
}

/**
 * Get the active storage provider.
 * @returns {Object|null}
 */
export function getStorageProvider() {
  return storageProvider;
}

/**
 * Check if a storage provider is available and supports the given capability.
 * @param {string} capability - 'read' | 'write' | 'list' | 'dialogs'
 * @returns {boolean}
 */
export function hasStorageCapability(capability) {
  if (!storageProvider) return false;
  switch (capability) {
    case 'read':
      return typeof storageProvider.readFile === 'function';
    case 'write':
      return typeof storageProvider.writeFile === 'function' && typeof storageProvider.createFile === 'function';
    case 'list':
      return typeof storageProvider.listDirectory === 'function';
    case 'dialogs':
      return typeof storageProvider.showOpenDialog === 'function' && typeof storageProvider.showSaveDialog === 'function';
    default:
      return false;
  }
}
