// Owns: the /api files route group — GET /api/files/:key behind our signed URL (route() decodes the key param).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { serveSignedFile } from '../modules/files'

export function mountFilesRoutes(app: App): void {
  route(app, endpoints.files.get, ({ params, query }, deps) => serveSignedFile(deps, { key: params.key, ...query }))
}
