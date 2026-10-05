// Owns: the /api body route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { getTrend, logMeasurements, logWeighIn, updateWeighIn } from '../modules/body'

export function mountBodyRoutes(app: App): void {
  route(app, endpoints.body.createWeight, ({ body }, deps) => logWeighIn(deps, body), { status: 201 })
  route(app, endpoints.body.updateWeight, ({ params, body }, deps) => updateWeighIn(deps, params.id, body))
  route(app, endpoints.body.createMeasurements, ({ body }, deps) => logMeasurements(deps, body), { status: 201 })
  route(app, endpoints.body.trend, ({ query }, deps) => getTrend(deps, query))
}
