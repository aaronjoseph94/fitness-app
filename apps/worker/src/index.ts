// Owns: the Worker entry point — fetch (Hono app) and scheduled (the 5-minute cron: job sweep + local-time dispatch).
import { createApp } from './app'
import { runCron } from './cron'
import type { Env } from './env'
import { depsForCron } from './lib/deps'

const app = createApp()

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    await runCron(depsForCron(env, ctx))
  },
} satisfies ExportedHandler<Env>
