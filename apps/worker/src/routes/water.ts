// Owns: the /api water route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { deleteWater, listWater, logWater } from '../modules/water'

export function mountWaterRoutes(app: App): void {
  route(app, endpoints.water.create, ({ body }, deps) => logWater(deps, body), { status: 201 })
  route(app, endpoints.water.list, ({ query }, deps) => listWater(deps, query.date))
  route(app, endpoints.water.delete, ({ params }, deps) => deleteWater(deps, params.id))
}
