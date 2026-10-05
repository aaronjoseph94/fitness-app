// Owns: materialising `daily_targets` — the engine's materialiseTargets fed with the active plan version, the rails,
// planned/actual fast dates and active week plans, written as chunked upserts (≤ 100 bound params per statement).
import { addDays, daysBetween, localDate, materialiseTargets as computeTargets, today, type WeekPlanLike } from '@fitness/shared/engine'
import { WeekPlanContent, type DailyTargets, type PlanTargets } from '@fitness/shared/schemas'
import { and, between, count, eq, gte, lte, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { daily_targets, fast_logs, profile, week_plans, type NewRow, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { loadPlanContext, type PlanContext } from './context'

export type DailyTargetsRow = Row<typeof daily_targets>

/** daily_targets has 15 columns, all bound: floor(100 / 15) = 6 rows per statement. */
const ROWS_PER_STATEMENT = 6
const HOUR_MS = 3_600_000

export function chunk<T>(rows: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size))
  return out
}

/**
 * Local dates covered by fasts that touch from..to. A fast covers [started_at, ended_at ?? started_at + fast_hours),
 * half-open, so a fast from midnight to midnight is one fast day; planned fasts not yet begun count (they are the plan).
 */
async function fastDates(deps: Deps, from: string, to: string, fastHours: number): Promise<string[]> {
  const rows = await deps.db
    .select({ started_at: fast_logs.started_at, ended_at: fast_logs.ended_at })
    .from(fast_logs)
    .where(between(fast_logs.start_date, addDays(from, -3), to))
  const dates = new Set<string>()
  for (const f of rows) {
    const startMs = Date.parse(f.started_at)
    const endMs = f.ended_at ? Date.parse(f.ended_at) : startMs + fastHours * HOUR_MS
    const first = localDate(startMs)
    const last = localDate(Math.max(startMs, endMs - 1))
    for (let d = first; d <= last; d = addDays(d, 1)) if (d >= from && d <= to) dates.add(d)
  }
  return [...dates]
}

/** Active week plans whose week overlaps from..to (phase 4 writes them); rows whose plan fails its schema are skipped. */
async function activeWeekPlans(deps: Deps, from: string, to: string): Promise<WeekPlanLike[]> {
  const rows = await deps.db
    .select({ id: week_plans.id, week_start: week_plans.week_start, plan: week_plans.plan })
    .from(week_plans)
    .where(and(eq(week_plans.status, 'active'), between(week_plans.week_start, addDays(from, -6), to)))
  return rows.flatMap((r) => {
    const plan = WeekPlanContent.safeParse(r.plan)
    return plan.success ? [{ id: r.id, week_start: r.week_start, plan: plan.data }] : []
  })
}

/**
 * One week whose targets come from `week_plan` instead of the stored active week plan (applying or reverting a week
 * plan inside one batch, before the row is active); null hands the week back to the plan version.
 */
export type WeekOverride = { week_start: string; week_plan: WeekPlanLike | null }

/** Targets for from..to computed (not written) from `version` (default: the active one) and the active week plans. */
export async function computeTargetRows(
  deps: Deps,
  ctx: PlanContext,
  range: { from: string; to: string },
  version: { id: string; targets: PlanTargets } = ctx.active,
  week?: WeekOverride,
): Promise<NewRow<typeof daily_targets>[]> {
  if (range.to < range.from) return []
  const [fasts, stored] = await Promise.all([
    fastDates(deps, range.from, range.to, ctx.settings.fast_hours),
    activeWeekPlans(deps, range.from, range.to),
  ])
  const weeks = week ? [...stored.filter((w) => w.week_start !== week.week_start), ...(week.week_plan ? [week.week_plan] : [])] : stored
  const now = deps.now().toISOString()
  return computeTargets({
    from: range.from,
    to: range.to,
    plan_version: version,
    rails: ctx.settings,
    training_days: ctx.settings.training_days,
    fast_dates: fasts,
    week_plans: weeks,
  }).map(({ training_load: _load, ...t }) => ({ ...t, id: crypto.randomUUID(), created_at: now, updated_at: now }))
}

