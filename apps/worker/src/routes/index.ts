// Owns: mounting every /api route group onto the app. Each group file owns its routes and only calls module entry points.
import type { App } from '../env'
import { mountAiRoutes } from './ai'
import { mountBodyRoutes } from './body'
import { mountDayRoutes } from './day'
import { mountExportRoutes } from './export'
import { mountFastingRoutes } from './fasting'
import { mountFilesRoutes } from './files'
import { mountHealthRoutes } from './health'
import { mountNutritionRoutes } from './nutrition'
import { mountPhotosRoutes } from './photos'
import { mountPlanRoutes } from './plan'
import { mountPushRoutes } from './push'
import { mountReviewsRoutes } from './reviews'
import { mountScansRoutes } from './scans'
import { mountSettingsRoutes } from './settings'
import { mountSystemRoutes } from './system'
import { mountTrainingRoutes } from './training'
import { mountWaterRoutes } from './water'
import { mountWeekPlansRoutes } from './week-plans'

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
  mountTrainingRoutes(app)
  mountAiRoutes(app)
  mountScansRoutes(app)
  mountReviewsRoutes(app)
  mountWeekPlansRoutes(app)
  mountPhotosRoutes(app)
  mountExportRoutes(app)
  mountPushRoutes(app)
}
