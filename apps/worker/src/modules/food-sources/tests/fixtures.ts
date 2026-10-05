// Owns: recorded-shape responses from Open Food Facts and USDA FoodData Central (trimmed live answers, 2026-10-05) and a
// fake fetch that serves them by URL prefix and records every call.
import type { Fetch } from '../index'

/** GET world.openfoodfacts.org/api/v2/product/3017624010701?fields=… (serving_size added; Nutella's label says 15 g). */
export const OFF_PRODUCT_NUTELLA = {
  code: '3017624010701',
  product: {
    brands: 'Ferrero',
    code: '3017624010701',
    image_front_small_url: 'https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.100.200.jpg',
    nutriments: {
      carbohydrates: 57.5,
      carbohydrates_100g: 57.5,
      carbohydrates_unit: 'g',
      energy: 2228,
      'energy-kcal': 539,
      'energy-kcal_100g': 539,
      'energy-kj_100g': 2228,
      energy_100g: 2228,
      energy_unit: 'kJ',
      fat_100g: 30.9,
      proteins_100g: 6.3,
      salt_100g: 0.1075,
      'saturated-fat_100g': 10.6,
      sodium_100g: 0.043,
      sugars_100g: 56.3,
    },
    product_name: 'Nutella',
    serving_size: '15 g',
  },
  status: 1,
  status_verbose: 'product found',
}

/** GET search.openfoodfacts.org/search?q=banana&page_size=3&fields=… */
export const OFF_SEARCH_BANANA = {
  hits: [
    {
      code: '01129441',
      brands: ['fairtrade'],
      nutriments: { carbohydrates_100g: 23, 'energy-kcal_100g': 89, fat_100g: 0.3, fiber_100g: 2.6, proteins_100g: 1.1, salt_100g: 0.001, sodium_100g: 0.0004, sugars_100g: 12 },
      product_name: 'Banana',
    },
  ],
  page: 1,
  page_size: 3,
  page_count: 1,
}

const usdaNutrient = (nutrientId: number, nutrientName: string, nutrientNumber: string, unitName: string, value: number) => ({
  nutrientId,
  nutrientName,
  nutrientNumber,
  unitName,
  value,
  rank: 300,
  indentLevel: 1,
})

/** GET api.nal.usda.gov/fdc/v1/foods/search?query=overripe%20banana&dataType=Foundation,SR%20Legacy&pageSize=3 */
export const USDA_SEARCH_OVERRIPE_BANANA = {
  totalHits: 2,
  currentPage: 1,
  totalPages: 1,
  foods: [
    {
      fdcId: 173944,
      description: 'Bananas, raw',
      dataType: 'SR Legacy',
      ndbNumber: 9040,
      foodCategory: 'Fruits and Fruit Juices',
      foodNutrients: [
        usdaNutrient(1003, 'Protein', '203', 'G', 1.09),
        usdaNutrient(1004, 'Total lipid (fat)', '204', 'G', 0.33),
        usdaNutrient(1005, 'Carbohydrate, by difference', '205', 'G', 22.8),
        usdaNutrient(1008, 'Energy', '208', 'KCAL', 89),
        usdaNutrient(1062, 'Energy', '268', 'kJ', 371),
        usdaNutrient(1079, 'Fiber, total dietary', '291', 'G', 2.6),
        usdaNutrient(2000, 'Total Sugars', '269', 'G', 12.2),
        usdaNutrient(1093, 'Sodium, Na', '307', 'MG', 1),
      ],
    },
    {
      fdcId: 1105073,
      description: 'Bananas, overripe, raw',
      dataType: 'Foundation',
      ndbNumber: 100254,
      foodCategory: 'Fruits and Fruit Juices',
      foodNutrients: [
        usdaNutrient(1004, 'Total lipid (fat)', '204', 'G', 0.22),
        usdaNutrient(1079, 'Fiber, total dietary', '291', 'G', 1.7),
        usdaNutrient(1003, 'Protein', '203', 'G', 0.73),
        usdaNutrient(1005, 'Carbohydrate, by difference', '205', 'G', 20.1),
        usdaNutrient(1008, 'Energy', '208', 'KCAL', 85),
        usdaNutrient(1062, 'Energy', '268', 'kJ', 357),
        usdaNutrient(1063, 'Sugars, Total', '269.3', 'G', 15.8),
      ],
    },
  ],
}

/** A fetch that answers from `routes` (first URL prefix that matches) and 404s otherwise. */
export function fakeFetch(routes: Record<string, unknown>) {
  const calls: { url: string; userAgent: string | null }[] = []
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, userAgent: new Headers(init?.headers).get('User-Agent') })
    const prefix = Object.keys(routes).find((p) => url.startsWith(p))
    return prefix ? Response.json(routes[prefix]) : Response.json({ status: 0, status_verbose: 'product not found' }, { status: 404 })
  }
  return { fetch, calls }
}
