// Owns: DELETE /api/exclusions/:id (un-hide an exercise; :id is the exclusion's or the exercise's). Thin: the shared contract validates, the training module
// deletes. Part of the training route group; it may be folded into routes/training.ts.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { deleteExclusion } from '../modules/training'

export function mountExclusionRoutes(app: App): void {
  route(app, endpoints.training.deleteExclusion, ({ params }, deps) => deleteExclusion(deps, params.id))
}
