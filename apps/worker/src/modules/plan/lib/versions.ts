// Owns: writing plan versions — guard a batch of target changes, apply the accepted ones to the active targets, and
// build every write of one change as a single db.batch: deactivate old + insert new + the ai_events record + scheduled
// later steps as future proposals (one series) + the change carried into the active week plans (within the rails) +
// the rebuilt daily_targets (today … last materialised date) + a plan_reforecast job.
import {
  addDays,
  applyGuards,
  holdMacros,
  targetValue,
  today,
  weekdayOf,
  type GuardRule,
  type PlanTargetsLike,
  type TargetChange,
} from '@fitness/shared/engine'
import {
  Weekday,
  type Actor,
  type FieldChange,
  type PlanChange,
  type PlanDiff,
  type PlanTargets,
  type RejectedPlanChange,
  type ScheduledPlanChange,
  type Settings,
  type TargetField,
} from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { plan_versions, week_plans } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'
import { jobInsert } from '../../jobs'
import type { PlanContext, PlanVersionRow } from './context'
import { activeWeekPlans, computeTargetRows, targetHorizon, targetStatements, type StoredWeekPlan, type WeekOverride } from './targets'

export type RejectedChange = RejectedPlanChange & { rule: GuardRule }
export type ScheduledChange = ScheduledPlanChange

/** Guard outcome for a batch of plan changes, with proposals already built for the scheduled later steps. */
export interface GuardedChanges {
  accepted: PlanChange[]
  rejected: RejectedChange[]
  scheduled: ScheduledChange[]
  /** Inserts of the scheduled steps as pending proposals due `week_offset` weeks from today. */
  statements: BatchItem<'sqlite'>[]
}

type ReasonedTarget = TargetChange & { reason: string }

const FIELDS: readonly TargetField[] = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'water_ml', 'steps']

const toPlanChange = (c: ReasonedTarget): PlanChange => ({ field: c.field, weekday: c.weekday, from: c.from, to: c.to, reason: c.reason })

const label = (c: { field: string; weekday: string | null }) => `${c.weekday ?? 'daily'} ${c.field}`

/** How a batch is guarded beyond the actor (see guardChanges). */
export interface GuardOptions {
  /** The rolling 7-day kcal base (lib/window); absent → the active targets. */
  kcal_base?: PlanTargetsLike
  /** false when accepting a stored proposal: nothing is scheduled again; what does not fit now is `kcal_step`. */
  schedule_steps?: boolean
  /** The series the scheduled steps belong to when step 1 applies (its proposal or plan version id). */
  series_id?: string
}

/**
 * Run the guards (SPEC §9) over plan changes as `actor`. A target change's `from` is re-read from the active version;
 * ai/mcp kcal moves are measured over the rolling 7-day window (`kcal_base`). Scheduled steps (the rest of a kcal move
 * by ai/mcp, in ≤150 kcal steps) become pending proposals dated a week apart, all carrying one series_id: the caller's
 * (step 1 applied or proposed) or, when nothing applies now, the first scheduled step's own id.
 */
export function guardChanges(deps: Deps, ctx: PlanContext, changes: readonly PlanChange[], actor: Actor, opts: GuardOptions = {}): GuardedChanges {
  const result = applyGuards<ReasonedTarget>(
    changes.map((c) => ({ kind: 'target', field: c.field, weekday: c.weekday, from: c.from, to: c.to, reason: c.reason })),
    {
      actor,
      rails: ctx.settings,
      plan: ctx.active.targets,
      exercises: [],
      excluded_categories: [],
      planned_fast_dates: [],
      auto_apply_safe: ctx.settings.auto_apply_safe,
      kcal_base: opts.kcal_base,
      schedule_steps: opts.schedule_steps,
    },
  )
  const now = today(deps.now())
  const statements: BatchItem<'sqlite'>[] = []
  const ids = result.scheduled.map(() => crypto.randomUUID())
  const series_id = (result.accepted.length ? opts.series_id : undefined) ?? ids[0]
  const scheduled = result.scheduled.map(({ change, week_offset }, i) => {
    const step = toPlanChange(change)
    const due = addDays(now, 7 * week_offset)
    const { id, statement } = eventInsert(
      { ...deps, actor },
      {
        id: ids[i],
        kind: 'proposal',
        summary: `${label(step)} ${step.from} → ${step.to} (step ${week_offset + (result.accepted.length ? 1 : 0)}, due ${due})`,
        body: { kind: 'plan_change', changes: [step], series_id },
        date: due,
        proposal_status: 'pending',
      },
    )
    statements.push(statement)
    return { change: step, week_offset, due, proposal_id: id }
  })
  return {
    accepted: result.accepted.map((a) => toPlanChange(a.change)),
    rejected: result.rejected.map((r) => ({ change: toPlanChange(r.change), rule: r.rule, reason: r.reason })),
    scheduled,
    statements,
  }
}

