import * as React from 'react'
import { ThemeContext } from '@/hooks/use-theme'
import {
  DEFAULT_THEME,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  isTheme,
  type ResolvedTheme,
  type Theme,
} from '@/lib/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  // Suppress transitions for the frame in which the palette flips.
  root.classList.add('theme-switching')
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[resolved])
  // Force a style flush with transitions disabled, then re-enable them.
  void window.getComputedStyle(root).colorScheme
  window.setTimeout(() => root.classList.remove('theme-switching'), 1)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline head script already applied the class before hydration, so the
  // initial state can be read synchronously without a flash.
  const [theme, setThemeState] = React.useState<Theme>(() =>
    typeof window === 'undefined' ? DEFAULT_THEME : readStoredTheme(),
  )
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>(() =>
    typeof window === 'undefined' ? 'dark' : getSystemTheme(),
  )

  React.useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystemTheme(mql.matches ? 'dark' : 'light')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  // Keep tabs in sync.
  React.useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) setThemeState(readStoredTheme())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemTheme : theme

  React.useEffect(() => {
    if (!document.documentElement.classList.contains(resolvedTheme)) {
      applyTheme(resolvedTheme)
    }
  }, [resolvedTheme])

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch {
      // Storage can be unavailable (private mode); the choice still applies for this session.
    }
  }, [])

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
