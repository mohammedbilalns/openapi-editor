import * as React from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** True while the browser reports a connection. Assumes online before hydration. */
export function useOnlineStatus(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}
