/**
 * Shared modal dialog for filename / folder name input.
 * @param {string} [defaultName]
 * @param {string} [title]
 * @param {string} [okLabel]
 * @returns {Promise<string|null>}
 */
export function showFileNameDialog(defaultName = 'untitled.md', title = 'Save to Google Drive', okLabel = 'Save') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-dialog">
        <h3 class="modal-title">${title}</h3>
        <input type="text" class="modal-input" value="${defaultName.replace(/"/g, '&quot;')}" placeholder="name">
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel">Cancel</button>
          <button class="modal-btn modal-btn-ok">${okLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.modal-input');
    setTimeout(() => {
      input.focus();
      const dotIdx = input.value.lastIndexOf('.');
      input.setSelectionRange(0, dotIdx > 0 ? dotIdx : input.value.length);
    }, 0);

    const finish = (value) => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    overlay.querySelector('.modal-btn-ok').addEventListener('click', () => {
      const name = input.value.trim();
      finish(name || null);
    });
    overlay.querySelector('.modal-btn-cancel').addEventListener('click', () => finish(null));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const name = input.value.trim(); finish(name || null); }
      if (e.key === 'Escape') finish(null);
    });
  });
}
