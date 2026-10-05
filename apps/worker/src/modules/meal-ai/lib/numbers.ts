// Owns: the numbers on a day_adjustment card — computed in code from the day view, never by the LLM: what is left of
// the day's targets, the protein status, and which favourites fit what is left (a deterministic filter). Pure.
import type { DayAdjustmentOutput, DayView, Favourite, Remaining } from '@fitness/shared/schemas'

/** Protein is "short" when eating what is left of it would take more than this share of the kcal left. */
export const PROTEIN_SHARE_LIMIT = 0.5
/** kcal per gram of protein (Atwater). */
const KCAL_PER_G_PROTEIN = 4
/** At most this many suggestions on a card (SPEC §6: two or three). */
export const MAX_SUGGESTIONS = 3

export type DayStatus = DayAdjustmentOutput['status']

/** What is left of the day's targets: DayView.remaining (targets − confirmed intake), or 0s when the date has no targets. */
export function remainingOf(day: Pick<DayView, 'remaining'>): Remaining {
  return day.remaining ?? { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
}

/**
 * status = 'over'           when remaining.kcal < 0 (intake above the day's kcal target)
 *        = 'protein_short'  when remaining.protein_g > 0 and 4 × remaining.protein_g > 0.5 × remaining.kcal
 *                           (the protein still to eat would need more than half the kcal left)
 *        = 'ok'             otherwise
 * e.g. 1,400 kcal / 130 g targets, 525 kcal and 65.9 g eaten → 875 kcal and 64.1 g left: 256.4 ≤ 437.5 → ok.
 */
export function dayStatus(remaining: Remaining): DayStatus {
  if (remaining.kcal < 0) return 'over'
  if (remaining.protein_g > 0 && KCAL_PER_G_PROTEIN * remaining.protein_g > PROTEIN_SHARE_LIMIT * remaining.kcal) return 'protein_short'
  return 'ok'
}

export interface SuggestionPick {
  favourite_id: string
  label: string
  /** Grams of one default portion (food: default_grams; recipe: Σ item grams). */
  grams: number
  kcal: number
  protein_g: number
}

/**
 * Favourites that fit what is left: one default portion with 0 < kcal ≤ remaining.kcal, ordered by protein density
 * (protein_g / kcal, highest first; protein is the rail that is easiest to miss), then larger portions first; at most 3.
 * None when the day is over.
 */
export function pickSuggestions(favourites: readonly Favourite[], remaining: Remaining, status: DayStatus): SuggestionPick[] {
  if (status === 'over') return []
  return favourites
    .filter((f) => f.totals.kcal > 0 && f.totals.kcal <= remaining.kcal)
    .sort((a, b) => b.totals.protein_g / b.totals.kcal - a.totals.protein_g / a.totals.kcal || b.totals.kcal - a.totals.kcal)
    .slice(0, MAX_SUGGESTIONS)
    .map((f) => ({
      favourite_id: f.id,
      label: f.label,
      grams: f.kind === 'food' ? f.default_grams : f.recipe.reduce((sum, i) => sum + i.grams, 0),
      kcal: f.totals.kcal,
      protein_g: f.totals.protein_g,
    }))
}

const r0 = (n: number) => Math.round(n)

/** The card's reason for a suggestion when no LLM wrote one: its numbers against what is left. */
export function fallbackWhy(p: SuggestionPick, remaining: Remaining): string {
  return `${r0(p.kcal)} kcal and ${r0(p.protein_g)} g protein, inside the ${r0(remaining.kcal)} kcal left.`
}

/**
 * The card's note when no LLM wrote one. `fast_day`: the date is the fast's 0 kcal day; `fasting`: a fast runs now;
 * `fast_day_tomorrow`: the running fast's fast day is tomorrow (it began this afternoon).
 */
export function fallbackNote(
  status: DayStatus,
  remaining: Remaining,
  fast: { fast_day: boolean; fasting?: boolean; fast_day_tomorrow?: boolean; water_target_ml: number | null },
): string {
  if (fast.fast_day)
    return `Fast day: keep drinking water${fast.water_target_ml ? ` (${r0(fast.water_target_ml)} ml today)` : ''} and keep training light, a walk or an easy session.`
  if (fast.fasting)
    return fast.fast_day_tomorrow
      ? 'Fasting now: keep drinking water. Tomorrow is the fast day: 0 kcal, more water and a light session.'
      : 'Fasting now: keep drinking water, and end the fast in the app when you eat.'
  if (status === 'over') return `${r0(-remaining.kcal)} kcal over today. One day is fine; the weekly trend is what counts.`
  if (status === 'protein_short') return `${r0(remaining.protein_g)} g protein still to go in ${r0(remaining.kcal)} kcal: pick protein-dense food.`
  return `${r0(remaining.kcal)} kcal and ${r0(Math.max(0, remaining.protein_g))} g protein left today.`
}

/** The event summary line for a card. */
export function adjustmentSummary(
  status: DayStatus,
  remaining: Remaining,
  fast: { fast_day: boolean; fasting?: boolean; fast_day_tomorrow?: boolean },
): string {
  if (fast.fast_day) return 'Fast day: water and a light session'
  if (fast.fasting) return fast.fast_day_tomorrow ? 'Fasting now: water; tomorrow is the fast day' : 'Fasting now: water'
  if (status === 'over') return `${r0(-remaining.kcal)} kcal over today`
  if (status === 'protein_short') return `${r0(remaining.kcal)} kcal left, protein short by ${r0(remaining.protein_g)} g`
  return `${r0(remaining.kcal)} kcal left today`
}
