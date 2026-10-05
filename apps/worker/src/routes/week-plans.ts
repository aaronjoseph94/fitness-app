// Owns: the /api week-plans route group (thin: validate via the shared contract, call the week-plans module).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { applyWeekPlan, getWeekPlan, listWeekPlans, proposeWeekPlan, rejectWeekPlan, revertWeekPlan } from '../modules/week-plans'

export function mountWeekPlansRoutes(app: App): void {
  route(app, endpoints.weekPlans.get, ({ query }, deps) => getWeekPlan(deps, query.week_start))
  route(app, endpoints.weekPlans.list, ({ query }, deps) => listWeekPlans(deps, query))
  route(app, endpoints.weekPlans.propose, ({ body }, deps) => proposeWeekPlan(deps, body))
  route(app, endpoints.weekPlans.apply, ({ params }, deps) => applyWeekPlan(deps, params.id))
  route(app, endpoints.weekPlans.revert, ({ params }, deps) => revertWeekPlan(deps, params.id))
  route(app, endpoints.weekPlans.reject, ({ params }, deps) => rejectWeekPlan(deps, params.id))
}
