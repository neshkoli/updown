# UpDown Web Deployment Guide

This document describes how to build and deploy the UpDown web app, and how to configure Google Drive integration.

## Live site

- **Landing page:** [neshkoli.github.io/updown](https://neshkoli.github.io/updown) (also at [updown.eshkoli.com](https://updown.eshkoli.com))
- **Web app:** [updown.eshkoli.com/app/](https://updown.eshkoli.com/app/)

Pushes to the `main` branch trigger an automatic deploy via `.github/workflows/deploy-web.yml` (GitHub Pages). The workflow deploys the static landing page from `docs/` at the site root and the built web app under `/app/`.

## Building the Web App

```bash
npm run build:web
```

This produces a static build in the `dist/` directory. The entry point is `dist/index.html` (hoisted from `dist/src/index.html` during the build; both desktop and web share `src/index.html`).

## Local Development

```bash
npm run dev:web
```

Starts the Vite dev server at http://localhost:5173.

## Deployment

### GitHub Pages (current setup)

1. **Repository Settings → Pages** — Source: **GitHub Actions**
2. **Custom domain** — `updown.eshkoli.com` (configured in repo Settings → Pages; `src/CNAME` is copied into `dist/` on build)
3. **Workflow** — `.github/workflows/deploy-web.yml` builds with `npm run build:web` and deploys `dist/` on every push to `main`
4. **Secrets** — `VITE_GOOGLE_CLIENT_ID` must be set in repo secrets for Google sign-in in production

### Base path

The landing page is served from the site root. The web app is built with `base: '/app/'` when `GITHUB_PAGES=true` (see `vite.config.js`). Production URLs:

- Landing: `https://neshkoli.github.io/updown/` or `https://updown.eshkoli.com/`
- Web app: `https://updown.eshkoli.com/app/`

### Other hosts

Deploy the contents of `dist/` to any static host (Netlify, Vercel, Cloudflare Pages, etc.). Set `VITE_GOOGLE_CLIENT_ID` at build time and add your production origin to Google OAuth authorized JavaScript origins.

## Google Drive Integration

To enable Google Drive (open, save, browse files), configure a Google Cloud project and OAuth credentials.

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
   - `https://updown.eshkoli.com` (production — add `/app/` path for the web app entry)
5. Copy the **Client ID**

### 4. Configure the Client ID in the App

**Build-time (recommended)**

Create a `.env` file in the project root (do not commit it):

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Rebuild: `npm run build:web`

For CI, set `VITE_GOOGLE_CLIENT_ID` as a GitHub Actions repository secret.

**Runtime alternative**

Before the app loads, set the client ID on the window:

```html
<script>
  window.__UPDOWN_GOOGLE_CLIENT_ID__ = 'your-client-id.apps.googleusercontent.com';
</script>
```

### 5. Publish the App (Production)

If your app is in "Testing" mode, only added test users can sign in. To allow any Google user:

1. OAuth consent screen → Publish app
2. Complete the verification process if required for sensitive scopes

## Features

- **Guest mode** — Edit markdown, preview live, open local files (drag-and-drop or file picker). No cloud save.
- **Signed in (Google)** — Browse folders, open and save `.md` / `.markdown` files, create folders in Drive.
- **Shared code** — Same editor, slides, find/replace, Mermaid, and print as the Tauri desktop app.
