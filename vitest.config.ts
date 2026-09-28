import viteReact from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// Unit/component tests. The TanStack Start plugin is intentionally left out:
// tests render components directly and don't need the router codegen or SSR.
export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Wall-clock budgets are unreliable next to parallel test files; `pnpm test:perf` runs it alone.
    exclude: [...configDefaults.exclude, 'src/test/perf.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
})
