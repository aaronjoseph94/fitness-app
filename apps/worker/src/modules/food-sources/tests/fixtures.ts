// Owns: recorded-shape responses from Open Food Facts (trimmed live answers, 2026-10-05) and a fake fetch that serves
// them by URL prefix and records every call. No source needs an API key any more, which is why the recorder keeps
// `apiKey`: it proves nothing is sent.
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

/** GET search.openfoodfacts.org/search?q=Oikos%20Pro%20yogurt&page_size=3&fields=… (a branded product). */
export const OFF_SEARCH_OIKOS = {
  hits: [
    {
      code: '0056800100237',
      brands: ['Oikos'],
      nutriments: { carbohydrates_100g: 5.3, 'energy-kcal_100g': 90, fat_100g: 2.3, fiber_100g: 0, proteins_100g: 15, salt_100g: 0.1, sugars_100g: 4 },
      product_name: 'Oikos Pro Yogurt',
    },
  ],
  page: 1,
  page_size: 3,
  page_count: 1,
}

/** A fetch that answers from `routes` (first URL prefix that matches) and 404s otherwise. */
export function fakeFetch(routes: Record<string, unknown>) {
  const calls: { url: string; userAgent: string | null; apiKey: string | null }[] = []
  const fetch: Fetch = async (url, init) => {
    const headers = new Headers(init?.headers)
    calls.push({ url, userAgent: headers.get('User-Agent'), apiKey: headers.get('X-Api-Key') })
    const prefix = Object.keys(routes).find((p) => url.startsWith(p))
    return prefix ? Response.json(routes[prefix]) : Response.json({ status: 0, status_verbose: 'product not found' }, { status: 404 })
  }
  return { fetch, calls }
}
