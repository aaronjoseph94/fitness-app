// Owns: the Open Food Facts requests (URLs, fields, data types) and turning its answers into food drafts. Every call goes
// through the gate (budget, timeout, User-Agent); no API key is needed. Responses are parsed loosely: a record that does
// not fit is skipped, never thrown.
import * as z from 'zod'
import type { Gate } from './gate'
import { fromOff, OffProduct, type FoodDraft } from './normalise'

const OFF_PRODUCT = 'https://world.openfoodfacts.org/api/v2/product'
/** search-a-licious: OFF's full-text search (the legacy /cgi/search.pl is throttled and often unavailable). */
const OFF_SEARCH = 'https://search.openfoodfacts.org/search'
const OFF_FIELDS = 'code,product_name,brands,serving_size,nutriments,image_front_small_url'

const OffProductResponse = z.looseObject({ status: z.union([z.number(), z.string()]).nullish(), product: z.unknown() })
const OffSearchResponse = z.looseObject({ hits: z.array(z.unknown()).default([]) })

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
}

export function createRemote(gate: Gate): Remote {
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
  }
}
