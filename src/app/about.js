/**
 * Shared About dialog.
 */
export function showAboutDialog() {
  const overlay = document.getElementById('about-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');

  function onOverlayClick(e) {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    }
  }

  function onEsc(e) {
    if (e.key === 'Escape') {
      overlay.classList.add('hidden');
      overlay.removeEventListener('click', onOverlayClick);
      document.removeEventListener('keydown', onEsc);
    }
  }

  overlay.addEventListener('click', onOverlayClick);
  document.addEventListener('keydown', onEsc);
}

/**
 * Open external links from the About dialog in a new window / system browser.
 */
export function setupAboutLinkHandler() {
  document.addEventListener('click', (e) => {
    const link = e.target.closest('.about-link');
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute('href');
    if (!href) return;
    if (window.__TAURI__?.opener?.openUrl) {
      window.__TAURI__.opener.openUrl(href);
    } else {
      window.open(href, '_blank');
    }
  });
}
