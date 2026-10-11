/**
 * Returns true if the application is currently running inside a Tauri desktop webview shell.
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const win = window as unknown as Record<string, unknown>;
  return typeof win['__TAURI_INTERNALS__'] !== 'undefined';
}
