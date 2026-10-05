// Owns: a meal item while Aaron edits it (pure) — built from a server item, a picked food or typed nutrition; its
// nutrients at the grams typed (a food's per-100 g values when known, else the server's nutrients rescaled); the grams
// stepper's step; the confidence level the chip shows; and the PATCH item it becomes.
import type { MealItem, MealItemInput, Nutrients } from '@fitness/shared/schemas'
import type { PickedFood } from '../FoodPicker'
import { portion, scaled, sum, type Per100g } from '../nutrition'
import { parseNumber } from '../ui'

export interface DraftItem {
  /** The meal item's client id (kept across a swap, so a PATCH replaces in place). */
  id: string
  description: string
  /** As typed ("150", "92.5"). */
  grams: string
  foodId: string | null
  /** Per-100 g values when known (a food picked on this phone). */
  per100: Per100g | null
  /** Nutrients at `grams` the server (or the AI estimate) gave, to rescale when per-100 g values are not known. */
  base: { grams: number; nutrients: Nutrients } | null
  /** The analysis's confidence, 0–1; null for foods Aaron picked. */
  confidence: number | null
  /** No database match: the LLM guessed the nutrition. */
  estimated: boolean
}

export const MAX_ITEM_GRAMS = 5000
export const MAX_ITEMS = 50

const round1 = (n: number) => Math.round(n * 10) / 10

export function nutrientsOf(item: Pick<MealItem, 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g'>): Nutrients {
  return { kcal: item.kcal, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, fibre_g: item.fibre_g }
}

export function fromMealItem(item: MealItem): DraftItem {
  return {
    id: item.id,
    description: item.description,
    grams: String(round1(item.grams)),
    foodId: item.food_id,
    per100: null,
    base: { grams: item.grams, nutrients: nutrientsOf(item) },
    confidence: item.confidence,
    estimated: item.estimated,
  }
}

/** A newly picked food at `grams` (default: its serving, else 100 g). */
export function fromFood(food: PickedFood, grams?: number): DraftItem {
  const g = grams ?? food.servingG ?? 100
  return {
    id: crypto.randomUUID(),
    description: food.name,
    grams: String(round1(g)),
    foodId: food.id,
    per100: food.per100,
    base: null,
    confidence: null,
    estimated: false,
  }
}

/** Swap the food behind an item: same id and grams, the new food's name and values. */
export function swapFood(item: DraftItem, food: PickedFood): DraftItem {
  return { ...item, description: food.name, foodId: food.id, per100: food.per100, base: null, confidence: null, estimated: false }
}

/** Grams as a number when valid (0 < g ≤ 5,000), else null. */
export function gramsOf(item: DraftItem): number | null {
  const g = parseNumber(item.grams)
  return g !== null && g > 0 && g <= MAX_ITEM_GRAMS ? g : null
}

/** nutrients(g) = per_100g × g / 100 when known, else base.nutrients × g / base.grams; null when neither is known. */
export function itemNutrients(item: DraftItem): Nutrients | null {
  const g = gramsOf(item)
  if (g === null) return null
  if (item.per100) return portion(item.per100, g)
  if (item.base && item.base.grams > 0) return scaled(item.base.nutrients, g / item.base.grams)
  return null
}

/** Totals of the items whose nutrients are known, and whether every item counted. */
export function draftTotals(items: readonly DraftItem[]): { totals: Nutrients; complete: boolean } {
  const known = items.map(itemNutrients)
  return { totals: sum(known.filter((n): n is Nutrients => n !== null)), complete: known.every((n) => n !== null) }
}

/**
 * The grams stepper moves to the next multiple of its step: 5 g under 50 g, 10 g under 300 g, 25 g above.
 * step(147, +1) → 150; step(150, +1) → 160; step(40, −1) → 35; never below the step.
 */
export function stepGrams(grams: number, direction: 1 | -1): number {
  const size = (g: number) => (g < 50 ? 5 : g < 300 ? 10 : 25)
  const step = size(direction === 1 ? grams : Math.max(0, grams - 0.001))
  const next = direction === 1 ? Math.floor(grams / step) * step + step : Math.ceil(grams / step) * step - step
  return Math.min(MAX_ITEM_GRAMS, Math.max(5, next))
}

export type ConfidenceLevel = 'high' | 'medium' | 'low'

/** high ≥ 0.8, medium ≥ 0.5, low below; null for items without a confidence. */
export function confidenceLevel(confidence: number | null): ConfidenceLevel | null {
  if (confidence === null) return null
  return confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low'
}

/** The PATCH item: a food reference (the server prices it per 100 g), or custom nutrition rescaled to the grams. */
export function toItemInput(item: DraftItem): MealItemInput | null {
  const grams = gramsOf(item)
  if (grams === null) return null
  if (item.foodId) return { id: item.id, food_id: item.foodId, grams, description: item.description.slice(0, 200) }
  const n = itemNutrients(item)
  if (!n) return null
  return {
    id: item.id,
    description: item.description.slice(0, 200) || 'Item',
    grams,
    kcal: round1(n.kcal),
    protein_g: round1(n.protein_g),
    carbs_g: round1(n.carbs_g),
    fat_g: round1(n.fat_g),
    fibre_g: round1(n.fibre_g),
    estimated: item.estimated,
  }
}

/** Every item as a PATCH item, or null when any is incomplete (grams missing or out of range). */
export function toItemInputs(items: readonly DraftItem[]): MealItemInput[] | null {
  const out: MealItemInput[] = []
  for (const item of items) {
    const input = toItemInput(item)
    if (!input) return null
    out.push(input)
  }
  return out
}
