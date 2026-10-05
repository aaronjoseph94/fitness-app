// Owns: the /api export route group (thin: validate via the shared contract, call module entry points). An export page
// is sent as the JSON text SQLite built, so the Worker never re-serialises rows.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { exportManifest, exportTablePage, importFile, importTablePage } from '../modules/export'

export function mountExportRoutes(app: App): void {
  route(app, endpoints.export.manifest, (_input, deps) => exportManifest(deps))
  route(app, endpoints.export.table, async ({ query }, deps) => {
    const body = await exportTablePage(deps, query)
    return new Response(body, {
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  })
  route(app, endpoints.export.importTable, ({ body }, deps) => importTablePage(deps, body))
  route(app, endpoints.export.importFile, ({ query, body }, deps) => importFile(deps, query, body))
}
