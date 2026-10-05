// Owns: the /api day route group (thin: validate via the shared contract, call module entry points).
// GET /api/notes (endpoints.day.note) is mounted in routes/system.ts next to the notes module.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { days, getDay } from '../modules/day'
import { listEvents } from '../modules/events'

export function mountDayRoutes(app: App): void {
  route(app, endpoints.day.get, ({ params }, deps) => getDay(deps, params.date))
  route(app, endpoints.day.range, ({ query }, deps) => days(deps, query))
  route(app, endpoints.day.events, ({ query }, deps) => listEvents(deps, query))
}
