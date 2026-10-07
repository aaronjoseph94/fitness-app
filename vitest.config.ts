// Owns: the one Vitest setup for the monorepo — 'engine' (plain Node: shared schemas + engine), 'worker' (workerd + local D1) and 'web' (plain Node: the app's own DOM-free logic, such as the spring maths behind its motion).
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
      {
        test: {
          name: 'web',
          // Node, not jsdom: this project covers the app's pure logic (the spring solver), never a component tree.
          environment: 'node',
          include: ['apps/web/src/**/*.test.ts'],
        },
      },
      './apps/worker/vitest.config.ts',
    ],
  },
})
