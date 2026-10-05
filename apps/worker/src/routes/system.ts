// Owns: the /api system route group — the health check (D1 reachable) and the dashboard note (GET /api/notes).
// GET /api/notes is endpoints.day.note in the contract; it is mounted here because the notes module is a logging-side
// module and routes/day.ts belongs to the day view.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { activeNote } from '../modules/notes'

export function mountSystemRoutes(app: App): void {
  route(app, endpoints.system.health, async (_, deps) => {
    const row = await deps.env.DB.prepare('select 1 as ok').first<{ ok: number }>()
    return { ok: row?.ok === 1, tz: deps.env.TZ_NAME }
  })
  route(app, endpoints.day.note, async (_, deps) => ({ note: await activeNote(deps) }))
}
