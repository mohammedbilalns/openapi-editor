# OpenAPI Editor

A modern, neo-brutalist, web-based WYSIWYG editor for authoring API documentations and schemas, remaining fully compatible with the **OpenAPI 3.0 specification**.

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

- Node.js 18+ or Bun
- pnpm (recommended) or npm

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
# Build the application
pnpm build

# Start the production server
pnpm start
```

### PWA Installation

The OpenAPI Editor can be installed as a Progressive Web App (PWA) for offline use:

1. Open the application in a supported browser (Chrome, Edge, Safari, etc.)
2. Look for the "Install" button in the browser's address bar or menu
3. Click "Install" to add the app to your device
4. The app will work completely offline after the first visit

**Note:** When offline, the "From URL" import feature is automatically disabled since it requires a server-side proxy to bypass CORS restrictions. You can still use "Paste YAML" and "Upload File" options while offline.


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
