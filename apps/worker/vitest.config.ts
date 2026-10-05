// Owns: Worker route tests in workerd with local D1; applies drizzle migrations before tests.
import path from 'node:path'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

const migrations = await readD1Migrations(path.join(import.meta.dirname, 'drizzle'))

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: { bindings: { TEST_MIGRATIONS: migrations, DEV_AUTH_BYPASS: '1', HEALTH_WEBHOOK_TOKEN: 'test-health-token', MCP_BEARER_TOKEN: 'test-mcp-token', FILE_URL_SECRET: 'test-secret' } },
    }),
  ],
  test: {
    name: 'worker',
    include: ['test/**/*.test.ts', 'src/modules/*/tests/**/*.test.ts'],
    setupFiles: ['./test/apply-migrations.ts'],
  },
})
