# UpDown Web Deployment Guide

This document describes how to build and deploy the UpDown web app, and how to configure Google Drive integration.

## Building the Web App

```bash
npm run build:web
```

This produces a static build in the `dist/` directory. The main entry point is `dist/web/index.html`.

## Local Development

```bash
npm run dev:web
```

Starts the Vite dev server at http://localhost:5173.

## Deployment

The web app is a static site. Deploy the contents of `dist/` to any static hosting service:

- **GitHub Pages**: Set the publish directory to `dist` (or `dist/web` if your host supports subdirectories)
- **Netlify**: Deploy the `dist` folder; set the publish directory to `dist`
- **Vercel**: Deploy the project; configure the output directory to `dist`
- **Cloudflare Pages**: Deploy the `dist` folder

### GitHub Pages Example

1. In your repo, go to Settings → Pages
2. Source: Deploy from a branch
3. Branch: `main` (or your default)
4. Folder: `/ (root)` and set the build output to `dist` if using a build step, or `/dist` for the built files

### Base Path

If deploying to a subpath (e.g. `https://example.com/updown/`), set the Vite `base` option in `vite.config.js`:

```js
export default defineConfig({
  base: '/updown/',
  // ...
});
```

## Google Drive Integration

To enable Google Drive (open, save, browse files), you must configure a Google Cloud project and OAuth credentials.

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Drive API**:
   - APIs & Services → Library → search "Google Drive API" → Enable

### 2. Configure OAuth Consent Screen

1. APIs & Services → OAuth consent screen
2. Choose **External** (or Internal for workspace-only)
3. Fill in app name, user support email, developer contact
4. Add scopes: `https://www.googleapis.com/auth/drive`
5. Add test users if the app is in testing mode

### 3. Create OAuth Credentials

1. APIs & Services → Credentials → Create Credentials → OAuth client ID
2. Application type: **Web application**
3. Name: e.g. "UpDown Web"
4. **Authorized JavaScript origins**:
   - `http://localhost:5173` (for development)
   - `https://your-domain.com` (your production URL)
5. **Authorized redirect URIs**: Add `https://your-domain.com` (or leave default for GSI)
6. Copy the **Client ID**

### 4. Configure the Client ID in the App

**Option A: Build-time (recommended)**

Create a `.env` file in the project root (do not commit it):

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Rebuild: `npm run build:web`

**Option B: Runtime**

Before the app loads, set the client ID on the window:

```html
<script>
  window.__UPDOWN_GOOGLE_CLIENT_ID__ = 'your-client-id.apps.googleusercontent.com';
</script>
<script type="module" src="/src/main-web.js" defer></script>
```

### 5. Publish the App (Production)

If your app is in "Testing" mode, only added test users can sign in. To allow any Google user:

1. OAuth consent screen → Publish app
2. Complete the verification process if required for sensitive scopes

## Features

- **Guest mode**: Edit markdown and see live preview without signing in. No save, no file browser.
- **Signed in (Google)**: Full access to Google Drive: browse folders, open and save `.md` / `.markdown` files.
- **Shared code**: The same editor, preview, and toolbar logic is used by both the Tauri desktop app and the web app.
