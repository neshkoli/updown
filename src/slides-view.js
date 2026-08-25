/**
 * Slides presentation view: scaled canvas, navigation, fullscreen.
 */
import { applyBidi } from './bidi.js';
import { getViewMode } from './editor-ui.js';
import { getCurrentFilePath } from './file-ops.js';
import { rewriteLocalMediaInElement } from './local-media.js';
import { renderMarkdown } from './render.js';
import { parseSlides, slideIndexAtOffset } from './slides-parser.js';
import { applyTheme } from './slides-themes.js';

/** @type {{ headmatter: Record<string, unknown>, slides: Array }} */
let deck = { headmatter: {}, slides: [] };
let currentIndex = 0;
let initialized = false;
let chromeHideTimer = null;
const CHROME_HIDE_MS = 2000;

const DEFAULT_CANVAS_WIDTH = 980;
const DEFAULT_ASPECT_RATIO = 16 / 9;

/**
 * @returns {boolean}
 */
export function isSlidesViewActive() {
  const wrap = document.getElementById('slides-viewer-wrap');
  return Boolean(wrap && !wrap.classList.contains('hidden'));
}

/**
 * @returns {HTMLElement|null}
 */
function getStage() {
  return document.getElementById('slides-stage');
}

/**
 * @returns {HTMLElement|null}
 */
function getWrap() {
  return document.getElementById('slides-viewer-wrap');
}

function updateCounter() {
  const counter = document.getElementById('slides-counter');
  if (!counter) return;
  const total = deck.slides.length || 1;
  const current = deck.slides.length ? currentIndex + 1 : 0;
  counter.textContent = `${current} / ${total}`;
}

function parseAspectRatio(value) {
  if (typeof value === 'number' && value > 0) return value;
  if (typeof value === 'string') {
    const parts = value.split('/').map((s) => Number(s.trim()));
    if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
      return parts[0] / parts[1];
    }
    const n = Number(value);
    if (n > 0) return n;
  }
  return DEFAULT_ASPECT_RATIO;
}

function isPresentationActive() {
  return isSlidesViewActive() || getViewMode() === 'slides';
}

function getTauriWindow() {
  return window.__TAURI__?.window?.getCurrentWindow?.() ?? null;
}

function isSlidesFullscreen() {
  const wrap = getWrap();
  return Boolean(
    wrap?.classList.contains('slides-is-fullscreen') ||
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    wrap?.classList.contains('slides-fullscreen-fallback')
  );
}

function applyPresentationFullscreenVisual() {
  const wrap = getWrap();
  if (!wrap) return;
  wrap.classList.add('slides-is-fullscreen');
  updateCanvasScale();
}

function clearPresentationFullscreenVisual() {
  const wrap = getWrap();
  if (wrap) {
    wrap.classList.remove('slides-is-fullscreen', 'slides-fullscreen-fallback');
  }
  updateCanvasScale();
}

/**
 * Called from Tauri when the native window fullscreen state changes (green button).
 * @param {boolean} fullscreen
 */
export function onWindowFullscreenChange(fullscreen) {
  if (!isPresentationActive()) return;
  if (fullscreen) {
    applyPresentationFullscreenVisual();
  } else {
    clearPresentationFullscreenVisual();
  }
}

function updateCanvasScale() {
  const outer = document.querySelector('.slides-canvas-outer');
  const inner = document.querySelector('.slides-canvas-inner');
  if (!outer || !inner) return;

  const canvasWidth = Number(deck.headmatter.canvasWidth) || DEFAULT_CANVAS_WIDTH;
  const aspectRatio = parseAspectRatio(deck.headmatter.aspectRatio);
  const canvasHeight = canvasWidth / aspectRatio;

  inner.style.width = `${canvasWidth}px`;
  inner.style.height = `${canvasHeight}px`;

  const rect = outer.getBoundingClientRect();
  let scale = Math.min(rect.width / canvasWidth, rect.height / canvasHeight);
  inner.style.setProperty('--slide-scale', String(scale));
}

