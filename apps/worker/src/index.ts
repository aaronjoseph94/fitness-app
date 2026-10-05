// Owns: the Worker entry point — fetch (Hono app) and scheduled (the 5-minute cron sweep).
import { createApp } from './app'
import type { Env } from './env'

const app = createApp()

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Env, _ctx: ExecutionContext) {
    // Cron dispatcher is added in phase 1 (src/cron.ts).
  },
} satisfies ExportedHandler<Env>
