// Owns: composition of the Hono app — request id, auth on /api/*, the /api route groups, the JSON error body, and the
// fallthrough of every non-/api path to the static assets (the SPA). /mcp is mounted here in phase 4 with its own auth.
import { Hono } from 'hono'
import type { AppEnv } from './env'
import { auth } from './middleware/auth'
import { handleError } from './middleware/errors'
import { mountApiRoutes } from './routes'

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('requestId', c.req.header('cf-ray') ?? crypto.randomUUID())
    await next()
  })
  app.use('/api/*', auth())

  mountApiRoutes(app)

  app.notFound((c) =>
    c.req.path.startsWith('/api')
      ? c.json({ error: 'not_found', message: `No endpoint ${c.req.method} ${c.req.path}` }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
  )
  app.onError(handleError)

  return app
}
