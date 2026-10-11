import { createHash } from 'node:crypto'
import dns from 'node:dns'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

dns.setDefaultResultOrder('ipv4first')

/**
 * Emits `sw.js` into the client build with the list of hashed assets and a
 * per-build cache version injected. The template lives in `src/sw.js` so it is
 * never copied verbatim (the SW is only registered in production builds).
 */
function serviceWorker(): Plugin {
  const template = fileURLToPath(new URL('./src/sw.js', import.meta.url))
  return {
    name: 'openapi-editor:service-worker',
    apply: 'build',
    applyToEnvironment: (environment) => environment.name === 'client',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((file) => file.startsWith('assets/'))
        .map((file) => `/${file}`)
        .toSorted()
      // Hashed file names change whenever content changes, so they make a stable version.
      const version = createHash('sha256').update(assets.join('\n')).digest('hex').slice(0, 12)
      const source = readFileSync(template, 'utf8')
        .replace("const VERSION = '__SW_VERSION__'", `const VERSION = '${version}'`)
        .replace('const PRECACHE_ASSETS = __SW_PRECACHE__', `const PRECACHE_ASSETS = ${JSON.stringify(assets)}`)
      if (source.includes('__SW_')) this.error('service worker template placeholders were not replaced')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: 'src',
      spa: {
        enabled: true,
        prerender: {
          // Write the prerendered shell as index.html so any static host serves
          // it at "/" and can use it as the SPA fallback for every other path.
          outputPath: '/index.html',
        },
      },
    }),
    viteReact(),
    serviceWorker(),
  ],
})
