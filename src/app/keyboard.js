/**
 * Shared keyboard shortcuts for the editor.
 */
import { openFind, openFindReplace } from '../find-replace-ui.js';
import { resetPreviewZoom } from '../editor-ui.js';
import { printFormattedDocument } from '../print.js';

/**
 * @param {() => void} refreshPreview
 */
export function setupKeyboardShortcuts(refreshPreview) {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === '0' && !e.altKey) {
      e.preventDefault();
      resetPreviewZoom(document);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'f' && !e.altKey) {
      e.preventDefault();
      openFind();
    }
    if ((e.metaKey && e.altKey && e.key === 'f') || (e.ctrlKey && e.key === 'h')) {
      e.preventDefault();
      openFindReplace();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
      e.preventDefault();
      printFormattedDocument(document, { refreshPreview });
    }
  });
}
