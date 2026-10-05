// Owns: checking a week plan against the rails (SPEC §9, through the engine's applyGuards) before it is stored or
// applied, and the muscle-score snapshot of each planned session:
//   week      fast dates and the scan date fall inside Monday … Sunday
//   targets   each weekday that is not a fast date: calorie floor ≤ kcal ≤ calorie ceiling, protein ≥ protein_min_g,
//             fat ≥ fat_min_g, protein × 4 + fat × 9 ≤ kcal (macro_energy); for ai/mcp a kcal move of more than 150 from last week's target for that weekday (last
//             week's active plan, else the active plan version) is cut to the first 150 kcal step and reported
//   sessions  every exercise in the allowed exercise set and in no excluded category; 12 ≤ Σ sets ≤ 28
//   fasts     fast_logs is the only source of fast days (engine fastDay: one date per fast, e.g. a 19:00 → 19:00 fast
//             makes the next day the fast day), so a fast date with no planned fast there is rejected (plan it with
//             plan_fast first: planFast holds the monthly cap), and the week's planned fast days missing from the plan
//             are added (adjusted); fast_dates then mirror the fast log
// A rejected issue means the plan must not be stored or applied; adjusted issues describe the plan that is returned.
import { addDays, applyGuards, KCAL_STEP, muscleScores, type PlanTargetsLike, type TargetChange } from '@fitness/shared/engine'
import {
  Weekday,
  type Actor,
  type WeekPlanContent,
  type WeekPlanContentInput,
  type WeekPlanIssue,
  type WeekPlanSession,
} from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { guardContext, guardWorkout, loadLibrary, type Library } from '../../training'
import { weekFastDates } from './fasts'
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
  const requested = [...new Set(input.plan.fast_dates)].sort()

  for (const d of requested)
    if (!inWeek(d)) rejected.push({ where: 'fast_dates', rule: 'outside_week', reason: `Fast date ${d} is not in the week ${week_start} – ${end}` })
  if (input.plan.scan_date && !inWeek(input.plan.scan_date))
    rejected.push({ where: 'scan_date', rule: 'outside_week', reason: `Scan date ${input.plan.scan_date} is not in the week ${week_start} – ${end}` })

  const hasSessions = Weekday.options.some((w) => input.plan.sessions[w] !== null)
  const library = hasSessions ? await loadLibrary(deps) : EMPTY_LIBRARY
  const [ctx, fast_dates] = await Promise.all([guardContext(deps, library, actor), weekFastDates(deps, week_start)])
  const baseline = await lastWeekTargets(deps, week_start, ctx.plan)

  // Fasts: the plan's fast_dates mirror the fast log's fast days in this week.
  const listed = (ds: readonly string[]) => (ds.length ? ds.join(', ') : 'none')
  for (const d of requested.filter((d) => inWeek(d) && !fast_dates.includes(d)))
    rejected.push({
      where: 'fast_dates',
      rule: 'fast_not_planned',
      reason: `No planned fast makes ${d} a fast day (this week's fast days: ${listed(fast_dates)}); plan the fast first with plan_fast — a fast from 19:00 makes the next day the fast day`,
    })
  const added = fast_dates.filter((d) => !requested.includes(d))
  if (added.length)
    adjusted.push({ where: 'fast_dates', rule: 'fast_dates_mirror', reason: `Planned fasts make ${listed(added)} fast day(s) this week; added to the plan` })

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

  return { plan: { ...input.plan, targets, sessions, fast_dates }, rejected, adjusted }
}