function renderCurrentSlide() {
  const stage = getStage();
  if (!stage) return;

  applyTheme(stage, deck.headmatter);

  const slide = deck.slides[currentIndex];
  if (!slide) {
    stage.innerHTML = '<div class="slidev-layout default"><p>No slides</p></div>';
    updateCounter();
    return;
  }

  const layout = slide.layout || slide.frontmatter?.layout || 'default';
  const extraClass = slide.frontmatter?.class ? String(slide.frontmatter.class) : '';
  const background = slide.frontmatter?.background || slide.frontmatter?.backgroundImage;
  let style = '';
  if (background && typeof background === 'string') {
    style = `background-image: url('${background.replace(/'/g, "\\'")}'); background-size: cover; background-position: center;`;
  }

  const html = renderMarkdown(slide.content, { allowLayoutHtml: true });
  stage.innerHTML = `<div class="slidev-layout ${layout} ${extraClass}"${style ? ` style="${style}"` : ''}>${html}</div>`;
  rewriteLocalMediaInElement(stage, getCurrentFilePath());

  applyBidi(stage);

  if (window.mermaid) {
    const diagrams = stage.querySelectorAll('pre.mermaid');
    if (diagrams.length > 0) {
      window.mermaid.run({ nodes: diagrams });
    }
  }

  updateCounter();
  updateCanvasScale();
}

/**
 * @param {number} index
 */
export function setSlideIndex(index) {
  if (!deck.slides.length) return;
  currentIndex = Math.max(0, Math.min(index, deck.slides.length - 1));
  renderCurrentSlide();
}

export function nextSlide() {
  setSlideIndex(currentIndex + 1);
}

export function prevSlide() {
  setSlideIndex(currentIndex - 1);
}

/**
 * Show slides viewer, hide markdown preview.
 */
export function showSlidesViewer() {
  const wrap = getWrap();
  const preview = document.getElementById('preview');
  const metadataPanel = document.getElementById('metadata-panel');

  if (!wrap || !preview) return;

  preview.classList.add('preview-hidden-for-slides');
  wrap.classList.remove('hidden');
  if (metadataPanel) metadataPanel.classList.add('hidden');

  showSlidesChrome();
  renderCurrentSlide();
  syncWindowFullscreenState();
}

async function syncWindowFullscreenState() {
  const tauriWin = getTauriWindow();
  if (!tauriWin || !isPresentationActive()) return;
  try {
    const fs = await tauriWin.isFullscreen();
    onWindowFullscreenChange(fs);
  } catch {
    /* ignore */
  }
}

/**
 * Hide slides viewer, restore markdown preview.
 */
export function hideSlidesViewer() {
  const wrap = getWrap();
  const preview = document.getElementById('preview');

  if (wrap) wrap.classList.add('hidden');
  if (preview) preview.classList.remove('preview-hidden-for-slides');
  if (wrap) wrap.classList.remove('slides-chrome-visible');

  exitFullscreen();
}

/**
 * Parse source and update slides view if active.
 * @param {string} source
 */
export function updateSlidesView(source) {
  deck = parseSlides(source);
  if (currentIndex >= deck.slides.length) {
    currentIndex = Math.max(0, deck.slides.length - 1);
  }
  if (getViewMode() === 'slides' || isSlidesViewActive()) {
    showSlidesViewer();
    renderCurrentSlide();
  }
}

/**
 * Enter presentation fullscreen (native window on Tauri, DOM API on web).
 */
export async function enterFullscreen() {
  if (!isPresentationActive()) return;

  const tauriWin = getTauriWindow();
  if (tauriWin) {
    await tauriWin.setFullscreen(true);
    applyPresentationFullscreenVisual();
    return;
  }

  const wrap = getWrap();
  if (!wrap) return;

  const req = wrap.requestFullscreen?.bind(wrap) ||
    wrap.webkitRequestFullscreen?.bind(wrap);
  if (req) {
    try {
      await req();
      applyPresentationFullscreenVisual();
    } catch {
      wrap.classList.add('slides-fullscreen-fallback');
      applyPresentationFullscreenVisual();
    }
  } else {
    wrap.classList.add('slides-fullscreen-fallback');
    applyPresentationFullscreenVisual();
  }
}

