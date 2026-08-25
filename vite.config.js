import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const appHtml = resolve(__dirname, 'src/index.html');

export default defineConfig({
  root: '.',
  publicDir: 'src',
  base: process.env.GITHUB_PAGES ? './' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: appHtml,
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 5173,
    open: '/src/index.html',
  },
  plugins: [
    {
      // Tauri loads UMD copies from /lib; web build bundles markdown-it/mermaid instead.
      name: 'strip-umd-for-web',
      apply: 'build',
      transformIndexHtml(html, ctx) {
        if (!ctx.filename || resolve(ctx.filename) !== appHtml) return html;
        return html
          .replace(/<script src="lib\/markdown-it\.min\.js"><\/script>\s*/g, '')
          .replace(/<script src="lib\/mermaid\.min\.js"><\/script>\s*/g, '')
          .replace(/<script src="\/lib\/markdown-it\.min\.js"><\/script>\s*/g, '')
          .replace(/<script src="\/lib\/mermaid\.min\.js"><\/script>\s*/g, '');
      },
    },
    {
      // publicDir copies src/ after the bundle step, overwriting dist/index.html with
      // the raw Tauri shell. Restore the bundled app entry afterward.
      name: 'hoist-web-index',
      enforce: 'post',
      writeBundle() {
        if (process.env.GITHUB_PAGES) return;

        const bundled = resolve(__dirname, 'dist/src/index.html');
        const dest = resolve(__dirname, 'dist/index.html');
        if (existsSync(bundled)) {
          writeFileSync(dest, readFileSync(bundled, 'utf-8'));
        }
      },
    },
  ],
});
