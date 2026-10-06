// Owns: the food maths the meal forms show before the Worker answers — re-exported from the engine (a portion of a
// per-100 g food, rescaling a portion, sums, each to 0.1 as the Worker stores them) — and the meal slots: labels, the
// slot order, the default slot for the time of day, and the planned share of the day's kcal per slot. Breakfast is
// always one of them (SPEC §6): it is the first meal of the day, not an option to switch on.
import type { Per100gLike } from '@fitness/shared/engine'
import type { MealSlot } from '@fitness/shared/schemas'

export { portion, scaleNutrients as scaled, sumNutrients as sum } from '@fitness/shared/engine'

/** Per-100 g values of a food (as stored in `foods`). */
export type Per100g = Per100gLike

// ── Slots ─────────────────────────────────────────────────────────────────────────────────────────────────────────

export const SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

/** Every slot in meal order: Breakfast, Lunch, Dinner, Snack. */
export function visibleSlots(): MealSlot[] {
  return ['breakfast', 'lunch', 'dinner', 'snack']
}

/**
 * The slot for a meal eaten at wall time `time` ("HH:MM"): breakfast before 10:00, lunch 10:00–15:59, dinner
 * 16:00–20:59, snack otherwise.
 */
export function defaultSlot(time: string): MealSlot {
  const hour = Number(time.slice(0, 2))
  if (hour < 10) return 'breakfast'
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
export function slotShare(slot: MealSlot): number {
  const shares: Record<MealSlot, number> = { breakfast: 0.2, lunch: 0.35, dinner: 0.35, snack: 0.1 }
  return shares[slot]
}
