// Owns: tests at the reforecast seam (plan.reforecast) — the expenditure estimate counts a logged intake day as one
// with a confirmed meal or the fast's own fast day (engine fastDay: a 19:00 → 19:00 fast makes the next day it), not
// every day a fast overlaps, so it keeps the baseline 2,551 kcal (SPEC §2) with fewer than 10 logged days (SPEC §9);
// and the weekly re-estimate is idempotent per as_of (run twice for one night, it does not smooth against itself).
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, fast_logs, meal_items, meals, plan_versions, profile, settings, weight_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { ensureTargetsThrough, reforecast } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
/** Monday 2026-10-05 09:00 MDT: the estimate reads Mon 2026-09-21 … Sun 2026-10-04 (in the past: v_day reads fasts by the real clock). */
const NOW = '2026-10-05T15:00:00.000Z'
const deps: Deps = { db, env, now: () => new Date(NOW), actor: 'ai', waitUntil: (p) => void pending.push(p.catch(() => undefined)) }
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

/** Eight eating days at 1,400 kcal; nothing logged on Sat 09-26 and Sun 09-27 around the fast. */
const EATING = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29', '2026-09-30']

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-15' }),
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      training_days: ['mon', 'tue', 'wed', 'thu'],
      reminders,
    }),
    db.insert(plan_versions).values({
      version: 1,
      active: true,
      created_by: 'user',
      reason: 'Baseline rails from doctor and dietitian',
      diff: [],
      targets: { defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 }, overrides: {} },
      forecast: { finish_date: '2027-06-17', weekly_rate_kg: 1.046, band: { low: 0.837, high: 1.256 }, tdee_est: 2551 },
    }),
    db.insert(weight_logs).values([
      { date: '2026-09-20', weight_kg: 95.1 },
      { date: '2026-10-04', weight_kg: 94.1 },
    ]),
    // Sat 2026-09-26 19:00 → Sun 19:00 MDT: overlaps Saturday and Sunday; Sunday 2026-09-27 is its fast day.
    db.insert(fast_logs).values({
      started_at: '2026-09-27T01:00:00.000Z',
      ended_at: '2026-09-28T01:00:00.000Z',
      start_date: '2026-09-26',
      end_date: '2026-09-27',
      planned: true,
    }),
    ...EATING.flatMap((date) => {
      const id = crypto.randomUUID()
      return [
        db.insert(meals).values({ id, date, slot: 'dinner', input_method: 'manual', status: 'confirmed' }),
        db.insert(meal_items).values({ meal_id: id, description: 'dinner', grams: 500, kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }),
      ]
    }),
  ])
  await ensureTargetsThrough(deps, '2026-10-04')
})

describe('reforecast', () => {
  it('8 eating days + 1 fast day = 9 logged intake days: the estimate keeps 2,551 kcal (the overlapped Saturday is not one)', async () => {
    const forecast = await reforecast(deps, { as_of: '2026-10-04', reestimate: true })

    expect(forecast.tdee_est).toBe(2551)
  })
})

describe('reforecast run twice for the same night', () => {
  it('re-estimates once: 1,981 kcal both times (0.5 × 1,410 + 0.5 × 2,551), not smoothed again toward 1,410', async () => {
    // Two more eating days: 10 eating days + the fast day = 11 logged days, so the window is usable.
    for (const date of ['2026-10-01', '2026-10-02']) {
      const id = crypto.randomUUID()
      await db.batch([
        db.insert(meals).values({ id, date, slot: 'dinner', input_method: 'manual', status: 'confirmed' }),
        db.insert(meal_items).values({ meal_id: id, description: 'dinner', grams: 500, kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }),
      ])
    }

    const first = await reforecast(deps, { as_of: '2026-10-04', reestimate: true })
    const again = await reforecast(deps, { as_of: '2026-10-04', reestimate: true })

    expect(first.tdee_est).toBe(1981)
    expect(again.tdee_est).toBe(1981)
  })
})