/** targets with each change applied: weekday null → defaults[field] = to; else overrides[weekday][field] = to. */
export function applyChanges(targets: PlanTargets, changes: readonly PlanChange[]): PlanTargets {
  const next: PlanTargets = { defaults: { ...targets.defaults }, overrides: { ...targets.overrides } }
  for (const c of changes) {
    if (c.weekday === null) next.defaults[c.field] = c.to
    else next.overrides[c.weekday] = { ...next.overrides[c.weekday], [c.field]: c.to }
  }
  return next
}

/** One diff line per default or weekday override that differs between a and b (null = absent). */
export function diffTargets(a: PlanTargets, b: PlanTargets): PlanDiff {
  const diff: PlanDiff = []
  for (const field of FIELDS) {
    if (a.defaults[field] !== b.defaults[field]) diff.push({ field, weekday: null, from: a.defaults[field], to: b.defaults[field] })
  }
  for (const weekday of Weekday.options) {
    for (const field of FIELDS) {
      const from = a.overrides[weekday]?.[field] ?? null
      const to = b.overrides[weekday]?.[field] ?? null
      if (from !== to) diff.push({ field, weekday, from, to })
    }
  }
  return diff
}

const fieldChanges = (diff: PlanDiff): FieldChange[] =>
  diff.map((d) => ({
    path: d.weekday === null ? `targets.defaults.${d.field}` : `targets.overrides.${d.weekday}.${d.field}`,
    from: d.from,
    to: d.to,
  }))

export const describeDiff = (diff: PlanDiff) => diff.map((d) => `${label(d)} ${d.from ?? '—'} → ${d.to ?? '—'}`).join('; ')

/**
 * The materialised moves of one week (from today on) when `week` replaces its stored week plan: one diff line per
 * (date, field) that differs between `before` (stored state) and `after`, keyed by the date's weekday.
 */
function weekDiff(before: readonly NewTargetRow[], after: readonly NewTargetRow[]): PlanDiff {
  const next = new Map(after.map((r) => [r.date, r]))
  const diff: PlanDiff = []
  for (const b of before) {
    const a = next.get(b.date)
    if (!a) continue
    for (const field of FIELDS) if (b[field] !== a[field]) diff.push({ field, weekday: weekdayOf(b.date), from: b[field], to: a[field] })
  }
  return diff
}

type NewTargetRow = Awaited<ReturnType<typeof computeTargetRows>>[number]

const MACROS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] as const
const WEEK_WIDE = ['water_ml', 'steps'] as const
const LAST_DATE = '9999-12-31'

/**
 * Carry a plan-version change into the active week plans whose week ends on or after `date` (SPEC §8: mid-week edits
 * change the active row), since a date inside an active week plan takes its targets from it, not from the version:
 *   kcal / macros: targets[w][f] += eff(after, w, f) − eff(before, w, f), for each weekday dated `date` or later that is
 *     not one of the plan's fast dates; then kcal ≥ calorie_floor, protein ≥ protein_min, fat ≥ fat_min, all ≥ 0, and
 *     on every day the carry touches kcal ≤ calorie_ceiling and protein × 4 + fat × 9 ≤ kcal (engine holdMacros).
 *     A delta, not the new value, so the coach's per-day shape stays and a ≤150 kcal step stays a ≤150 kcal step.
 *   water_ml / steps (one value per week plan): = after.defaults[f] when the default moved. A weekday-only move can't
 *     be expressed in a week plan and is listed in `skipped` ("sat water_ml").
 * Returns only the week plans that changed, and each day the rails cut (`clamped`: "2026-10-10 kcal 1850 → 1700").
 */
export function carryIntoWeekPlans(
  weeks: readonly StoredWeekPlan[],
  before: PlanTargets,
  after: PlanTargets,
  rails: Pick<Settings, 'calorie_floor' | 'calorie_ceiling' | 'protein_min_g' | 'fat_min_g'>,
  date: string,
): { patched: StoredWeekPlan[]; skipped: string[]; clamped: string[] } {
  const skipped = new Set<string>()
  const clamped: string[] = []
  for (const w of Weekday.options)
    for (const f of WEEK_WIDE)
      if (targetValue(before, f, w) !== targetValue(after, f, w) && before.defaults[f] === after.defaults[f]) skipped.add(`${w} ${f}`)
  const min: Partial<Record<TargetField, number>> = { kcal: rails.calorie_floor, protein_g: rails.protein_min_g, fat_g: rails.fat_min_g }
  const patched: StoredWeekPlan[] = []
  for (const week of weeks) {
    let changed = false
    const plan = { ...week.plan, targets: { ...week.plan.targets } }
    for (const f of WEEK_WIDE)
      if (before.defaults[f] !== after.defaults[f] && plan[f] !== after.defaults[f]) {
        plan[f] = after.defaults[f]
        changed = true
      }
    Weekday.options.forEach((w, i) => {
      const day = addDays(week.week_start, i)
      if (day < date || plan.fast_dates.includes(day)) return
      const next = { ...plan.targets[w] }
      let moved = false
      for (const f of MACROS) {
        const delta = targetValue(after, f, w) - targetValue(before, f, w)
        if (delta === 0) continue
        next[f] = Math.max(next[f] + delta, min[f] ?? 0, 0)
        moved = true
      }
      if (!moved) return
      if (next.kcal > rails.calorie_ceiling) {
        clamped.push(`${day} kcal ${next.kcal} → ${rails.calorie_ceiling}`)
        next.kcal = rails.calorie_ceiling
      }
      const held = holdMacros(next, rails)
      for (const f of ['protein_g', 'fat_g'] as const)
        if (held[f] !== next[f]) {
          clamped.push(`${day} ${f} ${next[f]} → ${held[f]}`)
          next[f] = held[f]
        }
      plan.targets[w] = next
      changed = true
    })
    if (changed) patched.push({ ...week, plan })
  }
  return { patched, skipped: [...skipped], clamped }
}

