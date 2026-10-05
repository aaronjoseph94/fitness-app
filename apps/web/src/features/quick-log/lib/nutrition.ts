// Owns: the food maths the meal forms show before the Worker answers — a portion of a per-100 g food, rescaling a
// portion, sums — and the meal slots: labels, which are shown, the default slot for the time of day, and the planned
// share of the day's kcal per slot.
import type { Food, MealSlot, Nutrients } from '@fitness/shared/schemas'

export const ZERO: Nutrients = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }

/** Per-100 g values of a food (as stored in `foods`). */
export type Per100g = Pick<Food, 'kcal_per_100g' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g'>

/** nutrient(grams) = per_100g × grams / 100 */
export function portion(food: Per100g, grams: number): Nutrients {
  const f = grams / 100
  return {
    kcal: food.kcal_per_100g * f,
    protein_g: food.protein_g * f,
    carbs_g: food.carbs_g * f,
    fat_g: food.fat_g * f,
    fibre_g: (food.fibre_g ?? 0) * f,
  }
}

/** Every nutrient × factor (e.g. new grams / old grams). */
export function scaled(n: Nutrients, factor: number): Nutrients {
  return {
    kcal: n.kcal * factor,
    protein_g: n.protein_g * factor,
    carbs_g: n.carbs_g * factor,
    fat_g: n.fat_g * factor,
    fibre_g: n.fibre_g * factor,
  }
}

export function sum(list: readonly Nutrients[]): Nutrients {
  return list.reduce(
    (a, n) => ({
      kcal: a.kcal + n.kcal,
      protein_g: a.protein_g + n.protein_g,
      carbs_g: a.carbs_g + n.carbs_g,
      fat_g: a.fat_g + n.fat_g,
      fibre_g: a.fibre_g + n.fibre_g,
    }),
    ZERO,
  )
}

// ── Slots ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** Lunch, Dinner, Snack — Breakfast first when Aaron has turned it on (SPEC §6). */
export function visibleSlots(breakfastEnabled: boolean): MealSlot[] {
  return breakfastEnabled ? ['breakfast', 'lunch', 'dinner', 'snack'] : ['lunch', 'dinner', 'snack']
}

/**
 * The slot for a meal eaten at wall time `time` ("HH:MM"): breakfast before 10:00 (when enabled), lunch 10:00–15:59,
 * dinner 16:00–20:59, snack otherwise.
 */
export function defaultSlot(time: string, breakfastEnabled: boolean): MealSlot {
  const hour = Number(time.slice(0, 2))
  if (hour < 10) return breakfastEnabled ? 'breakfast' : 'snack'
  if (hour < 16) return 'lunch'
  if (hour < 21) return 'dinner'
  return 'snack'
}

/** The wall time a meal logged for an earlier day gets when only its slot is known. */
export const SLOT_TIME: Record<MealSlot, string> = {
  breakfast: '08:00',
  lunch: '12:30',
  dinner: '18:30',
  snack: '15:00',
}

/**
 * Planned share of the day's kcal per slot. Daily targets carry no per-slot split yet, so "planned" per slot is this
 * share × the day's kcal target (UI estimate; replace when targets gain a split).
 */
export function slotShare(slot: MealSlot, breakfastEnabled: boolean): number {
  const shares: Record<MealSlot, number> = breakfastEnabled
    ? { breakfast: 0.2, lunch: 0.35, dinner: 0.35, snack: 0.1 }
    : { breakfast: 0, lunch: 0.4, dinner: 0.45, snack: 0.15 }
  return shares[slot]
}
