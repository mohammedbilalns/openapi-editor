/* global self, caches, fetch, URL, Response */
// OpenAPI Editor service worker.
//
// This file is a template: the Vite build (see `serviceWorker()` in
// vite.config.ts) injects the build version and the list of hashed assets and
// emits the result as /sw.js. It is only registered in production.
//
// Strategy:
// - navigations: network-first, falling back to the cached app shell (offline)
// - /assets/*:   cache-first (file names are content-hashed, so immutable)
// - other same-origin GETs (icons, manifest, fonts): stale-while-revalidate

const VERSION = '__SW_VERSION__'
const PRECACHE_ASSETS = __SW_PRECACHE__

const SHELL_CACHE = `openapi-editor-shell-${VERSION}`
const ASSET_CACHE = `openapi-editor-assets-${VERSION}`
const RUNTIME_CACHE = `openapi-editor-runtime-${VERSION}`
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, RUNTIME_CACHE]

const SHELL_URL = '/'
const STATIC_URLS = [
  '/manifest.json',
  '/favicon.ico',
  '/icon.svg',
  '/icon.png',
  '/apple-touch-icon.png',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE)
      await shell.add(new Request(SHELL_URL, { cache: 'reload' }))

      const assets = await caches.open(ASSET_CACHE)
      await assets.addAll(PRECACHE_ASSETS)

      const runtime = await caches.open(RUNTIME_CACHE)
      // Icons are nice to have; never fail the install because of one.
      await Promise.allSettled(STATIC_URLS.map((url) => runtime.add(url)))

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(
        names
          .filter((name) => name.startsWith('openapi-editor-') && !CURRENT_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      )
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }

  event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE))
})

async function handleNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      // Every route renders the same SPA shell, so keep the freshest copy.
      const cache = await caches.open(SHELL_CACHE)
      await cache.put(SHELL_URL, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(SHELL_URL, { cacheName: SHELL_CACHE })
    return cached ?? offlineResponse()
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const response = await fetch(request)
    if (response.ok) await cache.put(request, response.clone())
    return response
  } catch {
    return offlineResponse()
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && response.type === 'basic') await cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached ?? (await network) ?? offlineResponse()
}

function offlineResponse() {
  return new Response('Offline — this resource is not cached yet.', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
