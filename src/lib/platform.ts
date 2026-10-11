interface WindowWithTauri extends Window {
  __TAURI_INTERNALS__?: unknown;
}

/**
 * Returns true if the application is currently running inside a Tauri desktop webview shell.
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return typeof (window as unknown as WindowWithTauri).__TAURI_INTERNALS__ !== 'undefined';
}
