/**
 * Runtime platform detection.
 */
export function isTauri() {
  return Boolean(window.__TAURI__);
}
