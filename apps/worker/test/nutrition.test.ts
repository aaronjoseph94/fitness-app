// Owns: tests at the nutrition seam — a manual meal priced from foods per 100 g, idempotent replays of a create, a
// free-text meal that runs meal_analysis (and falls back to review when no LLM provider answers), and the day
// adjustment card following edits and deletes of today's confirmed meals.
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ReminderKind, type ReminderPrefs } from '@fitness/shared/schemas'
import { ai_events, ai_jobs, createDb, plan_versions, profile, settings } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { getDay } from '../src/modules/day'
import '../src/modules/meal-ai' // registers the day_adjustment handler
import { createFood, createMeal, deleteMeal, updateMeal } from '../src/modules/nutrition'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const deps: Deps = {
  db,
  env,
  now: () => new Date('2026-10-05T18:00:00.000Z'),
  actor: 'user',
  waitUntil: (p) => void pending.push(p.catch(() => undefined)),
}

const chickenId = crypto.randomUUID()
const riceId = crypto.randomUUID()

beforeAll(async () => {
  // The rails and the active plan the day view (and so the day adjustment card) reads.
  const reminders = Object.fromEntries(ReminderKind.options.map((k) => [k, { enabled: true, time: null }])) as ReminderPrefs
  await db.batch([
    db.insert(profile).values({ height_cm: 165.1, sex: 'male', goal_weight_kg: 65, goal_date: '2027-08-04', start_weight_kg: 95.1, start_date: '2026-09-26' }),
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
    }),
  ])
  // Per 100 g. Chicken breast: 165 kcal, 31 g protein, 3.6 g fat. Cooked rice: 130 kcal, 2.6 g protein, 28 g carbs.
  await createFood(deps, { id: chickenId, name: 'Chicken breast', kcal_per_100g: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, fibre_g: 0 })
  await createFood(deps, { id: riceId, name: 'Rice, cooked', kcal_per_100g: 130, protein_g: 2.6, carbs_g: 28, fat_g: 0.4, fibre_g: 0.4 })
})

afterEach(async () => {
  await Promise.all(pending.splice(0))
})

describe('meals', () => {
  it('prices manual items from their foods and confirms the meal on its Edmonton date', async () => {
    const meal = await createMeal(deps, {
      id: crypto.randomUUID(),
      slot: 'dinner',
      eaten_at: '2026-10-05T01:30:00.000Z', // 19:30 MDT on 2026-10-04
      input_method: 'manual',
      items: [
        { id: crypto.randomUUID(), food_id: chickenId, grams: 200 },
        { id: crypto.randomUUID(), food_id: riceId, grams: 150 },
      ],
    })

    expect(meal.status).toBe('confirmed')
    expect(meal.date).toBe('2026-10-04')
    // 200 g chicken = 330 kcal, 62 g protein, 7.2 g fat; 150 g rice = 195 kcal, 3.9 g protein, 42 g carbs, 0.6 g fat, 0.6 g fibre.
    expect(meal.items.map((i) => [i.description, i.kcal])).toEqual([
      ['Chicken breast', 330],
      ['Rice, cooked', 195],
    ])
    expect(meal.totals).toEqual({ kcal: 525, protein_g: 65.9, carbs_g: 42, fat_g: 7.8, fibre_g: 0.6 })
  })

  it('returns the stored meal when a create is replayed with the same id', async () => {
    const id = crypto.randomUUID()
    const body = {
      id,
      slot: 'lunch' as const,
      eaten_at: '2026-10-05T18:00:00.000Z',
      input_method: 'manual' as const,
      items: [{ id: crypto.randomUUID(), food_id: riceId, grams: 100 }],
    }
    const first = await createMeal(deps, body)
    const replay = await createMeal(deps, { ...body, items: [{ id: crypto.randomUUID(), food_id: chickenId, grams: 500 }] })

    expect(replay).toEqual(first)
  })

  it('stores a free-text meal and runs meal_analysis; with no LLM keys the meal falls back to review with its text', async () => {
    const meal = await createMeal(deps, {
      id: crypto.randomUUID(),
      slot: 'lunch',
      eaten_at: '2026-10-05T18:30:00.000Z',
      input_method: 'text',
      raw_text: '2 eggs, toast with butter, black coffee',
    })
    await Promise.all(pending.splice(0)) // runSoon runs meal_analysis; no provider keys in tests → it fails fast

    expect(meal).toMatchObject({ status: 'parsing', raw_text: '2 eggs, toast with butter, black coffee', items: [] })
    const jobs = await db.select().from(ai_jobs).where(eq(ai_jobs.type, 'meal_analysis'))
    expect(jobs).toEqual([expect.objectContaining({ status: 'failed', attempts: 1, payload: { meal_id: meal.id } })])
  })
})

