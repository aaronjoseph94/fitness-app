// Owns: logging adherence (GLOSSARY "Adherence") — per day, and as the share of days in a window.
import type { LocalDate } from '../../schemas/common'
import type { DayRow } from './types'

/** A v_day row as adherence reads it. */
export type AdherenceDay = Pick<DayRow, 'date' | 'weight_kg' | 'meals_logged' | 'is_fast_day' | 'water_ml'>

export type DayAdherence = {
  date: LocalDate
  weigh_in: boolean
  meals_or_fast: boolean
  water: boolean
  /** Share of the three checks met: 0, ⅓, ⅔ or 1 (the adherence heatmap). */
  score: number
  /** All three met. */
  adherent: boolean
}

/**
 * One day: weigh_in = weight_kg ≠ null; meals_or_fast = meals_logged ≥ 2 ∨ is_fast_day; water = water_ml > 0.
 *   score = (weigh_in + meals_or_fast + water) / 3;  adherent = score = 1
 */
export function dayAdherence(day: AdherenceDay): DayAdherence {
  const weigh_in = day.weight_kg !== null
  const meals_or_fast = day.meals_logged >= 2 || day.is_fast_day
  const water = day.water_ml > 0
  const met = Number(weigh_in) + Number(meals_or_fast) + Number(water)
  return { date: day.date, weigh_in, meals_or_fast, water, score: met / 3, adherent: met === 3 }
}

export type AdherenceWindow = { share: number; adherent_days: number; window_days: number; by_day: DayAdherence[] }

/**
 * A window: share = adherent days / window days. `window_days` defaults to the rows given; pass the calendar length
 * when rows may be missing (a missing day counts as not adherent). share = 0 for an empty window.
 */
export function adherence(days: readonly AdherenceDay[], window_days = days.length): AdherenceWindow {
  const by_day = days.map(dayAdherence)
  const adherent_days = by_day.filter((d) => d.adherent).length
  return { share: window_days > 0 ? adherent_days / window_days : 0, adherent_days, window_days, by_day }
}
