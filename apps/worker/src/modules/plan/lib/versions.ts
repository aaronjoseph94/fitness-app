// Owns: writing plan versions — guard a batch of target changes, apply the accepted ones to the active targets, and
// build every write of one change as a single db.batch: deactivate old + insert new + the ai_events record + scheduled
// later steps as future proposals + the rebuilt daily_targets (today … last materialised date) + a plan_reforecast job.
import { addDays, applyGuards, today, weekdayOf, type GuardRule, type TargetChange } from '@fitness/shared/engine'
import { Weekday, type Actor, type FieldChange, type PlanChange, type PlanDiff, type PlanTargets, type TargetField } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { plan_versions } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'
import { jobInsert } from '../../jobs'
import type { PlanContext, PlanVersionRow } from './context'
import { computeTargetRows, targetHorizon, targetStatements, type WeekOverride } from './targets'

export type RejectedChange = { change: PlanChange; rule: GuardRule; reason: string }
export type ScheduledChange = { change: PlanChange; week_offset: number; due: string; proposal_id: string }

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

/**
 * Run the guards (SPEC §9) over plan changes as `actor`. A target change's `from` is re-read from the active version.
 * Scheduled steps (a >150 kcal move by ai/mcp split into ≤150 kcal steps) become pending proposals dated a week apart.
 */
export function guardChanges(deps: Deps, ctx: PlanContext, changes: readonly PlanChange[], actor: Actor): GuardedChanges {
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
    },
  )
  const now = today(deps.now())
  const statements: BatchItem<'sqlite'>[] = []
  const scheduled = result.scheduled.map(({ change, week_offset }) => {
    const step = toPlanChange(change)
    const due = addDays(now, 7 * week_offset)
    const { id, statement } = eventInsert(
      { ...deps, actor },
      {
        kind: 'proposal',
        summary: `${label(step)} ${step.from} → ${step.to} (step ${week_offset + 1}, due ${due})`,
        body: { kind: 'plan_change', changes: [step] },
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

/**
 * Every write of a new active version, as batch statements (callers may append their own before running them):
 *   UPDATE plan_versions SET active = 0 WHERE active = 1 · INSERT the new version (version = max + 1, active) ·
 *   INSERT ai_events 'change' (diff as FieldChanges + `extra`) · daily_targets for today … max(last, today + 14)
 *   rebuilt from the new targets · a queued plan_reforecast job (the forecast is carried over until it runs).
 * With `week` (a week plan applied or reverted) that week's targets come from `week.week_plan`, the rebuild reaches
 * at least the week's Sunday, and the diff is the week's materialised moves from today on; `rows` returns the rebuilt
 * daily_targets rows.
 */
export async function versionStatements(
  deps: Deps,
  ctx: PlanContext,
  input: { targets: PlanTargets; reason: string; created_by: Actor; extra?: Record<string, unknown>; week?: WeekOverride; summary?: string },
): Promise<{ row: PlanVersionRow; statements: BatchItem<'sqlite'>[]; job_id: string; rows: NewTargetRow[] }> {
  const now = deps.now().toISOString()
  const date = today(deps.now())
  const id = crypto.randomUUID()
  const horizon = await targetHorizon(deps)
  const weekEnd = input.week ? addDays(input.week.week_start, 6) : null
  const rows = await computeTargetRows(deps, ctx, { from: date, to: weekEnd && weekEnd > horizon ? weekEnd : horizon }, { id, targets: input.targets }, input.week)
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
    body: { entity: 'plan_versions', changes: fieldChanges(diff), version: row.version, ...input.extra },
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
      ...targetStatements(deps, rows, 'replace'),
      job.statement,
    ],
  }
}
