// Owns: the food-sources seam — barcode lookup, cache-first matching, generic-over-branded preference, portion maths.
// The Canadian Nutrient File is the generic-food source (seeded locally) and Open Food Facts is the only remote one;
// USDA FoodData Central must never be queried, which every host assertion below pins down.
import { env } from 'cloudflare:workers'
import { afterEach, describe, expect, it } from 'vitest'
import { createDb, foods, type NewRow } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { createFoodSources } from '../index'
import { fakeFetch, OFF_PRODUCT_NUTELLA, OFF_SEARCH_BANANA, OFF_SEARCH_OIKOS } from './fixtures'

const db = createDb(env.DB)
const pending: Promise<unknown>[] = []
const deps: Deps = {
  db,
  env,
  now: () => new Date('2026-10-05T18:00:00.000Z'),
  actor: 'ai',
  waitUntil: (p) => void pending.push(p),
}
afterEach(async () => {
  await Promise.all(pending.splice(0))
})

/** A Canadian Nutrient File row as build-seed.ts inserts it (values from seed/foods/cnf.json). */
const cnf = (code: number, name: string, kcal: number, protein: number, carbs: number, fat: number, fibre: number): NewRow<typeof foods> => ({
  source: 'cnf',
  source_id: String(code),
  name,
  kcal_per_100g: kcal,
  protein_g: protein,
  carbs_g: carbs,
  fat_g: fat,
  fibre_g: fibre,
})

const REMOTE = {
  'https://world.openfoodfacts.org/api/v2/product/3017624010701': OFF_PRODUCT_NUTELLA,
  'https://search.openfoodfacts.org/search': OFF_SEARCH_BANANA,
}
const OIKOS = { 'https://search.openfoodfacts.org/search': OFF_SEARCH_OIKOS }
const hosts = (calls: { url: string }[]) => [...new Set(calls.map((c) => new URL(c.url).hostname))]

describe('food sources', () => {
  it('maps an Open Food Facts barcode hit to a per-100 g food and caches it', async () => {
    const { fetch, calls } = fakeFetch(REMOTE)
    const sources = createFoodSources(deps, { fetch })

    const food = await sources.byBarcode('3017624010701')

    expect(food).toMatchObject({
      source: 'off',
      source_id: '3017624010701',
      barcode: '3017624010701',
      name: 'Nutella',
      brand: 'Ferrero',
      serving_g: 15,
      kcal_per_100g: 539,
      protein_g: 6.3,
      carbs_g: 57.5,
      fat_g: 30.9,
      fibre_g: 0,
      sugar_g: 56.3,
      sodium_mg: 43,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toContain('fields=code,product_name,brands,serving_size,nutriments,image_front_small_url')
    expect(calls[0]!.userAgent).toBe('FitnessTracker/1.0 (personal, non-commercial)')
    // Open Food Facts needs no key, so none travels (a key in a request would end up in a log line).
    expect(calls[0]!.apiKey).toBeNull()

    const again = await createFoodSources(deps, { fetch }).byBarcode('3017624010701')
    expect(again?.id).toBe(food!.id)
    expect(calls).toHaveLength(1)
  })

  it('matches "eggs" from the cache with zero external calls', async () => {
    await db.insert(foods).values([
      cnf(83, 'Egg, chicken, dried, whole', 592, 48.05, 1.13, 43.9, 0),
      cnf(125, 'Egg, chicken, whole, fresh or frozen, raw', 152, 12.27, 0.79, 10.61, 0),
      cnf(127, 'Egg, chicken, yolk, fresh or frozen, raw', 351, 16.47, 1.1, 30.43, 0),
    ])
    const { fetch, calls } = fakeFetch(REMOTE)

    const match = await createFoodSources(deps, { fetch }).matchItem({ name: 'eggs', grams: 100 })

    expect(match?.food).toMatchObject({ source: 'cnf', source_id: '125' })
    expect(match?.estimated).toBe(false)
    expect(match?.confidence).toBeGreaterThanOrEqual(0.75)
    expect(match?.nutrients).toEqual({ kcal: 152, protein_g: 12.3, carbs_g: 0.8, fat_g: 10.6, fibre_g: 0 })
    expect(calls).toHaveLength(0)
  })

  it('prefers the Canadian Nutrient File over a branded Open Food Facts product for a generic "banana 120 g"', async () => {
    await db.insert(foods).values([
      cnf(1704, 'Banana, raw', 89, 1.09, 22.84, 0.33, 1.7),
      { source: 'off', source_id: '01129441', barcode: '01129441', name: 'Banana', brand: 'fairtrade', kcal_per_100g: 89, protein_g: 1.1, carbs_g: 23, fat_g: 0.3, fibre_g: 2.6 },
    ])
    const { fetch, calls } = fakeFetch(REMOTE)

    const match = await createFoodSources(deps, { fetch }).matchItem({ name: 'banana', grams: 120 })

    expect(match?.food).toMatchObject({ source: 'cnf', source_id: '1704' })
    expect(match?.nutrients).toEqual({ kcal: 106.8, protein_g: 1.3, carbs_g: 27.4, fat_g: 0.4, fibre_g: 2 })
    expect(calls).toHaveLength(0)
  })

  it('falls through to Open Food Facts — never USDA — when the cache has no match for a branded item', async () => {
    const { fetch, calls } = fakeFetch(OIKOS)

    const match = await createFoodSources(deps, { fetch }).matchItem({ name: 'Oikos Pro yogurt', grams: 200 })

    expect(match?.food).toMatchObject({ source: 'off', source_id: '0056800100237', name: 'Oikos Pro Yogurt', brand: 'Oikos', kcal_per_100g: 90, protein_g: 15 })
    expect(match?.nutrients).toEqual({ kcal: 180, protein_g: 30, carbs_g: 10.6, fat_g: 4.6, fibre_g: 0 })
    expect(hosts(calls)).toEqual(['search.openfoodfacts.org'])
    expect(calls[0]!.apiKey).toBeNull()

    // The hit is cached, so the second lookup is local (a fresh instance shares the recording fetch).
    const cached = await createFoodSources(deps, { fetch }).matchItem({ name: 'Oikos Pro yogurt', grams: 200 })
    expect(cached?.food.id).toBe(match!.food.id)
    expect(calls).toHaveLength(1)
  })

  it('leaves a generic item the cache does not carry unmatched rather than querying a database outside Canada', async () => {
    const { fetch, calls } = fakeFetch(REMOTE)

    const match = await createFoodSources(deps, { fetch }).matchItem({ name: 'durian fruit', grams: 100 })

    expect(match).toBeNull()
    expect(hosts(calls)).toEqual(['search.openfoodfacts.org'])
  })

  it('scales a per-100 g food to a portion, counting unknown fibre as 0', () => {
    const { fetch } = fakeFetch({})
    const nutella = { kcal_per_100g: 539, protein_g: 6.3, carbs_g: 57.5, fat_g: 30.9, fibre_g: null }

    expect(createFoodSources(deps, { fetch }).nutritionFor(nutella, 40)).toEqual({
      kcal: 215.6,
      protein_g: 2.5,
      carbs_g: 23,
      fat_g: 12.4,
      fibre_g: 0,
    })
  })
})
