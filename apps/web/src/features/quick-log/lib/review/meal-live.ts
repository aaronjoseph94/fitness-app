// Owns: following a meal while the AI analyses it — the day's meals (GET /api/meals?date) re-read every 2 s while a
// recent meal is 'parsing' (5 s after a minute, 30 s after three, so a stuck job never hammers the Worker), one meal
// out of that list, and how its analysis reads: in progress, slow, done, or failed (in review with nothing found).
import { endpoints } from '@fitness/shared/api'
import type { Meal } from '@fitness/shared/schemas'
import { useApiQuery } from '../../../../api'

/** SPEC §12 acceptance: a photo becomes an item list in under 20 s; past this the UI offers manual items. */
export const SLOW_AFTER_MS = 30_000

/** Poll interval for a day's meals: fast while a meal analysed in the last minute is parsing, slower after, else none. */
export function parsingPollMs(meals: readonly Meal[] | undefined, now = Date.now()): number | false {
  const ages = (meals ?? []).filter((m) => m.status === 'parsing').map((m) => now - Date.parse(m.created_at))
  if (ages.length === 0) return false
  const youngest = Math.min(...ages)
  return youngest < 60_000 ? 2_000 : youngest < 180_000 ? 5_000 : 30_000
}

/** The day's meals, polled while one is being analysed. Shared by the Log tab and the review (same query). */
export function useDayMealsLive(date: string) {
  return useApiQuery(endpoints.nutrition.listMeals, { query: { date } }, { refetchInterval: (query) => parsingPollMs(query.state.data) })
}

export type AnalysisState =
  /** The job is running (or queued). */
  | 'analysing'
  /** Running longer than SPEC's 20 s: Aaron may add items himself. */
  | 'slow'
  /** Items are back for review. */
  | 'ready'
  /** In review with no items from a text/photo meal: the providers failed or found nothing. */
  | 'failed'
  | 'confirmed'

export function analysisState(meal: Meal, now = Date.now()): AnalysisState {
  if (meal.status === 'confirmed') return 'confirmed'
  if (meal.status === 'parsing') return now - Date.parse(meal.created_at) > SLOW_AFTER_MS ? 'slow' : 'analysing'
  const analysed = meal.input_method === 'text' || meal.input_method === 'voice' || meal.input_method === 'photo'
  return analysed && meal.items.length === 0 ? 'failed' : 'ready'
}

/** One meal of a day, followed live. `meal` is null while loading or once it is gone (deleted). */
export function useLiveMeal(date: string, mealId: string) {
  const list = useDayMealsLive(date)
  const meal = list.data?.find((m) => m.id === mealId) ?? null
  return { meal, isLoading: list.isLoading, error: list.error, refetch: list.refetch }
}
