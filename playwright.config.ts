import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests.
 *
 * Default: build and serve the production output with `vite preview` (the same
 * static files that get deployed, service worker included).
 *
 * Environment:
 * - `E2E_PORT`  port to serve on (default 4173).
 * - `E2E_DEV=1` run against `vite dev` instead of build + preview (fast local
 *   iteration; production-only specs such as offline are skipped).
 * - `E2E_BASE_URL` test an already-running server; no web server is started.
 */
const PORT = Number(process.env.E2E_PORT ?? 4173)
const DEV = process.env.E2E_DEV === '1'
const EXTERNAL = process.env.E2E_BASE_URL
const baseURL = EXTERNAL ?? `http://localhost:${PORT}`

const command = DEV
  ? `pnpm exec vite dev --port ${PORT} --strictPort`
  : `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 30_000,
  expect: { timeout: 7_500 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // The service worker would sit between the page and `page.route()`; only the
    // offline spec opts back in.
    serviceWorkers: 'block',
    // Deterministic theme: the "system" default follows this.
    colorScheme: 'light',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
        command,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
})
