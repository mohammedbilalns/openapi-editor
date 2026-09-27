import * as React from 'react'

/** Layout breakpoints (BLUEPRINT §2.1). */
export const BREAKPOINTS = { tablet: 768, laptop: 1024, desktop: 1280 } as const

export type Breakpoint = 'phone' | 'tablet' | 'laptop' | 'desktop'

/** Subscribes to a media query. `false` before hydration and outside the browser. */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** <768px: sidebar becomes a drawer, inspector a full-screen sheet. */
export function useIsPhone(): boolean {
  return useMediaQuery(`(max-width: ${BREAKPOINTS.tablet - 0.02}px)`)
}

/** The current layout band: phone <768, tablet 768–1023, laptop 1024–1279, desktop ≥1280. */
export function useBreakpoint(): Breakpoint {
  const laptopUp = useMediaQuery(`(min-width: ${BREAKPOINTS.laptop}px)`)
  const desktopUp = useMediaQuery(`(min-width: ${BREAKPOINTS.desktop}px)`)
  const tabletUp = useMediaQuery(`(min-width: ${BREAKPOINTS.tablet}px)`)
  if (desktopUp) return 'desktop'
  if (laptopUp) return 'laptop'
  if (tabletUp) return 'tablet'
  return 'phone'
}

/** True on touch-first devices, where hover-revealed actions are always shown. */
export function useCoarsePointer(): boolean {
  return useMediaQuery('(pointer: coarse)')
}
