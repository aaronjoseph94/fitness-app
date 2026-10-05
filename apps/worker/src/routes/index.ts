// Owns: mounting every /api route group onto the app. Each group file owns its routes and only calls module entry points.
import type { App } from '../env'

export function mountApiRoutes(_app: App): void {
  // Route groups are mounted here by the phase work packages, e.g. mountBodyRoutes(app).
}
