// Owns: food maths (SPEC §6) — a portion of a per-100 g food, rescaling a portion, and summing items into meal totals.
// The Worker stores these numbers and the web previews them before saving, so both call these functions.
import type { NutrientsLike } from './types'

/** Per-100 g values of a food (structurally a subset of `Food`); unknown fibre is null. */
export type Per100gLike = {
  kcal_per_100g: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number | null
}

const NUTRIENTS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] as const
const round1 = (x: number) => Math.round(x * 10) / 10
const each = (f: (k: (typeof NUTRIENTS)[number]) => number): NutrientsLike =>
  Object.fromEntries(NUTRIENTS.map((k) => [k, round1(f(k))])) as NutrientsLike

/**
 * nutrient(grams) = round(per_100g × grams / 100, 0.1); kcal from kcal_per_100g; unknown fibre (null) counts as 0.
 * e.g. banana 89 kcal/100 g × 120 g → 106.8 kcal.
 */
export function portion(food: Per100gLike, grams: number): NutrientsLike {
  const f = grams / 100
  const per100 = { ...food, kcal: food.kcal_per_100g, fibre_g: food.fibre_g ?? 0 }
  return each((k) => per100[k] * f)
}

/** nutrient = round(n × factor, 0.1)  (factor e.g. new grams / old grams). */
export function scaleNutrients(n: NutrientsLike, factor: number): NutrientsLike {
  return each((k) => n[k] * factor)
}

/** total = round(Σ items[nutrient], 0.1). */
export function sumNutrients(items: readonly NutrientsLike[]): NutrientsLike {
  return each((k) => items.reduce((s, i) => s + i[k], 0))
}
