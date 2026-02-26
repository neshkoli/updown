/**
 * Drag-and-drop support for UpDown.
 * Two implementations:
 *  - Tauri: uses native onDragDropEvent (receives file paths)
 *  - Web:   uses HTML5 File API (reads file content via FileReader)
 */

/**
 * Read a File object as text.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsText(file);
  });
}

/**
 * Set up HTML5 drag-and-drop for the web (no Tauri).
 * Shows a visual overlay when hovering over the app, loads the first
 * .md / .markdown file dropped.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 * @param {function} onAfterLoad - optional callback(filename) after file loads
 */
export function setupWebDragDrop(editor, refreshPreview, onAfterLoad) {
  const app = document.getElementById('app');
  if (!app) return;

  const overlay = document.createElement('div');
  overlay.id = 'drop-overlay';
  overlay.innerHTML = '<span>Drop markdown file here</span>';
  app.appendChild(overlay);

  let dragCounter = 0;

  app.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    overlay.classList.add('visible');
  });

  app.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) {
      dragCounter = 0;
      overlay.classList.remove('visible');
    }
  });

  app.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  app.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('visible');

    const files = Array.from(e.dataTransfer?.files || []);
    const mdFile = files.find(f => /\.(md|markdown)$/i.test(f.name)) || files[0];
    if (!mdFile) return;

    try {
      const content = await readFileAsText(mdFile);
      editor.value = content;
      refreshPreview();
      if (onAfterLoad) onAfterLoad(mdFile.name);
    } catch (err) {
      console.error('Failed to open dropped file:', err);
    }
  });
}

/**
 * Set up drag-and-drop file opening (Tauri desktop).
 * Shows a visual overlay when hovering, opens the first .md file on drop.
 * @param {HTMLTextAreaElement} editor
 * @param {function} refreshPreview
 * @param {function} fileOpenPath - (path, editor, refreshPreview) => Promise
 * @param {function} [onAfterOpen] - optional callback after file opens, receives file path
 */
export function setupDragDrop(editor, refreshPreview, fileOpenPath, onAfterOpen) {
  if (!window.__TAURI__) return;

  const app = document.getElementById('app');
  if (!app) return;

  // Create the drop overlay element
  const overlay = document.createElement('div');
  overlay.id = 'drop-overlay';
  overlay.innerHTML = '<span>Drop markdown file here</span>';
  app.appendChild(overlay);

  const { getCurrentWebview } = window.__TAURI__.webview;
  const webview = getCurrentWebview();

  webview.onDragDropEvent((event) => {
    const { type } = event.payload;

    if (type === 'over') {
      overlay.classList.add('visible');
    } else if (type === 'drop') {
      overlay.classList.remove('visible');
      const paths = event.payload.paths || [];
      // Open the first markdown-like file (or just the first file)
      const mdFile = paths.find(p => /\.(md|markdown)$/i.test(p)) || paths[0];
      if (mdFile) {
        fileOpenPath(mdFile, editor, refreshPreview).then(() => {
          if (onAfterOpen) onAfterOpen(mdFile);
        });
      }
    } else {
      // cancelled
      overlay.classList.remove('visible');
    }
  });
}
