// Owns: the rolling 7-day window the ai/mcp kcal step is measured over (SPEC §9: a proposal moves daily kcal by at
// most 150, and larger moves are split across weeks — so two moves in one week are not 300). The base is the plan
// version that was active when the window opened (the end of today − 7, Edmonton), or the oldest version when the plan
// is younger than that; Aaron's own later kcal edit (a 'user' version whose kcal differs from the one before) moves the
// base to it. The versions made since, oldest first, say when a waiting step will fit.
import { addDays, KCAL_STEP, localDate, localMidnight, targetValue, today, type PlanTargetsLike } from '@fitness/shared/engine'
import { Weekday, type PlanTargets } from '@fitness/shared/schemas'
import { asc, gte, sql } from 'drizzle-orm'
import { plan_versions } from '../../../db'
import type { Deps } from '../../../lib/deps'

export interface KcalWindow {
  /** The targets ai/mcp kcal moves are measured from (engine GuardContext.kcal_base). */
  base: PlanTargets
  /** Versions made after the base, oldest first, with the local date each was made. */
  later: { date: string; targets: PlanTargets }[]
}

const kcalMoved = (a: PlanTargetsLike, b: PlanTargetsLike) =>
  a.defaults.kcal !== b.defaults.kcal || Weekday.options.some((w) => targetValue(a, 'kcal', w) !== targetValue(b, 'kcal', w))

/**
 *   opened = end of local date (today − 7)
 *   rows   = versions with version ≥ the newest one made before `opened` (all versions when none was), oldest first
 *   base   = rows[0], or the newest 'user' row whose kcal differs from the row before it
 */
export async function kcalWindow(deps: Deps): Promise<KcalWindow> {
  const opened = new Date(localMidnight(addDays(today(deps.now()), -6))).toISOString()
  const rows = await deps.db
    .select({ created_by: plan_versions.created_by, created_at: plan_versions.created_at, targets: plan_versions.targets })
    .from(plan_versions)
    .where(gte(plan_versions.version, sql`coalesce((select max(version) from plan_versions where created_at < ${opened}), 1)`))
    .orderBy(asc(plan_versions.version))
  let base = 0
  rows.forEach((r, i) => {
    if (i > 0 && r.created_by === 'user' && kcalMoved(rows[i - 1]!.targets, r.targets)) base = i
  })
  if (!rows[base]) throw new Error('No plan version to measure kcal steps from')
  return {
    base: rows[base]!.targets,
    later: rows.slice(base + 1).map((r) => ({ date: localDate(r.created_at), targets: r.targets })),
  }
}

/**
 * The first date a waiting kcal step (weekday, to) fits the window: when the first later version v with
 * |to − kcal(v, weekday)| ≤ 150 becomes the base, i.e. v's date + 7 days (today + 7 when none does).
 */
export function stepFitsOn(deps: Deps, window: KcalWindow, step: { weekday: Weekday | null; to: number }): string {
  const v = window.later.find((l) => Math.abs(step.to - targetValue(l.targets, 'kcal', step.weekday)) <= KCAL_STEP)
  return addDays(v?.date ?? today(deps.now()), 7)
}
