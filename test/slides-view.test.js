import { describe, it, expect, beforeEach, vi } from 'vitest';
import markdownit from 'markdown-it';

globalThis.window = globalThis.window || globalThis;
globalThis.window.markdownit = markdownit;

const {
  initSlidesView,
  setSlideIndex,
  nextSlide,
  prevSlide,
  updateSlidesView,
  showSlidesViewer,
  hideSlidesViewer,
  isSlidesViewActive,
  getCurrentDeck,
  enterFullscreen,
  exitFullscreen,
  onWindowFullscreenChange,
} = await import('../src/slides-view.js');

function setupSlidesDom() {
  document.body.innerHTML = `
    <div id="app">
      <div id="preview" class="preview"></div>
      <div id="slides-viewer-wrap" class="slides-viewer-wrap hidden">
        <div class="slides-canvas-outer">
          <div class="slides-canvas-inner">
            <div id="slides-stage" class="slides-stage slides-theme-default"></div>
          </div>
        </div>
        <div class="slides-chrome">
          <button data-action="slidesPrev">‹</button>
          <span id="slides-counter">1 / 1</span>
          <button data-action="slidesNext">›</button>
          <button data-action="slidesFullscreen">⛶</button>
        </div>
      </div>
    </div>
  `;
}

const sampleDeck = `---
theme: jfrog
---

# Slide 1

---

# Slide 2

---

# Slide 3
`;

describe('slides-view', () => {
  beforeEach(() => {
    setupSlidesDom();
    initSlidesView();
    updateSlidesView(sampleDeck);
  });

  it('parses deck on updateSlidesView', () => {
    const deck = getCurrentDeck();
    expect(deck.slides).toHaveLength(3);
    expect(deck.headmatter.theme).toBe('jfrog');
  });

  it('shows and hides slides viewer', () => {
    showSlidesViewer();
    expect(isSlidesViewActive()).toBe(true);
    expect(document.getElementById('preview').classList.contains('preview-hidden-for-slides')).toBe(true);

    hideSlidesViewer();
    expect(isSlidesViewActive()).toBe(false);
    expect(document.getElementById('preview').classList.contains('preview-hidden-for-slides')).toBe(false);
  });

  it('navigates between slides', () => {
    showSlidesViewer();
    setSlideIndex(0);
    expect(document.getElementById('slides-counter').textContent).toBe('1 / 3');

    nextSlide();
    expect(document.getElementById('slides-counter').textContent).toBe('2 / 3');

    prevSlide();
    expect(document.getElementById('slides-counter').textContent).toBe('1 / 3');
  });

  it('clamps slide index to bounds', () => {
    setSlideIndex(100);
    expect(document.getElementById('slides-counter').textContent).toBe('3 / 3');

    setSlideIndex(-5);
    expect(document.getElementById('slides-counter').textContent).toBe('1 / 3');
  });

  it('applies theme class when rendering', () => {
    showSlidesViewer();
    const stage = document.getElementById('slides-stage');
    expect(stage.classList.contains('slides-theme-jfrog')).toBe(true);
  });

  it('renders slide content as HTML', () => {
    showSlidesViewer();
    const stage = document.getElementById('slides-stage');
    expect(stage.innerHTML).toContain('<h1');
    expect(stage.innerHTML).toContain('Slide 1');
  });

  it('scales slides up to fill a larger preview frame', () => {
    const outer = document.querySelector('.slides-canvas-outer');
    const inner = document.querySelector('.slides-canvas-inner');
    outer.getBoundingClientRect = () => ({ width: 1960, height: 1102 });

    showSlidesViewer();

    expect(Number(inner.style.getPropertyValue('--slide-scale'))).toBeCloseTo(2);
  });

  it('uses fullscreen fallback when requestFullscreen unavailable', async () => {
    const wrap = document.getElementById('slides-viewer-wrap');
    showSlidesViewer();
    wrap.requestFullscreen = undefined;
    await enterFullscreen();
    expect(wrap.classList.contains('slides-fullscreen-fallback')).toBe(true);
    expect(wrap.classList.contains('slides-is-fullscreen')).toBe(true);
    await exitFullscreen();
    expect(wrap.classList.contains('slides-fullscreen-fallback')).toBe(false);
  });

  it('syncs presentation visual when window fullscreen changes', () => {
    showSlidesViewer();
    onWindowFullscreenChange(true);
    expect(document.getElementById('slides-viewer-wrap').classList.contains('slides-is-fullscreen')).toBe(true);
    onWindowFullscreenChange(false);
    expect(document.getElementById('slides-viewer-wrap').classList.contains('slides-is-fullscreen')).toBe(false);
  });

  it('exits fullscreen on Escape key', async () => {
    const wrap = document.getElementById('slides-viewer-wrap');
    showSlidesViewer();
    wrap.requestFullscreen = undefined;
    await enterFullscreen();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(wrap.classList.contains('slides-fullscreen-fallback')).toBe(false);
  });
});
