// Owns: keeping a week plan's fast_dates a mirror of the fast log (SPEC §8: "mid-week edits (… a moved fast) change the
// active row and are versioned like any plan change"). fast_logs is the only source of fast days (engine fastDay); a
// plan lists the fast days of its week so the week view and the planned sessions read them:
//   after any fast write (fasting.onFastsChanged), every active or proposed plan of a week ending today or later whose
//   fast_dates differ from the fast days in its week gets them; an active plan changes as one plan version
//   (plan.weekPlanVersion, same targets) in one batch, a proposed plan is updated in place.
import { addDays, isoWeek, today } from '@fitness/shared/engine'
import type { WeekPlanContent } from '@fitness/shared/schemas'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { week_plans } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { fastDaysIn } from '../../fasting'
import { runSoon } from '../../jobs'
import { weekPlanVersion } from '../../plan'
import { toWeekPlan } from './rows'

/** The fast days in the week starting `week_start`, sorted and unique. */
export async function weekFastDates(deps: Deps, week_start: string): Promise<string[]> {
  const days = await fastDaysIn(deps, { from: week_start, to: addDays(week_start, 6) })
  return [...new Set(days.map((d) => d.date))].sort()
}

export async function syncFastDates(deps: Deps): Promise<void> {
  const date = today(deps.now())
  const rows = await deps.db
    .select()
    .from(week_plans)
    .where(and(inArray(week_plans.status, ['active', 'proposed']), gte(week_plans.week_start, addDays(date, -6))))
  const byWeek = new Map<string, string[]>()
  for (const plan of rows.flatMap((r) => toWeekPlan(r) ?? [])) {
    if (!byWeek.has(plan.week_start)) byWeek.set(plan.week_start, await weekFastDates(deps, plan.week_start))
    const fast_dates = byWeek.get(plan.week_start)!
    const before = plan.plan.fast_dates
    if (before.length === fast_dates.length && before.every((d, i) => d === fast_dates[i])) continue

    const content: WeekPlanContent = { ...plan.plan, fast_dates }
    const now = deps.now().toISOString()
    const update = deps.db.update(week_plans).set({ plan: content, updated_at: now }).where(eq(week_plans.id, plan.id))
    if (plan.status !== 'active') {
      await update
      continue
    }
    const week = isoWeek(plan.week_start)
    const list = (ds: readonly string[]) => (ds.length ? ds.join(', ') : 'none')
    const v = await weekPlanVersion(deps, {
      week_start: plan.week_start,
      week_plan: { id: plan.id, plan: content },
      reason: `Fasts changed: week plan ${week} fast days ${list(before)} → ${list(fast_dates)}`,
      summary: `Week plan ${week}: fast days follow the fast log (${list(fast_dates)})`,
      extra: { week_plan_fasts: { id: plan.id, week_start: plan.week_start, from: before, to: fast_dates } },
    })
    await deps.db.batch([update, ...v.statements])
    runSoon(deps, v.job_id)
  }
}
