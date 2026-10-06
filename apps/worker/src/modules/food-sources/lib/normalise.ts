// Owns: mapping each nutrition source's record to one food draft per 100 g (the `foods` row minus id/timestamps), and
// scaling a food to a portion. Open Food Facts is the only remote source (Canadian food data is seeded locally), so its
// product shape is the one validated loosely with Zod here.
import { portion, type Per100gLike } from '@fitness/shared/engine'
import type { Nutrients } from '@fitness/shared/schemas'
import * as z from 'zod'
import type { foods, NewRow } from '../../../db'

/** A food from a source, ready to cache: every nutrient per 100 g; sodium in mg; `raw` keeps the source record. */
export type FoodDraft = Required<Omit<NewRow<typeof foods>, 'id' | 'created_at' | 'updated_at'>> & {
  source: 'off'
  source_id: string
}

/** Per-100 g values a portion is computed from (a cached food row or a draft). */
export type Per100g = Per100gLike

const KJ_PER_KCAL = 4.184
/** Salt → sodium: sodium_g = salt_g / 2.5, so sodium_mg = salt_g × 400. */
const SODIUM_MG_PER_G_SALT = 400

const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null
}
const barcodeOf = (code: unknown) => (typeof code === 'string' && /^\d{8,14}$/.test(code) ? code : null)

/** Reject records that cannot be a real food per 100 g (energy over pure fat, a macro over 100 g). */
function plausible(d: FoodDraft): FoodDraft | null {
  const macros = [d.protein_g, d.carbs_g, d.fat_g, d.fibre_g]
  return d.kcal_per_100g <= 950 && macros.every((m) => m <= 100) ? d : null
}

/** A portion of a food: the engine's `portion` (per-100 g value × grams / 100, to 0.1; unknown fibre counts as 0). */
export function nutritionFor(food: Per100g, grams: number): Nutrients {
  return portion(food, grams)
}

// ── Open Food Facts (v2 product, and search-a-licious hits) ─────────────────────────────────────────────────

export const OffProduct = z.looseObject({
  code: z.string(),
  product_name: z.string().nullish(),
  /** "Danone, Oikos" from /api/v2/product; ["Danone", "Oikos"] from search.openfoodfacts.org. */
  brands: z.union([z.string(), z.array(z.string())]).nullish(),
  serving_size: z.string().nullish(),
  nutriments: z.record(z.string(), z.unknown()).nullish(),
  image_front_small_url: z.string().nullish(),
})
export type OffProduct = z.infer<typeof OffProduct>

/** "1 bar (40 g)" → 40, "250ml" → 250 (ml counted as g), "2 biscuits" → null. */
function servingGrams(size: string | null | undefined): number | null {
  const m = size?.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)\b/i)
  return m ? round(Number(m[1]!.replace(',', '.')), 1) : null
}

/**
 * OFF nutriments are already per 100 g (`*_100g`). kcal = energy-kcal_100g, else energy-kj_100g (or energy_100g,
 * always kJ) ÷ 4.184; sodium_mg = sodium_100g × 1,000, else salt_100g × 400. Null when there is no energy value.
 */
export function fromOff(p: OffProduct): FoodDraft | null {
  const n = p.nutriments ?? {}
  const kj = num(n['energy-kj_100g']) ?? num(n['energy_100g'])
  const kcal = num(n['energy-kcal_100g']) ?? (kj === null ? null : kj / KJ_PER_KCAL)
  if (kcal === null) return null
  const brands = Array.isArray(p.brands) ? p.brands : (p.brands ?? '').split(',')
  const brand = brands.map((b) => b.trim()).find(Boolean) ?? null
  const sodium = num(n.sodium_100g)
  const salt = num(n.salt_100g)
  return plausible({
    source: 'off',
    source_id: p.code,
    barcode: barcodeOf(p.code),
    name: p.product_name?.trim() || (brand ? `${brand} ${p.code}` : p.code),
    brand,
    serving_g: servingGrams(p.serving_size),
    kcal_per_100g: round(kcal, 1),
    protein_g: num(n.proteins_100g) ?? 0,
    carbs_g: num(n.carbohydrates_100g) ?? 0,
    fat_g: num(n.fat_100g) ?? 0,
    fibre_g: num(n.fiber_100g) ?? 0,
    sugar_g: num(n.sugars_100g),
    sodium_mg: sodium !== null ? round(sodium * 1000, 1) : salt !== null ? round(salt * SODIUM_MG_PER_G_SALT, 1) : null,
    raw: p,
  })
}
