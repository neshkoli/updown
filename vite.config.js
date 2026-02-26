import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

export default defineConfig({
  root: '.',
  publicDir: 'src',
  // Set base to repo name so asset paths resolve correctly on GitHub Pages
  base: process.env.GITHUB_PAGES ? '/updown/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'web/index.html'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
  },
  plugins: [
    {
      // publicDir (src/) is copied to dist/ during writeBundle.
      // src/index.html (the Tauri desktop entry) overwrites the built web app.
      // This plugin runs after that copy and restores dist/index.html from
      // the Rollup-built dist/web/index.html.
      name: 'hoist-web-index',
      enforce: 'post',
      writeBundle() {
        const src = resolve(__dirname, 'dist/web/index.html');
        const dest = resolve(__dirname, 'dist/index.html');
        if (existsSync(src)) {
          writeFileSync(dest, readFileSync(src, 'utf-8'));
        }
      },
    },
  ],
});
