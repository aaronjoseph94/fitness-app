// Owns: the one Vitest setup for the monorepo — 'engine' (plain Node: shared schemas + engine) and 'worker' (workerd + local D1).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          environment: 'node',
          include: ['packages/*/src/**/*.test.ts', 'packages/*/test/**/*.test.ts'],
        },
      },
      './apps/worker/vitest.config.ts',
    ],
  },
})
