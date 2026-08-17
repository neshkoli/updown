import { describe, it, expect, beforeEach } from 'vitest';
import { resolveThemeName, getThemeClassName, applyTheme } from '../src/slides-themes.js';

describe('slides-themes', () => {
  describe('resolveThemeName', () => {
    it('returns theme from headmatter', () => {
      expect(resolveThemeName({ theme: 'seriph' })).toBe('seriph');
    });

    it('falls back to default for unknown theme', () => {
      expect(resolveThemeName({ theme: 'unknown-theme' })).toBe('default');
    });

    it('falls back to default when headmatter is missing', () => {
      expect(resolveThemeName(null)).toBe('default');
      expect(resolveThemeName({})).toBe('default');
    });

    it('resolves jfrog theme', () => {
      expect(resolveThemeName({ theme: 'jfrog' })).toBe('jfrog');
    });
  });

  describe('getThemeClassName', () => {
    it('maps theme names to CSS classes', () => {
      expect(getThemeClassName('jfrog')).toBe('slides-theme-jfrog');
      expect(getThemeClassName('seriph')).toBe('slides-theme-seriph');
    });

    it('falls back to default class for unknown theme', () => {
      expect(getThemeClassName('nope')).toBe('slides-theme-default');
    });
  });

  describe('applyTheme', () => {
    let stage;

    beforeEach(() => {
      stage = document.createElement('div');
      stage.id = 'slides-stage';
      document.body.appendChild(stage);
    });

    it('applies theme class to stage element', () => {
      applyTheme(stage, { theme: 'jfrog' });
      expect(stage.classList.contains('slides-theme-jfrog')).toBe(true);
      expect(stage.dataset.theme).toBe('jfrog');
    });

    it('injects themeConfig as CSS variables', () => {
      applyTheme(stage, {
        theme: 'default',
        themeConfig: { primary: '#ff0000' },
      });
      expect(stage.style.cssText).toContain('--slidev-theme-primary: #ff0000');
    });

    it('swaps theme class when theme changes', () => {
      applyTheme(stage, { theme: 'seriph' });
      expect(stage.classList.contains('slides-theme-seriph')).toBe(true);

      applyTheme(stage, { theme: 'bricks' });
      expect(stage.classList.contains('slides-theme-bricks')).toBe(true);
      expect(stage.classList.contains('slides-theme-seriph')).toBe(false);
    });
  });
});
