// Owns: the /api fasting route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { cancelFast, endFast, listFasts, moveFast, planFast, startFast } from '../modules/fasting'

export function mountFastingRoutes(app: App): void {
  route(app, endpoints.fasting.start, ({ body }, deps) => startFast(deps, body), { status: 201 })
  route(app, endpoints.fasting.end, ({ params, body }, deps) => endFast(deps, params.id, body))
  route(app, endpoints.fasting.plan, ({ body }, deps) => planFast(deps, body), { status: 201 })
  route(app, endpoints.fasting.list, ({ query }, deps) => listFasts(deps, query))
  route(app, endpoints.fasting.move, ({ params, body }, deps) => moveFast(deps, params.id, body))
  route(app, endpoints.fasting.cancel, ({ params }, deps) => cancelFast(deps, params.id))
}
