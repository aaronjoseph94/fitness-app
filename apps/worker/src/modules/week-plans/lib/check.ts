// Owns: checking a week plan against the rails (SPEC §9, through the engine's applyGuards) before it is stored or
// applied, and the muscle-score snapshot of each planned session:
//   week      fast dates and the scan date fall inside Monday … Sunday
//   targets   each weekday that is not a fast date: calorie floor ≤ kcal ≤ calorie ceiling, protein ≥ protein_min_g,
//             fat ≥ fat_min_g; for ai/mcp a kcal move of more than 150 from last week's target for that weekday (last
//             week's active plan, else the active plan version) is cut to the first 150 kcal step and reported
//   sessions  every exercise in the allowed exercise set and in no excluded category; 12 ≤ Σ sets ≤ 28
//   fasts     fasts in each calendar month (stored ones + this plan's) ≤ fasts_per_month
// A rejected issue means the plan must not be stored or applied; adjusted issues describe the plan that is returned.
import { addDays, applyGuards, KCAL_STEP, localDate, muscleScores, type FastChange, type PlanTargetsLike, type TargetChange } from '@fitness/shared/engine'
import {
  Weekday,
  type Actor,
  type WeekPlanContent,
  type WeekPlanContentInput,
  type WeekPlanIssue,
  type WeekPlanSession,
} from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { listFasts } from '../../fasting'
import { guardContext, guardWorkout, loadLibrary, type Library } from '../../training'
import { listPlans } from './rows'

export interface CheckedPlan {
  plan: WeekPlanContent
  rejected: WeekPlanIssue[]
  adjusted: WeekPlanIssue[]
}

/** Guard fields per weekday (carbs are the remainder and fibre has no rail). */
const GUARDED = ['kcal', 'protein_g', 'fat_g'] as const

const EMPTY_LIBRARY: Library = { exercises: [], byId: new Map(), excluded_categories: [], equipment: [] }

const fmt = (n: number) => Math.round(n).toLocaleString('en-CA')

/** The last day of `date`'s calendar month. */
function monthEnd(date: string): string {
  const [y, m] = date.split('-').map(Number) as [number, number]
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
  return addDays(next, -1)
}

/**
 * Last week's targets per weekday as plan targets: the active plan version, with each weekday of last week's active
 * week plan (that was not a fast date there) as an override. The ±150 kcal step is measured from here.
 */
async function lastWeekTargets(deps: Deps, week_start: string, plan: PlanTargetsLike): Promise<PlanTargetsLike> {
  const prev = addDays(week_start, -7)
  const [last] = await listPlans(deps, { week_start: prev, status: 'active' })
  if (!last) return plan
  const overrides: PlanTargetsLike['overrides'] = { ...plan.overrides }
  Weekday.options.forEach((w, i) => {
    if (!last.plan.fast_dates.includes(addDays(prev, i))) overrides[w] = { ...overrides[w], ...last.plan.targets[w] }
  })
  return { defaults: plan.defaults, overrides }
}

export async function checkWeekPlan(
  deps: Deps,
  input: { week_start: string; plan: WeekPlanContentInput; actor: Actor },
): Promise<CheckedPlan> {
  const { week_start, actor } = input
  const end = addDays(week_start, 6)
  const rejected: WeekPlanIssue[] = []
  const adjusted: WeekPlanIssue[] = []
  const inWeek = (d: string) => d >= week_start && d <= end
  const fast_dates = [...new Set(input.plan.fast_dates)].sort()

  for (const d of fast_dates)
    if (!inWeek(d)) rejected.push({ where: 'fast_dates', rule: 'outside_week', reason: `Fast date ${d} is not in the week ${week_start} – ${end}` })
  if (input.plan.scan_date && !inWeek(input.plan.scan_date))
    rejected.push({ where: 'scan_date', rule: 'outside_week', reason: `Scan date ${input.plan.scan_date} is not in the week ${week_start} – ${end}` })

  const hasSessions = Weekday.options.some((w) => input.plan.sessions[w] !== null)
  const library = hasSessions ? await loadLibrary(deps) : EMPTY_LIBRARY
  const [ctx, stored] = await Promise.all([
    guardContext(deps, library, actor),
    listFasts(deps, { from: `${week_start.slice(0, 7)}-01`, to: monthEnd(end) }),
  ])
  const baseline = await lastWeekTargets(deps, week_start, ctx.plan)

  // Targets: one guard batch over every weekday that is not a fast date.
  const targets = structuredClone(input.plan.targets)
  const changes: (TargetChange & { requested: number })[] = []
  Weekday.options.forEach((weekday, i) => {
    if (fast_dates.includes(addDays(week_start, i))) return
    for (const field of GUARDED) changes.push({ kind: 'target', field, weekday, from: 0, to: targets[weekday][field], requested: targets[weekday][field] })
  })
  const guarded = applyGuards(changes, { ...ctx, plan: baseline, actor })
  for (const r of guarded.rejected) rejected.push({ where: `${r.change.weekday}.${r.change.field}`, rule: r.rule, reason: r.reason })
  for (const { change } of guarded.accepted) {
    // Only a kcal move is ever split into steps; the other guarded fields pass or fail as written.
    if (change.to === change.requested || change.field !== 'kcal' || !change.weekday) continue
    targets[change.weekday].kcal = change.to
    adjusted.push({
      where: `${change.weekday}.${change.field}`,
      rule: 'kcal_step',
      reason: `${change.weekday} kcal ${fmt(change.from)} → ${fmt(change.requested)} moves more than ${KCAL_STEP} kcal in one week; set to ${fmt(change.to)} (the rest can follow next week)`,
    })
  }

  // Sessions: the workout guards, then the muscle-score snapshot from the library tags.
  const sessions = {} as WeekPlanContent['sessions']
  for (const weekday of Weekday.options) {
    const s = input.plan.sessions[weekday]
    if (!s) {
      sessions[weekday] = null
      continue
    }
    for (const r of guardWorkout(ctx, s.exercises).rejected) rejected.push({ where: `${weekday}.session`, rule: r.rule, reason: `${s.name}: ${r.reason}` })
    const tagged = s.exercises.flatMap((e) => {
      const tags = library.byId.get(e.exercise_id)
      return tags ? [{ primary_muscles: tags.primary_muscles, secondary_muscles: tags.secondary_muscles, sets: e.sets }] : []
    })
    sessions[weekday] = { template_id: s.template_id, name: s.name, exercises: s.exercises, muscle_scores: muscleScores(tagged) } satisfies WeekPlanSession
  }

  // Fasts: the fasting pattern over each month the week touches.
  const fasts = applyGuards<FastChange>(
    fast_dates.map((date) => ({ kind: 'fast', date })),
    { ...ctx, actor, planned_fast_dates: stored.map((f) => localDate(f.started_at)) },
  )
  for (const r of fasts.rejected) rejected.push({ where: 'fast_dates', rule: r.rule, reason: r.reason })

  return { plan: { ...input.plan, targets, sessions, fast_dates }, rejected, adjusted }
}
