// Owns: the /api scans route group (thin: validate via the shared contract, call module entry points).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { confirmScan, deleteScan, getScan, listScans, reextractScan, uploadScan } from '../modules/scans'

export function mountScansRoutes(app: App): void {
  route(app, endpoints.scans.upload, ({ query, body }, deps) => uploadScan(deps, { query, body }), { status: 201 })
  route(app, endpoints.scans.list, (_input, deps) => listScans(deps))
  route(app, endpoints.scans.get, ({ params }, deps) => getScan(deps, params.id))
  route(app, endpoints.scans.confirm, ({ params, body }, deps) => confirmScan(deps, params.id, body))
  route(app, endpoints.scans.extract, ({ params }, deps) => reextractScan(deps, params.id))
  route(app, endpoints.scans.remove, ({ params }, deps) => deleteScan(deps, params.id))
}
