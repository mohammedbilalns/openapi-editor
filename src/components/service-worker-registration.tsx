import { useEffect } from 'react'

/** Registers the offline service worker (production builds only). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.error('Service worker registration failed:', error)
    })
  }, [])

  return null
}
