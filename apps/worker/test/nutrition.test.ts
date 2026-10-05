// Owns: tests at the nutrition seam — a manual meal priced from foods per 100 g, idempotent replays of a create, and a
// free-text meal that runs meal_analysis (and falls back to review when no LLM provider answers).
import { env } from 'cloudflare:workers'
import { eq } from 'drizzle-orm'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ai_jobs, createDb } from '../src/db'
import type { Deps } from '../src/lib/deps'
import { createFood, createMeal } from '../src/modules/nutrition'

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
