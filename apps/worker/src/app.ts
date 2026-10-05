// Owns: composition of the Hono app — global middleware, the /api router and (later) /mcp. Routes live in src/routes/*.
import { Hono } from 'hono'
import type { AppEnv } from './env'

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('requestId', crypto.randomUUID())
    await next()
  })

  app.get('/api/health', async (c) => {
    const row = await c.env.DB.prepare('select 1 as ok').first<{ ok: number }>()
    return c.json({ ok: row?.ok === 1, tz: c.env.TZ_NAME })
  })

  app.notFound((c) => (c.req.path.startsWith('/api') ? c.json({ error: 'not_found' }, 404) : c.env.ASSETS.fetch(c.req.raw)))

  return app
}
