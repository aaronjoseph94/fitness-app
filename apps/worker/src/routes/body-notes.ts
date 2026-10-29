// Owns: the /api body-notes route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { activeBodyNotes, logBodyNote, resolveBodyNote } from '../modules/body-notes'

export function mountBodyNotesRoutes(app: App): void {
  route(app, endpoints.bodyNotes.active, (_, deps) => activeBodyNotes(deps))
  route(
    app,
    endpoints.bodyNotes.create,
    async ({ body }, deps) => {
      const { before: _before, ...note } = await logBodyNote(deps, body)
      return note
    },
    { status: 201 },
  )
  route(app, endpoints.bodyNotes.resolve, ({ params, body }, deps) => resolveBodyNote(deps, params.id, body))
}
