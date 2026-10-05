// Owns: the /api ai route group — job status now; workout generation (phase 3) and Ask AI chat (phase 4) join here.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { getJob } from '../modules/jobs'

export function mountAiRoutes(app: App): void {
  route(app, endpoints.ai.job, ({ params }, deps) => getJob(deps, params.id))
}
