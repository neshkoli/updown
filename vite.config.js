import { defineConfig } from 'vite';
import { resolve } from 'path';

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
});
