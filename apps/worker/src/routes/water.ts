// Owns: the /api water route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { logWater } from '../modules/water'

export function mountWaterRoutes(app: App): void {
  route(app, endpoints.water.create, ({ body }, deps) => logWater(deps, body), { status: 201 })
}
