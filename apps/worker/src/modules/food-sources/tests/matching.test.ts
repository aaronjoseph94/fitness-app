// Owns: matching quality at the food-sources seam — the plainest food wins over flavoured or processed variants, found
// through the foods_fts full-text index (Canadian Nutrient File names and values from seed/foods/cnf.json).
import { env } from 'cloudflare:workers'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createDb, foods, type NewRow } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { createFoodSources } from '../index'
import { fakeFetch } from './fixtures'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const deps: Deps = { db, env, now: () => new Date('2026-10-05T18:00:00.000Z'), actor: 'ai', waitUntil: (p) => void pending.push(p) }
afterEach(async () => {
  await Promise.all(pending.splice(0))
})

const cnf = (code: number, name: string, kcal: number): NewRow<typeof foods> => ({
  source: 'cnf',
  source_id: String(code),
  name,
  kcal_per_100g: kcal,
})

beforeAll(async () => {
  const rows = [
    cnf(69, 'Milk, fluid, chocolate, whole', 83),
    cnf(70, 'Milk, fluid, chocolate, partly skimmed, 2% M.F.', 71),
    cnf(61, 'Milk, fluid, partly skimmed, 2% M.F.', 47),
    cnf(113, 'Milk, fluid, whole, pasteurized, homogenized, 3.25% M.F.', 59),
    cnf(124, 'Milk, fluid, buttermilk, 1% M.F.', 36),
    cnf(66, 'Milk, dry whole', 496),
    cnf(48, 'Cheese, tilsit, with whole milk', 340),
    cnf(3831, 'Cookie, oatmeal, commercial', 472),
    cnf(3837, 'Cookie, oatmeal, homemade, with raisins', 435),
    cnf(1439, 'Cereal, hot, oats (oatmeal), quick, dry, Quaker', 388),
    cnf(1440, 'Cereal, hot, oats (oatmeal), quick, prepared, Quaker', 83),
    cnf(2605, 'Nuts, almond butter, plain', 614),
    cnf(2534, 'Nuts, almonds, dried, unblanched, unroasted', 579),
    cnf(2537, 'Nuts, almonds, oil roasted, unblanched', 608),
    cnf(7226, 'Plant-based beverage, almond beverage, chocolate flavoured, sweetened, fortified, refrigerated', 48),
  ]
  // 9 bound values per row; D1 allows 100 per statement.
  await db.batch([db.insert(foods).values(rows.slice(0, 8)), db.insert(foods).values(rows.slice(8))])
})

describe('matching prefers the plainest food', () => {
  it('finds plain milk before chocolate milk, buttermilk or milk powder in the full-text index', async () => {
    const { fetch, calls } = fakeFetch({})

    const found = await createFoodSources(deps, { fetch }).search('milk', { remote: false, limit: 3 })

    expect(found.map((f) => f.name)).toEqual([
      'Milk, fluid, whole, pasteurized, homogenized, 3.25% M.F.',
      'Milk, fluid, partly skimmed, 2% M.F.',
      'Milk, fluid, chocolate, whole',
    ])
    expect(calls).toHaveLength(0)
  })

  it('matches "oatmeal, cooked" to the porridge, not the cookie, and "almonds" to almonds, not almond butter', async () => {
    const { fetch } = fakeFetch({})
    const sources = createFoodSources(deps, { fetch })

    const oatmeal = await sources.matchItem({ name: 'oatmeal, cooked', grams: 250 })
    const almonds = await sources.matchItem({ name: 'almonds', grams: 28 })

    expect(oatmeal?.food).toMatchObject({ source_id: '1440', name: 'Cereal, hot, oats (oatmeal), quick, prepared, Quaker' })
    expect(oatmeal?.nutrients.kcal).toBe(207.5)
    expect(almonds?.food).toMatchObject({ source_id: '2534', name: 'Nuts, almonds, dried, unblanched, unroasted' })
    expect(almonds?.nutrients.kcal).toBe(162.1)
  })
})