describe('a confirmed meal has something in it', () => {
  it('refuses to confirm a meal with no items, or to empty a confirmed one (delete it instead)', async () => {
    const text = await createMeal(deps, { id: crypto.randomUUID(), slot: 'snack', eaten_at: '2026-10-05T16:00:00.000Z', input_method: 'text', raw_text: 'an apple' })
    await Promise.all(pending.splice(0)) // no LLM keys: the analysis fails and the meal waits in review with no items
    await expect(updateMeal(deps, text.id, { confirm: true })).rejects.toMatchObject({ status: 400 })
    const items = [{ id: crypto.randomUUID(), food_id: riceId, grams: 100 }]
    const manual = await createMeal(deps, { id: crypto.randomUUID(), slot: 'snack', eaten_at: '2026-10-05T16:00:00.000Z', input_method: 'manual', items })
    await expect(updateMeal(deps, manual.id, { items: [] })).rejects.toMatchObject({ status: 400 })
    expect((await updateMeal(deps, text.id, { items: [{ id: crypto.randomUUID(), food_id: riceId, grams: 80 }], confirm: true })).status).toBe('confirmed')
  })
})

describe('meals that have not been eaten yet', () => {
  it('refuses a meal eaten tomorrow, and moving a meal there', async () => {
    const tomorrow = '2026-10-06T18:00:00.000Z' // 12:00 MDT on 2026-10-06; the test clock is 2026-10-05 12:00 MDT
    const items = [{ id: crypto.randomUUID(), food_id: riceId, grams: 100 }]
    await expect(createMeal(deps, { id: crypto.randomUUID(), slot: 'lunch', eaten_at: tomorrow, input_method: 'manual', items })).rejects.toMatchObject({ status: 400 })
    const meal = await createMeal(deps, { id: crypto.randomUUID(), slot: 'dinner', eaten_at: '2026-10-05T17:30:00.000Z', input_method: 'manual', items })
    await expect(updateMeal(deps, meal.id, { eaten_at: tomorrow })).rejects.toMatchObject({ status: 400 })
  })
})

describe('the day adjustment follows the day', () => {
  /** The remaining kcal of every adjustment card written for a date. */
  const cardsFor = async (date: string) =>
    (await db.select({ body: ai_events.body }).from(ai_events).where(eq(ai_events.kind, 'adjustment')))
      .map((r) => r.body as { date: string; remaining: { kcal: number } })
      .filter((b) => b.date === date)
      .map((b) => b.remaining.kcal)

  const lunch = (grams: number) => ({
    id: crypto.randomUUID(),
    slot: 'lunch' as const,
    eaten_at: '2026-10-05T17:00:00.000Z', // 11:00 MDT today
    input_method: 'manual' as const,
    items: [{ id: crypto.randomUUID(), food_id: riceId, grams }],
  })

  it('writes a fresh card when a confirmed meal of today gets new grams', async () => {
    const meal = await createMeal(deps, lunch(100)) // 130 kcal of rice
    await Promise.all(pending.splice(0))
    await updateMeal(deps, meal.id, { items: [{ id: crypto.randomUUID(), food_id: riceId, grams: 300 }] }) // 390 kcal
    await Promise.all(pending.splice(0))

    const day = await getDay(deps, '2026-10-05')
    expect(await cardsFor('2026-10-05')).toContain(day.remaining!.kcal)
  })

  it('writes a fresh card when a confirmed meal of today is deleted', async () => {
    const meal = await createMeal(deps, lunch(250)) // 325 kcal of rice
    await Promise.all(pending.splice(0))
    await deleteMeal(deps, meal.id)
    await Promise.all(pending.splice(0))

    const day = await getDay(deps, '2026-10-05')
    expect(await cardsFor('2026-10-05')).toContain(day.remaining!.kcal)
  })
})
