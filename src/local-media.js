/**
 * Resolve markdown-relative image paths so the webview can load them.
 * Relative src like ./shot.png is otherwise resolved against the app origin,
 * not the open document on disk.
 */

function isFilesystemPath(fileId) {
  if (!fileId || typeof fileId !== 'string') return false;
  return (
    fileId.includes('/') ||
    fileId.includes('\\') ||
    /^[A-Za-z]:[\\/]/.test(fileId)
  );
}

function dirname(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  const i = normalized.lastIndexOf('/');
  if (i <= 0) return /^[A-Za-z]:/.test(normalized) ? normalized.slice(0, 2) : '/';
  return normalized.slice(0, i);
}

function decodePath(raw) {
  const withoutQuery = raw.split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(withoutQuery);
  } catch {
    return withoutQuery;
  }
}

function joinFromMarkdown(markdownFilePath, relativePath) {
  const base = dirname(markdownFilePath);
  const windows = /^[A-Za-z]:/.test(base) || /^[A-Za-z]:/.test(markdownFilePath);
  const parts = [];
  for (const seg of [...base.split('/'), ...relativePath.replace(/\\/g, '/').split('/')]) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  if (windows) return parts.join('/');
  return '/' + parts.join('/');
}

/**
 * @param {string|null} markdownFilePath
 * @param {string} src
 * @returns {string|null} absolute filesystem path, or null if not a local file
 */
export function resolveLocalMediaPath(markdownFilePath, src) {
  if (!src || typeof src !== 'string') return null;
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^file:/i.test(trimmed)) {
    return null;
  }
  if (!isFilesystemPath(markdownFilePath)) return null;

  if (/^file:/i.test(trimmed)) {
    let path = decodePath(trimmed.replace(/^file:\/\//i, ''));
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
    return path;
  }

  const decoded = decodePath(trimmed);
  if (decoded.startsWith('/') || /^[A-Za-z]:[\\/]/.test(decoded)) {
    return decoded.replace(/\\/g, '/');
  }

  return joinFromMarkdown(markdownFilePath, decoded);
}

/**
 * Convert an absolute local path to a URL the webview can load (Tauri asset protocol).
 * @param {string} filePath
 * @returns {string|null}
 */
export function convertLocalFileToSrc(filePath) {
  const internals = window.__TAURI_INTERNALS__;
  if (typeof internals?.convertFileSrc === 'function') {
    return internals.convertFileSrc(filePath, 'asset');
  }
  const convert = window.__TAURI__?.core?.convertFileSrc;
  if (typeof convert === 'function') {
    return convert(filePath, 'asset');
  }
  return null;
}

/**
 * @param {string|null} markdownFilePath
 * @param {string} src
 * @returns {string} URL suitable for img src / CSS url(), or the original src
 */
export function toLoadableMediaUrl(markdownFilePath, src) {
  const localPath = resolveLocalMediaPath(markdownFilePath, src);
  if (!localPath) return src;
  return convertLocalFileToSrc(localPath) || src;
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

/**
 * Rewrite local <img> src and CSS url() values inside an element tree.
 * @param {ParentNode} root
 * @param {string|null} markdownFilePath
 */
export function rewriteLocalMediaInElement(root, markdownFilePath) {
  if (!root || !isFilesystemPath(markdownFilePath)) return;

  root.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    const next = toLoadableMediaUrl(markdownFilePath, src);
    if (next && next !== src) img.setAttribute('src', next);
  });

  root.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style');
    if (!style || !style.includes('url(')) return;
    const next = style.replace(CSS_URL_RE, (match, quote, url) => {
      const converted = toLoadableMediaUrl(markdownFilePath, url.trim());
      if (!converted || converted === url.trim()) return match;
      const q = quote || "'";
      return `url(${q}${converted}${q})`;
    });
    if (next !== style) el.setAttribute('style', next);
  });
}
