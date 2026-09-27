export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'openapi-editor-theme'
export const DEFAULT_THEME: Theme = 'system'

/** Browser chrome colour per resolved theme (matches --background). */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#141414',
}

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

/**
 * Inline script executed in <head> before first paint. It must stay
 * self-contained (no imports) because it is serialised into the HTML shell.
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var c=${JSON.stringify(THEME_COLORS)};var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"&&t!=="system")t=${JSON.stringify(DEFAULT_THEME)};var r=t==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var d=document.documentElement;d.classList.remove("light","dark");d.classList.add(r);d.style.colorScheme=r;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",c[r]);}catch(e){}})();`