/**
 * Every write of a new active version, as batch statements (callers may append their own before running them):
 *   UPDATE plan_versions SET active = 0 WHERE active = 1 · INSERT the new version (version = max + 1, active) ·
 *   INSERT ai_events 'change' (diff as FieldChanges + `extra`) · daily_targets for today … max(last, today + 14)
 *   rebuilt from the new targets · a queued plan_reforecast job (the forecast is carried over until it runs).
 * With `week` (a week plan applied or reverted) that week's targets come from `week.week_plan`, the rebuild reaches
 * at least the week's Sunday, and the diff is the week's materialised moves from today on; `rows` returns the rebuilt
 * daily_targets rows. Without it, a target change is also carried into the active week plans from today on
 * (carryIntoWeekPlans: UPDATE week_plans in the same batch), so the days they cover move with the version.
 */
export async function versionStatements(
  deps: Deps,
  ctx: PlanContext,
  input: {
    targets: PlanTargets
    reason: string
    created_by: Actor
    extra?: Record<string, unknown>
    week?: WeekOverride
    summary?: string
    /** The new version's id (default: a new UUID), e.g. the series id its scheduled steps already carry. */
    id?: string
    /** Extra statements for the same batch (e.g. withdrawing a series' pending steps on a revert). */
    also?: BatchItem<'sqlite'>[]
  },
): Promise<{ row: PlanVersionRow; statements: BatchItem<'sqlite'>[]; job_id: string; rows: NewTargetRow[] }> {
  const now = deps.now().toISOString()
  const date = today(deps.now())
  const id = input.id ?? crypto.randomUUID()
  const horizon = await targetHorizon(deps)
  const weekEnd = input.week ? addDays(input.week.week_start, 6) : null
  const carried = input.week
    ? { patched: [], skipped: [], clamped: [] }
    : carryIntoWeekPlans(await activeWeekPlans(deps, date, LAST_DATE), ctx.active.targets, input.targets, ctx.settings, date)
  const overrides: WeekOverride[] = input.week
    ? [input.week]
    : carried.patched.map((w) => ({ week_start: w.week_start, week_plan: w }))
  const rows = await computeTargetRows(deps, ctx, { from: date, to: weekEnd && weekEnd > horizon ? weekEnd : horizon }, { id, targets: input.targets }, overrides)
  let diff = diffTargets(ctx.active.targets, input.targets)
  if (input.week && weekEnd) {
    const from = input.week.week_start > date ? input.week.week_start : date
    const before = await computeTargetRows(deps, ctx, { from, to: weekEnd })
    diff = [...diff, ...weekDiff(before, rows)]
  }
  const row: PlanVersionRow = {
    id,
    version: ctx.max_version + 1,
    active: true,
    created_by: input.created_by,
    reason: input.reason,
    diff,
    targets: input.targets,
    forecast: ctx.active.forecast,
    created_at: now,
    updated_at: now,
  }
  const event = eventInsert(deps, {
    kind: 'change',
    summary: input.summary ?? `Plan v${row.version}: ${describeDiff(diff) || 'no target changed'}`,
    body: {
      entity: 'plan_versions',
      changes: fieldChanges(diff),
      version: row.version,
      ...input.extra,
      ...(carried.patched.length ? { week_plans_updated: carried.patched.map((w) => w.id) } : {}),
      ...(carried.skipped.length ? { week_plans_unchanged: carried.skipped } : {}),
      ...(carried.clamped.length ? { week_plans_clamped: carried.clamped } : {}),
    },
    date,
    plan_version_id: row.id,
  })
  const job = jobInsert(deps, { type: 'plan_reforecast', payload: { date }, priority: 1 })
  return {
    row,
    job_id: job.id,
    rows,
    statements: [
      deps.db.update(plan_versions).set({ active: false, updated_at: now }).where(eq(plan_versions.active, true)),
      deps.db.insert(plan_versions).values(row),
      event.statement,
      ...carried.patched.map((w) => deps.db.update(week_plans).set({ plan: w.plan, updated_at: now }).where(eq(week_plans.id, w.id))),
      ...targetStatements(deps, rows, 'replace'),
      ...(input.also ?? []),
      job.statement,
    ],
  }
}