/**
 * Exit presentation fullscreen.
 */
export async function exitFullscreen() {
  const tauriWin = getTauriWindow();
  if (tauriWin) {
    try {
      const fs = await tauriWin.isFullscreen();
      if (fs) await tauriWin.setFullscreen(false);
    } catch {
      /* ignore */
    }
  }

  if (document.fullscreenElement || document.webkitFullscreenElement) {
    const exit = document.exitFullscreen?.bind(document) ||
      document.webkitExitFullscreen?.bind(document);
    exit?.().catch(() => {});
  }

  clearPresentationFullscreenVisual();
}

function handleKeydown(e) {
  if (!isSlidesViewActive() && getViewMode() !== 'slides') return;

  const target = e.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return;
  }

  switch (e.key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case ' ':
      if (e.key === ' ' && e.shiftKey) {
        e.preventDefault();
        prevSlide();
      } else if (e.key === ' ') {
        e.preventDefault();
        nextSlide();
      } else {
        e.preventDefault();
        nextSlide();
      }
      break;
    case 'ArrowLeft':
    case 'ArrowUp':
      e.preventDefault();
      prevSlide();
      break;
    case 'f':
    case 'F':
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        if (isSlidesFullscreen()) {
          exitFullscreen();
        } else {
          enterFullscreen();
        }
      }
      break;
    case 'Escape':
      if (isSlidesFullscreen()) {
        e.preventDefault();
        exitFullscreen();
      }
      break;
    case 'Home':
      e.preventDefault();
      setSlideIndex(0);
      break;
    case 'End':
      e.preventDefault();
      setSlideIndex(deck.slides.length - 1);
      break;
    default:
      break;
  }
}

function onFullscreenChange() {
  const wrap = getWrap();
  if (!wrap) return;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    clearPresentationFullscreenVisual();
  } else if (isPresentationActive()) {
    applyPresentationFullscreenVisual();
  }
}

function showSlidesChrome() {
  const wrap = getWrap();
  if (!wrap) return;
  wrap.classList.add('slides-chrome-visible');
  clearTimeout(chromeHideTimer);
  chromeHideTimer = setTimeout(() => {
    wrap.classList.remove('slides-chrome-visible');
  }, CHROME_HIDE_MS);
}

function setupChromeAutohide(wrap) {
  wrap.addEventListener('mousemove', showSlidesChrome);
  wrap.addEventListener('mouseenter', showSlidesChrome);
  wrap.addEventListener('mouseleave', () => {
    clearTimeout(chromeHideTimer);
    wrap.classList.remove('slides-chrome-visible');
  });
}

/**
 * Initialize slides view event listeners.
 */
export function initSlidesView() {
  if (initialized) return;
  initialized = true;

  document.addEventListener('keydown', handleKeydown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  const wrap = getWrap();
  if (wrap) {
    setupChromeAutohide(wrap);
    wrap.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === 'slidesPrev') prevSlide();
      else if (action === 'slidesNext') nextSlide();
    });
  }

  window.addEventListener('resize', () => {
    if (isSlidesViewActive()) updateCanvasScale();
  });
}

/**
 * Called when entering slides view mode.
 * @param {string} source
 * @param {number} [sourceOffset]
 */
export function activateSlidesView(source, sourceOffset) {
  updateSlidesView(source);
  const index = typeof sourceOffset === 'number' && Number.isFinite(sourceOffset)
    ? slideIndexAtOffset(source, sourceOffset)
    : 0;
  setSlideIndex(index);
  showSlidesViewer();
  renderCurrentSlide();
}

/**
 * @returns {typeof deck}
 */
export function getCurrentDeck() {
  return deck;
}

/**
 * @returns {number}
 */
export function getCurrentSlideIndex() {
  return currentIndex;
}
