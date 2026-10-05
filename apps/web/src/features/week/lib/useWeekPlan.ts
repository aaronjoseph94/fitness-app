// Owns: the week-plan reads and writes the web makes — the week view (GET /api/week-plans/view) for the week holding a
// date, the plans still proposed from a week on, Accept (POST /api/week-plans/:id/apply) and Revert (…/revert), which
// mark every read that shows targets or planned sessions stale.
import { endpoints } from '@fitness/shared/api'
import { weekStart } from '@fitness/shared/engine'
import type { LocalDate, WeekPlan } from '@fitness/shared/schemas'
import { useApiMutation, useApiQuery } from '../../../api'

/** The week view for the week holding `date`: active and proposed plan, this week's and last week's actuals. */
export function useWeekPlan(date: LocalDate) {
  return useApiQuery(endpoints.weekPlans.get, { query: { week_start: weekStart(date) } }, { staleTime: 60_000 })
}

/** Proposed plans for the week holding `date` and later weeks, soonest week first. */
export function useProposedWeekPlans(date: LocalDate) {
  const from = weekStart(date)
  return useApiQuery(
    endpoints.weekPlans.list,
    { query: { status: 'proposed' } },
    {
      staleTime: 60_000,
      select: (plans: WeekPlan[]) =>
        plans.filter((p) => p.week_start >= from).sort((a, b) => a.week_start.localeCompare(b.week_start) || b.updated_at.localeCompare(a.updated_at)),
    },
  )
}

/** Reads that show a week's targets or planned sessions. */
const STALE_AFTER_SWITCH = [endpoints.weekPlans.get, endpoints.weekPlans.list, endpoints.day.get, endpoints.day.range, endpoints.plan.get, endpoints.plan.versions]

/** Accept a proposed plan: it becomes the week's active plan and rebuilds that week's daily targets. */
export function useApplyWeekPlan() {
  return useApiMutation(endpoints.weekPlans.apply, { invalidates: STALE_AFTER_SWITCH })
}

/** Revert the week's active plan: the plan it replaced comes back (or the everyday targets). */
export function useRevertWeekPlan() {
  return useApiMutation(endpoints.weekPlans.revert, { invalidates: STALE_AFTER_SWITCH })
}
