// Owns: the /api plan route group (thin: validate via the shared contract, call module entry points).
// Week plans (GET/POST /api/week-plans, POST /api/week-plans/:id/apply) arrive with phase 4.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { acceptProposal, getActivePlan, listVersions, rejectProposal, restoreVersion } from '../modules/plan'

export function mountPlanRoutes(app: App): void {
  route(app, endpoints.plan.get, (_, deps) => getActivePlan(deps))
  route(app, endpoints.plan.versions, (_, deps) => listVersions(deps))
  route(app, endpoints.plan.restoreVersion, ({ params }, deps) => restoreVersion(deps, params.id))
  route(app, endpoints.plan.acceptProposal, ({ params }, deps) => acceptProposal(deps, params.id))
  route(app, endpoints.plan.rejectProposal, ({ params }, deps) => rejectProposal(deps, params.id))
}
