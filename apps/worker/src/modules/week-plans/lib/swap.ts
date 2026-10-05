// Owns: carrying a template swap into the planned sessions copied from that template (SPEC §8: "mid-week edits (a
// swapped session …) change the active row and are versioned like any plan change"). Sessions are snapshots, so a
// swap written to a template (Ask AI / Claude swap_template_exercise, apply_review exercise_swap, an accepted swap
// proposal) would otherwise leave this week's planned session — what Start logs — on the old exercise:
//   in the active and proposed week plans of weeks ending today or later, each session with that template_id dated
//   today or later that holds from_exercise_id (and not already to_exercise_id) gets to_exercise_id in its place
//   (sets, reps, rest kept; target load cleared: another lift) and fresh muscle scores. An active plan changes as
//   one plan version (plan.weekPlanVersion, same targets) in one batch; a proposed plan is updated in place.
import { addDays, isoWeek, muscleScores, today } from '@fitness/shared/engine'
import { Weekday, type WeekPlanContent } from '@fitness/shared/schemas'
import { and, eq, gte, inArray } from 'drizzle-orm'
import { week_plans } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { runSoon } from '../../jobs'
import { weekPlanVersion } from '../../plan'
import { loadLibrary, type Library, type SwapInput } from '../../training'
import { toWeekPlan } from './rows'

export async function swapInWeekPlans(deps: Deps, swap: SwapInput): Promise<void> {
  const date = today(deps.now())
  const rows = await deps.db
    .select()
    .from(week_plans)
    .where(and(inArray(week_plans.status, ['active', 'proposed']), gte(week_plans.week_start, addDays(date, -6))))
  let library: Library | null = null
  for (const plan of rows.flatMap((r) => toWeekPlan(r) ?? [])) {
    const sessions = { ...plan.plan.sessions }
    let changed = false
    for (const [i, weekday] of Weekday.options.entries()) {
      const s = sessions[weekday]
      if (!s || s.template_id !== swap.template_id || addDays(plan.week_start, i) < date) continue
      const ids = s.exercises.map((e) => e.exercise_id)
      if (!ids.includes(swap.from_exercise_id) || ids.includes(swap.to_exercise_id)) continue
      library ??= await loadLibrary(deps)
      const exercises = s.exercises.map((e) =>
        e.exercise_id === swap.from_exercise_id ? { ...e, exercise_id: swap.to_exercise_id, target_load_kg: null } : e,
      )
      const tagged = exercises.flatMap((e) => {
        const tags = library!.byId.get(e.exercise_id)
        return tags ? [{ primary_muscles: tags.primary_muscles, secondary_muscles: tags.secondary_muscles, sets: e.sets }] : []
      })
      sessions[weekday] = { ...s, exercises, muscle_scores: muscleScores(tagged) }
      changed = true
    }
    if (!changed) continue

    const content: WeekPlanContent = { ...plan.plan, sessions }
    const now = deps.now().toISOString()
    const update = deps.db.update(week_plans).set({ plan: content, updated_at: now }).where(eq(week_plans.id, plan.id))
    if (plan.status !== 'active') {
      await update
      continue
    }
    const week = isoWeek(plan.week_start)
    const v = await weekPlanVersion(deps, {
      week_start: plan.week_start,
      week_plan: { id: plan.id, plan: content },
      reason: `Exercise swap carried into week plan ${week}`,
      summary: `Week plan ${week}: the planned sessions from this template follow the exercise swap`,
      extra: { week_plan_swap: { id: plan.id, week_start: plan.week_start, ...swap } },
    })
    await deps.db.batch([update, ...v.statements])
    runSoon(deps, v.job_id)
  }
}
