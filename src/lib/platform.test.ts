import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isTauri } from './platform';

describe('platform detection', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    // Reset window.__TAURI_INTERNALS__ before each test
    if (typeof window !== 'undefined') {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });

  afterEach(() => {
    if (typeof window !== 'undefined') {
      Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
    }
  });

  it('detects standard web browser environment', () => {
    expect(isTauri()).toBe(false);
  });

  it('detects Tauri environment when __TAURI_INTERNALS__ is present', () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    });
    expect(isTauri()).toBe(true);
  });
});
