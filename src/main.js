/**
 * UpDown — unified entry point for desktop (Tauri) and web.
 */
import { isTauri } from './platform/detect.js';

async function ensureMarkdownLibs() {
  if (window.markdownit && window.mermaid) return;
  const [{ default: markdownit }, { default: mermaid }] = await Promise.all([
    import('markdown-it'),
    import('mermaid'),
  ]);
  window.markdownit = markdownit;
  window.mermaid = mermaid;
}

window.addEventListener('DOMContentLoaded', async () => {
  if (!isTauri()) {
    await ensureMarkdownLibs();
  }

  if (isTauri()) {
    const { initPlatform } = await import('./platform/tauri.js');
    await initPlatform();
  } else {
    const { initPlatform } = await import('./platform/web.js');
    await initPlatform();
  }
});
