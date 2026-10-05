// Owns: mapping each nutrition source's record to one food draft per 100 g (the `foods` row minus id/timestamps), and
// scaling a food to a portion. Open Food Facts and USDA FoodData Central shapes are validated loosely with Zod here.
import { portion, type Per100gLike } from '@fitness/shared/engine'
import type { Nutrients } from '@fitness/shared/schemas'
import * as z from 'zod'
import type { foods, NewRow } from '../../../db'

/** A food from a source, ready to cache: every nutrient per 100 g; sodium in mg; `raw` keeps the source record. */
export type FoodDraft = Required<Omit<NewRow<typeof foods>, 'id' | 'created_at' | 'updated_at'>> & {
  source: 'off' | 'usda'
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

// ── USDA FoodData Central (search hits, and /food/{fdcId} in full or abridged format) ───────────────────────

const UsdaNutrient = z.looseObject({
  nutrientNumber: z.string().nullish(), // search
  value: z.number().nullish(),
  number: z.string().nullish(), // abridged details
  amount: z.number().nullish(),
  nutrient: z.looseObject({ number: z.string().nullish() }).nullish(), // full details
})
export const UsdaFood = z.looseObject({
  fdcId: z.number().int(),
  description: z.string().min(1),
  dataType: z.string().nullish(),
  brandOwner: z.string().nullish(),
  brandName: z.string().nullish(),
  gtinUpc: z.string().nullish(),
  servingSize: z.number().nullish(),
  servingSizeUnit: z.string().nullish(),
  foodNutrients: z.array(UsdaNutrient).default([]),
  foodPortions: z
    .array(z.looseObject({ gramWeight: z.number().nullish(), amount: z.number().nullish(), modifier: z.string().nullish(), portionDescription: z.string().nullish() }))
    .nullish(),
})
export type UsdaFood = z.infer<typeof UsdaFood>

/** FDC nutrient numbers (the legacy SR numbers FDC still reports beside its ids). First present wins. */
const USDA_NUMBERS = {
  kcal: ['208', '958', '957'], // Energy (kcal); Atwater specific / general factors (Foundation foods)
  kj: ['268'],
  protein: ['203'],
  carbs: ['205', '205.2'], // by difference; by summation
  fat: ['204'],
  fibre: ['291'],
  sugar: ['269', '269.3'], // Sugars, total; Sugars, Total NLEA
  sodium: ['307'], // mg
} as const
/** The details endpoint returns only these nutrients (keeps the response small); its filter takes whole numbers only. */
export const USDA_NUTRIENT_FILTER = [...new Set(Object.values(USDA_NUMBERS).flat())].filter((n) => /^\d+$/.test(n)).join(',')

/** A typical serving: the stated serving in grams, else the "medium" portion, else the first portion with a weight. */
function usdaServing(f: UsdaFood): number | null {
  if (f.servingSize && /^(g|grm)$/i.test(f.servingSizeUnit ?? '')) return round(f.servingSize, 1)
  const portions = (f.foodPortions ?? []).filter((p) => (p.gramWeight ?? 0) > 0)
  const pick = portions.find((p) => /medium/i.test(`${p.modifier ?? ''} ${p.portionDescription ?? ''}`)) ?? portions[0]
  return pick ? round(pick.gramWeight! / (pick.amount || 1), 1) : null
}

/** FDC nutrients are per 100 g for Foundation, SR Legacy (and Branded `foodNutrients`). Null without an energy value. */
export function fromUsda(f: UsdaFood): FoodDraft | null {
  const values = new Map<string, number>()
  for (const n of f.foodNutrients) {
    const key = n.nutrientNumber ?? n.number ?? n.nutrient?.number
    const v = num(n.value ?? n.amount)
    if (key && v !== null && !values.has(key)) values.set(key, v)
  }
  const first = (keys: readonly string[]) => keys.map((k) => values.get(k)).find((v) => v !== undefined) ?? null
  const kj = first(USDA_NUMBERS.kj)
  const kcal = first(USDA_NUMBERS.kcal) ?? (kj === null ? null : kj / KJ_PER_KCAL)
  if (kcal === null) return null
  return plausible({
    source: 'usda',
    source_id: String(f.fdcId),
    barcode: barcodeOf(f.gtinUpc),
    name: f.description.trim(),
    brand: f.brandName?.trim() || f.brandOwner?.trim() || null,
    serving_g: usdaServing(f),
    kcal_per_100g: round(kcal, 1),
    protein_g: first(USDA_NUMBERS.protein) ?? 0,
    carbs_g: first(USDA_NUMBERS.carbs) ?? 0,
    fat_g: first(USDA_NUMBERS.fat) ?? 0,
    fibre_g: first(USDA_NUMBERS.fibre) ?? 0,
    sugar_g: first(USDA_NUMBERS.sugar),
    sodium_mg: first(USDA_NUMBERS.sodium),
    raw: { fdcId: f.fdcId, dataType: f.dataType ?? null, description: f.description, brandOwner: f.brandOwner ?? null },
  })
}
