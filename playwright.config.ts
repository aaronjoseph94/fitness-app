// Owns: the Playwright setup for the e2e flows in e2e/ (SPEC §12 acceptance): one Chromium project at phone size
// (390×844) in Edmonton time, run one test at a time against the local Worker on :8799 started by e2e/server.mjs
// (web build + fresh D1 migrated and seeded into apps/worker/.wrangler/e2e). No LLM keys, so AI paths take their
// fallbacks. Locally: `pnpm exec playwright install chromium` once. Where a different Chromium is preinstalled (the cloud
// container: Playwright's own build is newer than /opt/pw-browsers), set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to it.
import { defineConfig } from '@playwright/test'

const PORT = 8799
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e',
  // One shared database and day: run the stories in order, one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    timezoneId: 'America/Edmonton',
    locale: 'en-CA',
    // The built PWA registers a service worker; keep it out so every run talks to the Worker directly.
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'phone', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'node e2e/server.mjs',
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
