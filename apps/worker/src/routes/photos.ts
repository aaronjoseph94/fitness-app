// Owns: the /api photos route group (thin: validate via the shared contract, call module entry points).
// POST /api/photos takes the image as an octet-stream body (route() hands Binary bodies over as an ArrayBuffer).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { listPhotos, removePhoto, uploadPhoto } from '../modules/photos'

export function mountPhotosRoutes(app: App): void {
  route(app, endpoints.photos.upload, ({ query, body }, deps) => uploadPhoto(deps, { ...query, image: body }), { status: 201 })
  route(app, endpoints.photos.list, ({ query }, deps) => listPhotos(deps, query))
  route(app, endpoints.photos.remove, ({ params }, deps) => removePhoto(deps, params.id))
}
