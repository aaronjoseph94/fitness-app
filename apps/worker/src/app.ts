// Owns: composition of the Hono app — request id, auth on /api/*, the /api route groups, the JSON error body, the MCP
// endpoint with its OAuth endpoints, and the fallthrough of every other path to the static assets (the SPA).
// /mcp brings its own auth (static bearer or OAuth access token, middleware/mcp-auth.ts) and stays outside Access;
// its consent page /authorize is behind the same Access check as /api.
import { Hono } from 'hono'
import type { AppEnv } from './env'
import { auth } from './middleware/auth'
import { handleError } from './middleware/errors'
import { mountMcp } from './middleware/mcp-auth'
import { serveMcp } from './modules/mcp'
import { mountApiRoutes } from './routes'

export function createApp() {
  const app = new Hono<AppEnv>()

  app.use('*', async (c, next) => {
    c.set('requestId', c.req.header('cf-ray') ?? crypto.randomUUID())
    await next()
  })
  app.use('/api/*', auth())
  app.use('/authorize', auth())

  mountApiRoutes(app)
  mountMcp(app, serveMcp)

  app.notFound((c) =>
    c.req.path.startsWith('/api')
      ? c.json({ error: 'not_found', message: `No endpoint ${c.req.method} ${c.req.path}` }, 404)
      : c.env.ASSETS.fetch(c.req.raw),
  )
  app.onError(handleError)

  return app
}
