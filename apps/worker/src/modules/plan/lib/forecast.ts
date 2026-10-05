// Owns: the nightly reforecast (SPEC §3, §9) — trend weight over every weigh-in, the expenditure estimate re-estimated
// weekly from v_day intake (engine isLoggedIntakeDay: a confirmed meal, or the fast's own fast day — engine fastDay over
// the fast log, not every day a fast overlaps — which counts at its intake, 0 kcal when nothing was eaten), and the
// forecast at the mean planned intake ahead — written into the active version's `forecast` (derived data, no new version).
import {
  addDays,
  eachDate,
  estimateExpenditure,
  fastDay,
  forecast,
  meanPlannedIntake,
  trendWeights,
  weekdayOf,
  type ExpenditureDay,
} from '@fitness/shared/engine'
import type { Forecast } from '@fitness/shared/schemas'
import { and, between, desc, eq, gt, isNotNull, lte } from 'drizzle-orm'
import { daily_targets, fast_logs, plan_versions, scans, v_day, weight_logs } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { loadPlanContext } from './context'

/** SPEC §2: the baseline scan's TEE, the first expenditure estimate when no scan row or forecast exists. */
const BASELINE_TEE_KCAL = 2551
/** Planned intake is averaged over the next four weeks (fast days enter as 0 kcal). */
const PLANNED_DAYS = 28

const round3 = (x: number) => Math.round(x * 1000) / 1000

/**
 * The forecast as stored in plan_versions.forecast: the contract's Forecast plus the night of the last re-estimate and
 * the estimate it smoothed from (internal; readers parse Forecast and drop them).
 */
type StoredForecast = Forecast & { tdee_as_of?: string; tdee_before?: number }

/**
 * reforecast(as_of):
 *   trend      = trendWeights(all weigh-ins ≤ as_of)[as_of]   (profile start weight when there is none)
 *   tdee_est   = estimateExpenditure over as_of − 13 … as_of when `reestimate` (default: as_of is a Sunday, so the
 *                estimate moves weekly), else the active forecast's tdee_est (first: the latest scan TEE, 2,551 kcal);
 *                previous = the active tdee_est, or tdee_before when that night was already re-estimated (idempotent)
 *   intake     = meanPlannedIntake(daily_targets as_of + 1 … as_of + 28), else the active default kcal
 *   forecast   = forecast({ as_of, tdee_est, intake, trend, goal_kg })  → active plan_versions.forecast
 */
export async function reforecast(deps: Deps, input: { as_of: string; reestimate?: boolean }): Promise<Forecast> {
  const { as_of } = input
  const ctx = await loadPlanContext(deps)
  const profile = ctx.profile
  if (!profile) throw new HttpError(503, 'not_seeded', 'No profile (goal and start weight) to forecast from')
  const windowFrom = addDays(as_of, -14)
  const [weights, scan, ahead, window, fasts] = await deps.db.batch([
    deps.db
      .select({ date: weight_logs.date, weight_kg: weight_logs.weight_kg })
      .from(weight_logs)
      .where(lte(weight_logs.date, as_of))
      .orderBy(weight_logs.date),
    deps.db
      .select({ tee: scans.tee_kcal })
      .from(scans)
      .where(and(eq(scans.confirmed, true), isNotNull(scans.tee_kcal), lte(scans.date, as_of)))
      .orderBy(desc(scans.scanned_at))
      .limit(1),
    deps.db
      .select({ kcal: daily_targets.kcal, is_fast_day: daily_targets.is_fast_day })
      .from(daily_targets)
      .where(and(gt(daily_targets.date, as_of), lte(daily_targets.date, addDays(as_of, PLANNED_DAYS)))),
    deps.db
      .select({
        date: v_day.date,
        intake_kcal: v_day.intake_kcal,
        meals_logged: v_day.meals_logged,
      })
      .from(v_day)
      .where(between(v_day.date, windowFrom, as_of)),
    deps.db
      .select({ started_at: fast_logs.started_at, ended_at: fast_logs.ended_at })
      .from(fast_logs)
      .where(between(fast_logs.start_date, addDays(windowFrom, -3), as_of)),
  ])

  const trend = trendWeights(weights, { to: as_of })
  const trendByDate = new Map(trend.map((t) => [t.date, t.trend_kg]))
  const trend_kg = trend.at(-1)?.trend_kg ?? profile.start_weight_kg

  const active = ctx.active.forecast as StoredForecast | null
  const reestimate = input.reestimate ?? weekdayOf(as_of) === 'sun'
  // Re-estimating a night already re-estimated starts again from the estimate before it, so a rerun (cron retry,
  // backfill) never smooths against its own output.
  const sameNight = reestimate && active?.tdee_as_of === as_of && active.tdee_before !== undefined
  const previous = (sameNight ? active.tdee_before : active?.tdee_est) ?? scan[0]?.tee ?? BASELINE_TEE_KCAL
  let tdee_est = previous
  if (reestimate) {
    const byDate = new Map(window.map((d) => [d.date, d]))
    const fastDays = new Set(fasts.map((f) => fastDay(f, ctx.settings.fast_hours)))
    const days: ExpenditureDay[] = eachDate(windowFrom, as_of).map((date) => {
      const d = byDate.get(date)
      return {
        date,
        trend_kg: trendByDate.get(date) ?? null,
        meals_logged: d?.meals_logged ?? 0,
        is_fast_day: fastDays.has(date),
        intake: { kcal: d?.intake_kcal ?? 0 },
      }
    })
    tdee_est = estimateExpenditure({ as_of, days, previous_kcal: previous }).tdee_est
  }

  const intake_kcal = meanPlannedIntake(ahead) ?? ctx.active.targets.defaults.kcal
  const f = forecast({ as_of, tdee_est, intake_kcal, trend_kg, goal_kg: profile.goal_weight_kg })
  const stored: StoredForecast = {
    finish_date: f.finish_date,
    weekly_rate_kg: round3(f.weekly_rate_kg),
    band: { low: round3(f.band.low), high: round3(f.band.high) },
    tdee_est: Math.round(tdee_est),
    ...(reestimate
      ? { tdee_as_of: as_of, tdee_before: Math.round(previous) }
      : active?.tdee_as_of !== undefined && { tdee_as_of: active.tdee_as_of, tdee_before: active.tdee_before }),
  }
  await deps.db
    .update(plan_versions)
    .set({ forecast: stored, updated_at: deps.now().toISOString() })
    .where(eq(plan_versions.id, ctx.active.id))
  return stored
}