/** Upserts by date: 'replace' overwrites a date's targets, 'fill' only inserts dates that have none. */
export function targetStatements(deps: Deps, rows: NewRow<typeof daily_targets>[], mode: 'replace' | 'fill'): BatchItem<'sqlite'>[] {
  return chunk(rows, ROWS_PER_STATEMENT).map((part) => {
    const insert = deps.db.insert(daily_targets).values(part)
    if (mode === 'fill') return insert.onConflictDoNothing({ target: daily_targets.date })
    return insert.onConflictDoUpdate({
      target: daily_targets.date,
      set: {
        plan_version_id: sql`excluded.plan_version_id`,
        week_plan_id: sql`excluded.week_plan_id`,
        kcal: sql`excluded.kcal`,
        protein_g: sql`excluded.protein_g`,
        carbs_g: sql`excluded.carbs_g`,
        fat_g: sql`excluded.fat_g`,
        fibre_g: sql`excluded.fibre_g`,
        water_ml: sql`excluded.water_ml`,
        steps: sql`excluded.steps`,
        is_fast_day: sql`excluded.is_fast_day`,
        training_planned: sql`excluded.training_planned`,
        updated_at: sql`excluded.updated_at`,
      },
    })
  })
}

export async function runStatements(deps: Deps, statements: BatchItem<'sqlite'>[]): Promise<void> {
  const [first, ...rest] = statements
  if (first) await deps.db.batch([first, ...rest])
}

/** How far targets are materialised: max(last date with targets, today + 14). */
export async function targetHorizon(deps: Deps): Promise<string> {
  const ahead = addDays(today(deps.now()), 14)
  const last = await lastTargetDate(deps)
  return last && last > ahead ? last : ahead
}

/** The last date that has targets (null when none). */
export async function lastTargetDate(deps: Deps): Promise<string | null> {
  const [row] = await deps.db.select({ last: sql<string | null>`max(${daily_targets.date})` }).from(daily_targets)
  return row?.last ?? null
}

export function toDailyTargets(row: DailyTargetsRow): DailyTargets {
  return {
    date: row.date,
    plan_version_id: row.plan_version_id,
    week_plan_id: row.week_plan_id,
    kcal: row.kcal,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    fibre_g: row.fibre_g,
    water_ml: row.water_ml,
    steps: row.steps,
    is_fast_day: row.is_fast_day,
    training_planned: row.training_planned,
  }
}

/** A computed (not yet stored) row as the contract shows it. */
export function newRowTargets(row: NewRow<typeof daily_targets>): DailyTargets {
  return {
    date: row.date,
    plan_version_id: row.plan_version_id,
    week_plan_id: row.week_plan_id ?? null,
    kcal: row.kcal,
    protein_g: row.protein_g,
    carbs_g: row.carbs_g,
    fat_g: row.fat_g,
    fibre_g: row.fibre_g,
    water_ml: row.water_ml,
    steps: row.steps,
    is_fast_day: row.is_fast_day ?? false,
    training_planned: row.training_planned ?? false,
  }
}

/** Rebuild from..to from the active version (overwrites those dates) and return the stored rows. */
export async function materialise(deps: Deps, range: { from: string; to: string }): Promise<DailyTargets[]> {
  const ctx = await loadPlanContext(deps)
  const rows = await computeTargetRows(deps, ctx, range)
  await runStatements(deps, targetStatements(deps, rows, 'replace'))
  const stored = await deps.db
    .select()
    .from(daily_targets)
    .where(between(daily_targets.date, range.from, range.to))
    .orderBy(daily_targets.date)
  return stored.map(toDailyTargets)
}

/**
 * Guarantee the v_day spine: every date from profile.start_date through `date` has targets. Existing dates are
 * left as they are (past targets are history); missing ones are filled from the active version. Returns rows added.
 * Cost when nothing is missing: one batched read.
 */
export async function ensureThrough(deps: Deps, date: string): Promise<number> {
  const [p, c] = await deps.db.batch([
    deps.db.select({ start: profile.start_date }).from(profile).limit(1),
    deps.db
      .select({ n: count() })
      .from(daily_targets)
      .where(and(lte(daily_targets.date, date), gte(daily_targets.date, sql`coalesce((select start_date from profile limit 1), ${date})`))),
  ])
  const start = p[0]?.start ?? date
  if (start > date) return 0
  if ((c[0]?.n ?? 0) >= daysBetween(start, date) + 1) return 0

  const have = new Set(
    (await deps.db.select({ date: daily_targets.date }).from(daily_targets).where(between(daily_targets.date, start, date))).map(
      (r) => r.date,
    ),
  )
  const missing: string[] = []
  for (let d = start; d <= date; d = addDays(d, 1)) if (!have.has(d)) missing.push(d)
  if (missing.length === 0) return 0
  const ctx = await loadPlanContext(deps)
  const rows = (await computeTargetRows(deps, ctx, { from: missing[0]!, to: missing[missing.length - 1]! })).filter(
    (r) => !have.has(r.date),
  )
  await runStatements(deps, targetStatements(deps, rows, 'fill'))
  return rows.length
}
