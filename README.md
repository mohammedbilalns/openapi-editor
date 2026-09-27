# OpenAPI Editor

A modern, web-based WYSIWYG editor for authoring API documentations and schemas, remaining fully compatible with the **OpenAPI 3.0 specification**.

**Yet another OpenAPI Editor?**

> Most OpenAPI editors I've used fall into two camps: either they're text-based editors that require deep knowledge of the OpenAPI spec and YAML (yuck), or they're proprietary or bloated desktop applications with cloud sync, accounts, pricing plans, ugh...

---

## Some really cool features

- 🤝 **Full OpenAPI 3.0 compatibility**, allowing import/export of standard YAML files and support for almost all spec features.
- 👤 **No accounts**, no subscriptions, no cloud, no vendor lock-in! 
- 🌐 **Runs entirely in the browser** - no installation needed!
- 🤳 **Responsive** optimized for desktop, tablet, and mobile
- 🏕️ **Offline-first PWA** with service worker caching - works completely offline after first visit!
- 🎨 **Visual-first editing** with a clean, intuitive interface.
- 🛟 **Type-safe** development with full TypeScript support
- 🔗 **Graph-based architecture** internally to manage schema relationships and references.
- 🔓 **Open source** and fully customizable, MIT ftw!
- 🌓 **Light/Dark mode** support. 

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)

### Installation

```bash
# Clone the repository
git clone https://github.com/waterrmalann/openapi-editor.git
cd openapi-editor

# Install dependencies
pnpm install

# Run the development server
pnpm dev
```

Open [`http://localhost:3000`](http://localhost:3000) in your browser.

### Building for Production

```bash
# Type-check, lint and run unit tests
pnpm typecheck && pnpm lint && pnpm test

# Build the static SPA
pnpm build

# Serve the production build locally (http://localhost:4173)
pnpm preview
```

The app is built with TanStack Start in SPA mode. `pnpm build` writes a fully static site to **`dist/client/`** (the prerendered app shell is `dist/client/index.html`; `dist/server/` is only used by `pnpm preview` and can be ignored). Deploy `dist/client/` to any static host and configure an SPA fallback so unknown paths serve `/index.html` (e.g. Netlify `/* /index.html 200`, Cloudflare Pages / Vercel rewrites).

### Testing

```bash
pnpm test        # unit and component tests (Vitest + Testing Library, jsdom)
pnpm test:e2e    # end-to-end tests (Playwright, runs against `pnpm build && pnpm preview`)
```

Run `pnpm exec playwright install chromium` once before the first e2e run.

### PWA Installation

The OpenAPI Editor can be installed as a Progressive Web App (PWA) for offline use:

1. Open the application in a supported browser (Chrome, Edge, Safari, etc.)
2. Look for the "Install" button in the browser's address bar or menu
3. Click "Install" to add the app to your device
4. The app will work completely offline after the first visit

**Note:** "From URL" fetches the document directly from your browser, so the server must allow cross-origin requests (CORS). If it doesn't, download the file and use "Upload File" instead. The URL import is disabled while offline; "Paste YAML" and "Upload File" keep working.


## Contributing

Contributions are welcome! Some areas you could help with:

- Bug fixes
- Documentation improvements
- New features (security schemes, external docs, webhooks)
- UI/UX improvements
- Accessibility enhancements
- Internationalization
- Testing (unit, integration, E2E)
- Support for OpenAPI 3.1 and beyond

## License

MIT License - see [LICENSE](LICENSE) file for details

---

If this project helps you, consider giving it a ⭐ on GitHub!
