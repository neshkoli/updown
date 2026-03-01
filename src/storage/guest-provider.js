/**
 * Guest storage provider for unauthenticated web users.
 * Allows edit + preview without save. No file listing, no open/save dialogs.
 */

/**
 * Create the guest storage provider.
 * @returns {Object} Provider with no-op / empty implementations
 */
export function createGuestProvider() {
  return {
    async listDirectory() {
      return [];
    },

    async readFile() {
      throw new Error('Sign in to open files');
    },

    async writeFile() {
      throw new Error('Sign in to save files');
    },

    async createFile() {
      throw new Error('Sign in to save files');
    },

    async createFolder() {
      throw new Error('Sign in to create folders');
    },

    async getFolderName() {
      return '/';
    },

    async getParentFolderId() {
      return null;
    },

    async showOpenDialog() {
      return null;
    },

    async showSaveDialog() {
      return null;
    },

    async getRootFolderId() {
      return '/';
    },
  };
}
