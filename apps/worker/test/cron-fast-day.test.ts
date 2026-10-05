// Owns: a test at the cron seam (runCron) for fast days in the nightly — a planned fast day's 0 kcal is a logged intake
// day, not a missed one (SPEC §2 "a fast day is a known pattern, not a missed day"; §3 "fast days enter as 0 kcal"),
// so the Monday nightly's weekly expenditure re-estimate counts it, and it raises no safety note.
//   window Mon 2026-09-28 … Sun 2026-10-11: 9 days eaten at 1,400 kcal + the fast day Thu 2026-10-08 (Wed 19:00 →
//   Thu 19:00 MDT, most of it on Thursday) = 10 logged days (the minimum); weight flat at 95.0 kg.
//   mean intake = (9 × 1,400 + 0) / 10 = 1,260; raw = 1,260; tdee = round(0.5 × 1,260 + 0.5 × 2,551) = 1,906.
//   Were the fast day missed, 9 < 10 logged days would keep 2,551.
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { runCron } from '../src/cron'
import { ai_events, createDb, fast_logs, meal_items, meals, plan_versions, profile, settings, weight_logs } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { ensureTargetsThrough } from '../src/modules/plan'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const at = (now: string): Deps => ({ db, env, now: () => new Date(now), actor: 'ai', waitUntil: (p) => void pending.push(p.catch(() => undefined)) })
afterEach(async () => {
  await Promise.all(pending.splice(0))
})
const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs

const EATING = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06']

beforeAll(async () => {
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-20' }),
    db.insert(settings).values({
      calorie_floor: 1400,
      calorie_ceiling: 1700,
      protein_min_g: 130,
      fat_min_g: 45,
      fibre_target_g: 30,
      water_target_ml: 3000,
      fast_hours: 24,
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
      { date: '2026-09-27', weight_kg: 95 },
      { date: '2026-10-11', weight_kg: 95 },
    ]),
    db.insert(fast_logs).values({
      started_at: '2026-10-08T01:00:00.000Z', // Wed 2026-10-07 19:00 MDT
      ended_at: '2026-10-09T01:00:00.000Z', // Thu 2026-10-08 19:00 MDT
      start_date: '2026-10-07',
      end_date: '2026-10-08',
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
  await ensureTargetsThrough(at('2026-10-12T19:00:00.000Z'), '2026-10-11')
})

describe('nightly after a week with a planned fast', () => {
  it('counts the fast day as a logged 0 kcal day: tdee_est 1,906, and no safety note for it', async () => {
    const run = await runCron(at('2026-10-12T19:00:00.000Z')) // Mon 2026-10-12 13:00 MDT

    expect(run.ran).toEqual(['nightly'])
    const [active] = await db.select({ forecast: plan_versions.forecast }).from(plan_versions).where(eq(plan_versions.active, true))
    expect(active?.forecast?.tdee_est).toBe(1906)
    const notes = await db.select({ body: ai_events.body }).from(ai_events).where(eq(ai_events.kind, 'note'))
    expect(notes.map((n) => (n.body as { flag?: string } | null)?.flag).filter((f) => f !== 'scan_due')).toEqual([])
  })
})
