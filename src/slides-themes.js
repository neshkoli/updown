/**
 * Presentation theme registry and application.
 */

/** @type {Record<string, string>} */
const THEMES = {
  default: 'slides-theme-default',
  seriph: 'slides-theme-seriph',
  'apple-basic': 'slides-theme-apple-basic',
  shibainu: 'slides-theme-shibainu',
  bricks: 'slides-theme-bricks',
  jfrog: 'slides-theme-jfrog',
};

const THEME_CLASS_PREFIX = 'slides-theme-';

/**
 * @param {Record<string, unknown>|null|undefined} headmatter
 * @returns {string}
 */
export function resolveThemeName(headmatter) {
  const raw = headmatter?.theme;
  if (typeof raw === 'string' && THEMES[raw]) {
    return raw;
  }
  return 'default';
}

/**
 * @param {string} themeName
 * @returns {string}
 */
export function getThemeClassName(themeName) {
  return THEMES[themeName] || THEMES.default;
}

/**
 * @returns {string[]}
 */
export function getKnownThemeNames() {
  return Object.keys(THEMES);
}

/**
 * Apply theme class and themeConfig CSS variables to the slides stage element.
 * @param {HTMLElement} stageEl
 * @param {Record<string, unknown>|null|undefined} headmatter
 */
export function applyTheme(stageEl, headmatter) {
  if (!stageEl) return;

  const themeName = resolveThemeName(headmatter);
  const themeClass = getThemeClassName(themeName);

  for (const cls of Object.values(THEMES)) {
    stageEl.classList.remove(cls);
  }
  stageEl.classList.add(themeClass);
  stageEl.dataset.theme = themeName;

  const vars = [];
  const themeConfig = headmatter?.themeConfig;
  if (themeConfig && typeof themeConfig === 'object' && !Array.isArray(themeConfig)) {
    for (const [key, value] of Object.entries(themeConfig)) {
      if (value != null && value !== '') {
        vars.push(`--slidev-theme-${key}: ${value}`);
      }
    }
  }

  if (vars.length) {
    stageEl.style.cssText = vars.join('; ');
  } else {
    stageEl.style.cssText = '';
  }
}
