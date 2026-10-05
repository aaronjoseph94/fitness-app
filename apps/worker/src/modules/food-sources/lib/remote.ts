// Owns: the Open Food Facts and USDA FoodData Central requests (URLs, fields, data types) and turning their answers into
// food drafts. Every call goes through the gate (budget, timeout, User-Agent). Responses are parsed loosely: a record
// that does not fit is skipped, never thrown.
import * as z from 'zod'
import type { Gate } from './gate'
import { fromOff, fromUsda, OffProduct, UsdaFood, USDA_NUTRIENT_FILTER, type FoodDraft } from './normalise'

const OFF_PRODUCT = 'https://world.openfoodfacts.org/api/v2/product'
/** search-a-licious: OFF's full-text search (the legacy /cgi/search.pl is throttled and often unavailable). */
const OFF_SEARCH = 'https://search.openfoodfacts.org/search'
const OFF_FIELDS = 'code,product_name,brands,serving_size,nutriments,image_front_small_url'
const FDC = 'https://api.nal.usda.gov/fdc/v1'
/** Generic foods only: Foundation and SR Legacy (Branded is left to Open Food Facts). */
const FDC_GENERIC = 'Foundation,SR%20Legacy'

const OffProductResponse = z.looseObject({ status: z.union([z.number(), z.string()]).nullish(), product: z.unknown() })
const OffSearchResponse = z.looseObject({ hits: z.array(z.unknown()).default([]) })
const UsdaSearchResponse = z.looseObject({ foods: z.array(z.unknown()).default([]) })

const drafts = <T>(items: unknown[], schema: z.ZodType<T>, map: (t: T) => FoodDraft | null): FoodDraft[] =>
  items.flatMap((it) => {
    const r = schema.safeParse(it)
    const d = r.success ? map(r.data) : null
    return d ? [d] : []
  })

export interface Remote {
  /** OFF product by barcode; null when OFF does not know it or it has no energy value. */
  offProduct(code: string): Promise<FoodDraft | null>
  offSearch(q: string, n: number): Promise<FoodDraft[]>
  /** Empty when no USDA key is configured. */
  usdaSearch(q: string, n: number): Promise<FoodDraft[]>
  usdaFood(fdcId: string): Promise<FoodDraft | null>
}

export function createRemote(gate: Gate, usdaKey: string | undefined): Remote {
  return {
    async offProduct(code) {
      const body = OffProductResponse.safeParse(await gate.getJson('off', `${OFF_PRODUCT}/${code}?fields=${OFF_FIELDS}`))
      if (!body.success || Number(body.data.status) !== 1) return null
      const product = OffProduct.safeParse(body.data.product)
      return product.success ? fromOff(product.data) : null
    },
    async offSearch(q, n) {
      const url = `${OFF_SEARCH}?q=${encodeURIComponent(q)}&page_size=${n}&fields=${OFF_FIELDS}`
      const body = OffSearchResponse.safeParse(await gate.getJson('off', url))
      return body.success ? drafts(body.data.hits, OffProduct, fromOff) : []
    },
    async usdaSearch(q, n) {
      if (!usdaKey) return []
      const url = `${FDC}/foods/search?api_key=${encodeURIComponent(usdaKey)}&query=${encodeURIComponent(q)}&dataType=${FDC_GENERIC}&pageSize=${n}`
      const body = UsdaSearchResponse.safeParse(await gate.getJson('usda', url))
      return body.success ? drafts(body.data.foods, UsdaFood, fromUsda) : []
    },
    async usdaFood(fdcId) {
      if (!usdaKey || !/^\d+$/.test(fdcId)) return null
      const url = `${FDC}/food/${fdcId}?api_key=${encodeURIComponent(usdaKey)}&nutrients=${USDA_NUTRIENT_FILTER}`
      const food = UsdaFood.safeParse(await gate.getJson('usda', url))
      return food.success ? fromUsda(food.data) : null
    },
  }
}
