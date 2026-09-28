import { defineConfig } from 'vitest/config'
import base from './vitest.config'

// The large-spec performance guard, run on its own so other test files don't skew its timings.
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['src/test/perf.test.ts'], exclude: [] },
})
