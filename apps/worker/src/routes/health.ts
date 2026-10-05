// Owns: the /api health-inputs route group (thin: validate via the shared contract, call module entry points).
// /api/ingest/health is authenticated by its bearer token in middleware/auth.ts, not by Access.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { importHealth, ingestHealth, logSleep, logSteps } from '../modules/health'

export function mountHealthRoutes(app: App): void {
  route(app, endpoints.health.createSleep, ({ body }, deps) => logSleep(deps, body), { status: 201 })
  route(app, endpoints.health.createSteps, ({ body }, deps) => logSteps(deps, body), { status: 201 })
  route(app, endpoints.health.importHealth, ({ body }, deps) => importHealth(deps, body))
  route(app, endpoints.health.ingest, ({ body }, deps) => ingestHealth(deps, body))
}
