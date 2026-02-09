/**
 * Drag-and-drop support for UpDown.
 * Uses Tauri's native onDragDropEvent to receive file paths.
 */

/**
 * Set up drag-and-drop file opening.
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
