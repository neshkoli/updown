/**
 * Google Drive storage provider.
 * Uses Drive API v3 with OAuth access token from Google Identity Services.
 *
 * Requires: Google Cloud project with Drive API enabled, OAuth client ID.
 * Set window.__UPDOWN_GOOGLE_CLIENT_ID__ or import.meta.env.VITE_GOOGLE_CLIENT_ID
 */

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const SCOPES = 'https://www.googleapis.com/auth/drive';

function getClientId() {
  return window.__UPDOWN_GOOGLE_CLIENT_ID__ ||
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) ||
    '';
}

/**
 * Create the Google Drive storage provider.
 * @param {string} accessToken - OAuth access token for Drive API
 * @returns {Object} Provider implementing the storage interface
 */
export function createGDriveProvider(accessToken) {
  const rootId = 'root';

  async function api(path, options = {}) {
    const url = path.startsWith('http') ? path : DRIVE_API + path;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || `Drive API error: ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async function apiBinary(path, options = {}) {
    const url = path.startsWith('http') ? path : DRIVE_API + path;
    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });
    if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
    return res.text();
  }

  return {
    async listDirectory(folderId) {
      const id = folderId || rootId;
      const q = `'${id}' in parents and trashed=false`;
      const data = await api(`?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType)&orderBy=name`);
      const files = data.files || [];

      return files
        .map((f) => ({
          id: f.id,
          name: f.name,
          isDirectory: f.mimeType === 'application/vnd.google-apps.folder',
        }))
        .filter((f) => {
          if (f.isDirectory) return !f.name.startsWith('.');
          return /\.(md|markdown)$/i.test(f.name);
        })
        .sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
    },

    async readFile(fileId) {
      return apiBinary(`/${fileId}?alt=media`);
    },

    async writeFile(fileId, content) {
      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      const body =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify({ mimeType: 'text/markdown' }) +
        delimiter +
        'Content-Type: text/markdown\r\n\r\n' +
        content +
        closeDelimiter;

      const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      if (!res.ok) throw new Error(`Failed to save: ${res.status}`);
    },

    async createFile(parentId, name, content) {
      const metadata = {
        name,
        mimeType: 'text/markdown',
        parents: [parentId || rootId],
      };

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelimiter = `\r\n--${boundary}--`;
      const body =
        delimiter +
        'Content-Type: application/json\r\n\r\n' +
        JSON.stringify(metadata) +
        delimiter +
        'Content-Type: text/markdown\r\n\r\n' +
        content +
        closeDelimiter;

      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      });
      if (!res.ok) throw new Error(`Failed to create file: ${res.status}`);
      const data = await res.json();
      return data.id;
    },

    async createFolder(parentId, name) {
      const res = await fetch(`${DRIVE_API}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId || rootId],
        }),
      });
      if (!res.ok) throw new Error(`Failed to create folder: ${res.status}`);
      const data = await res.json();
      return data.id;
    },

    async getFolderPath(folderId) {
      if (!folderId || folderId === rootId) return 'My Drive';
      const names = [];
      let current = folderId;
      const MAX_DEPTH = 10;
      let depth = 0;
      while (current && current !== rootId && depth < MAX_DEPTH) {
        const data = await api(`/${current}?fields=name,parents`);
        names.unshift(data.name || current);
        current = data.parents?.[0] || null;
        depth++;
      }
      return 'My Drive / ' + names.join(' / ');
    },

    async getParentFolderId(fileId) {
      if (!fileId || fileId === rootId) return null;
      const data = await api(`/${fileId}?fields=parents`);
      const parents = data.parents || [];
      return parents[0] || null;
    },

    async showOpenDialog() {
      return null;
    },

    async showSaveDialog(defaultName) {
      return null;
    },

    async getRootFolderId() {
      return rootId;
    },
  };
}

/**
 * Initialize Google Sign-In and get access token for Drive.
 * Loads GSI script if not already loaded.
 * @param {function} onToken - callback(accessToken) when token is received
 * @param {function} onError - callback(error) on failure
 */
export function initGoogleAuth(onToken, onError) {
  const clientId = getClientId();
  if (!clientId) {
    onError(new Error('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID or window.__UPDOWN_GOOGLE_CLIENT_ID__'));
    return;
  }

  function loadScript() {
    return new Promise((resolve) => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  loadScript().then(() => {
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (response) => {
        if (response.error) {
          onError(new Error(response.error));
          return;
        }
        onToken(response.access_token);
      },
    });
    tokenClient.requestAccessToken();
  }).catch(onError);
}
