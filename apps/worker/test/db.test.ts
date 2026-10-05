// Owns: the database seam — migrations apply cleanly and v_day reports one local day's targets and logged totals.
import { env } from 'cloudflare:workers'
import { inArray } from 'drizzle-orm'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createDb,
  daily_targets,
  fast_logs,
  meal_items,
  meals,
  plan_versions,
  v_day,
  water_logs,
  weight_logs,
  type NewRow,
} from '../src/db'

const db = createDb(env.DB)
const planId = crypto.randomUUID()

/** Plan v1 from SPEC §6: 1,400 kcal, 130 g protein, 45 g fat, 30 g fibre, carbs the remainder (118.75 g). */
const rails = {
  kcal: 1400,
  protein_g: 130,
  carbs_g: 118.75,
  fat_g: 45,
  fibre_g: 30,
  water_ml: 3000,
  steps: 8000,
}
const targetsFor = (date: string, training_planned = false): NewRow<typeof daily_targets> => ({
  date,
  plan_version_id: planId,
  ...rails,
  training_planned,
})

// Storage persists across tests in this file, so the one active plan is created once and each test uses its own dates.
beforeAll(async () => {
  await db.insert(plan_versions).values({
    id: planId,
    version: 1,
    active: true,
    created_by: 'user',
    reason: 'Baseline rails from doctor and dietitian',
    diff: [],
    targets: { defaults: rails, overrides: {} },
  })
})

describe('v_day', () => {
  it('shows the baseline day: the rails as targets, the first weigh-in, nothing else logged', async () => {
    await db.insert(daily_targets).values(targetsFor('2026-09-26'))
    await db.insert(weight_logs).values({ date: '2026-09-26', weight_kg: 95.1 })

    const [day] = await db
      .select()
      .from(v_day)
      .where(inArray(v_day.date, ['2026-09-26']))

    expect(day).toEqual({
      date: '2026-09-26',
      plan_version_id: planId,
      target_kcal: 1400,
      target_protein_g: 130,
      target_carbs_g: 118.75,
      target_fat_g: 45,
      target_fibre_g: 30,
      target_water_ml: 3000,
      target_steps: 8000,
      is_fast_day: false,
      training_planned: false,
      weight_kg: 95.1,
      intake_kcal: 0,
      intake_protein_g: 0,
      intake_carbs_g: 0,
      intake_fat_g: 0,
      intake_fibre_g: 0,
      meals_logged: 0,
      water_ml: 0,
      steps: null,
      active_kcal: null,
      asleep_min: null,
      fasted: false,
      sessions_done: 0,
    })
  })

  it('totals confirmed meals and water only, and marks every date a fast overlaps', async () => {
    await db
      .insert(daily_targets)
      .values(['2026-09-28', '2026-09-29', '2026-09-30'].map((d) => targetsFor(d, true)))
    const lunch = crypto.randomUUID()
    const unconfirmed = crypto.randomUUID()
    await db.batch([
      db.insert(meals).values([
        { id: lunch, date: '2026-09-28', slot: 'lunch', input_method: 'text', status: 'confirmed' },
        { id: unconfirmed, date: '2026-09-28', slot: 'snack', input_method: 'text', status: 'review' },
      ]),
      db.insert(meal_items).values([
        { meal_id: lunch, description: 'chicken breast', grams: 150, kcal: 248, protein_g: 46.5, fat_g: 5.4 },
        {
          meal_id: lunch,
          description: 'rice',
          grams: 150,
          kcal: 195,
          protein_g: 4,
          carbs_g: 42,
          fibre_g: 0.6,
        },
        { meal_id: unconfirmed, description: 'chocolate bar', grams: 50, kcal: 270, carbs_g: 30, fat_g: 15 },
      ]),
      db.insert(water_logs).values([
        { logged_at: '2026-09-28T16:00:00.000Z', date: '2026-09-28', amount_ml: 500 },
        { logged_at: '2026-09-28T19:30:00.000Z', date: '2026-09-28', amount_ml: 750 },
      ]),
      // 24 h fast from 18:00 on 2026-09-28 to 18:00 on 2026-09-29, Edmonton time (UTC−6).
      db.insert(fast_logs).values({
        started_at: '2026-09-29T00:00:00.000Z',
        ended_at: '2026-09-30T00:00:00.000Z',
        start_date: '2026-09-28',
        end_date: '2026-09-29',
        planned: true,
      }),
    ])

    const days = await db
      .select({
        date: v_day.date,
        intake_kcal: v_day.intake_kcal,
        intake_protein_g: v_day.intake_protein_g,
        meals_logged: v_day.meals_logged,
        water_ml: v_day.water_ml,
        fasted: v_day.fasted,
      })
      .from(v_day)
      .where(inArray(v_day.date, ['2026-09-28', '2026-09-29', '2026-09-30']))
      .orderBy(v_day.date)

    expect(days).toEqual([
      {
        date: '2026-09-28',
        intake_kcal: 443,
        intake_protein_g: 50.5,
        meals_logged: 1,
        water_ml: 1250,
        fasted: true,
      },
      { date: '2026-09-29', intake_kcal: 0, intake_protein_g: 0, meals_logged: 0, water_ml: 0, fasted: true },
      {
        date: '2026-09-30',
        intake_kcal: 0,
        intake_protein_g: 0,
        meals_logged: 0,
        water_ml: 0,
        fasted: false,
      },
    ])
  })
})
