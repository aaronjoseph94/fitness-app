// Owns: mounting every /api route group onto the app. Each group file owns its routes and only calls module entry points.
import type { App } from '../env'
import { mountBodyRoutes } from './body'
import { mountDayRoutes } from './day'
import { mountFastingRoutes } from './fasting'
import { mountFilesRoutes } from './files'
import { mountHealthRoutes } from './health'
import { mountNutritionRoutes } from './nutrition'
import { mountPlanRoutes } from './plan'
import { mountSettingsRoutes } from './settings'
import { mountSystemRoutes } from './system'
import { mountWaterRoutes } from './water'

export function mountApiRoutes(app: App): void {
  mountSystemRoutes(app)
  mountSettingsRoutes(app)
  mountDayRoutes(app)
  mountBodyRoutes(app)
  mountNutritionRoutes(app)
  mountWaterRoutes(app)
  mountFastingRoutes(app)
  mountHealthRoutes(app)
  mountPlanRoutes(app)
  mountFilesRoutes(app)
  // Later phases add: training, scans, photos, reviews, weekPlans, ai, export, push.
}
