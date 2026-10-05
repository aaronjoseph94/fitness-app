// Owns: the reads every logging flow shares — the day (GET /api/day/:date), the settings the forms need (with SPEC
// defaults while they load or when they cannot), the last weigh-in, and recent foods with their last-used grams.
import { endpoints } from '@fitness/shared/api'
import type { Meal, MealItem, Nutrients } from '@fitness/shared/schemas'
import { useMemo } from 'react'
import { useApiQuery } from '../../../api'
import { dateOf, shiftDate } from './dates'
import { usePendingLogs } from './writes'

/** The day as GET /api/day/:date returns it (offline: the last copy on this phone). */
export function useDay(date: string) {
  return useApiQuery(endpoints.day.get, { params: { date } })
}

export interface LogSettings {
  breakfastEnabled: boolean
  waterTargetMl: number
  fastsPerMonth: number
  fastHours: number
}

/** SPEC §2/§6 defaults: breakfast hidden, 3,000 ml water, two 24 h fasts a month. Used until settings load. */
const DEFAULTS: LogSettings = { breakfastEnabled: false, waterTargetMl: 3000, fastsPerMonth: 2, fastHours: 24 }

export function useLogSettings(): LogSettings {
  const { data } = useApiQuery(endpoints.settings.get, {}, { staleTime: 5 * 60_000 })
  return useMemo(() => {
    if (!data) return DEFAULTS
    const s = data.settings
    return {
      breakfastEnabled: s.breakfast_enabled,
      waterTargetMl: s.water_target_ml,
      fastsPerMonth: s.fasts_per_month,
      fastHours: s.fast_hours,
    }
  }, [data])
}

export interface LastWeight {
  kg: number
  date: string
  /** Trend weight on that date, when known. */
  trendKg: number | null
  pending: boolean
}

/** The latest weigh-in on or before `date` (90 days back), counting weigh-ins still waiting to sync. */
export function useLastWeight(date: string): { last: LastWeight | null; onDate: LastWeight | null; isLoading: boolean } {
  const { data, isLoading } = useApiQuery(endpoints.body.trend, { query: { from: shiftDate(date, -90), to: date } })
  const pending = usePendingLogs(endpoints.body.createWeight)
  return useMemo(() => {
    let last: LastWeight | null = null
    for (const p of data?.points ?? []) {
      if (p.weight_kg !== null) last = { kg: p.weight_kg, date: p.date, trendKg: p.trend_kg, pending: false }
    }
    for (const p of pending) {
      if (p.body.date <= date && (!last || p.body.date >= last.date)) {
        last = { kg: p.body.weight_kg, date: p.body.date, trendKg: null, pending: true }
      }
    }
    return { last, onDate: last?.date === date ? last : null, isLoading }
  }, [data, pending, date, isLoading])
}

export interface RecentFood {
  foodId: string
  description: string
  /** Grams last logged. */
  grams: number
  /** Nutrients of `grams`. */
  nutrients: Nutrients
}

const RECENT_DAYS = 3
const RECENT_MAX = 8

function itemNutrients(item: MealItem): Nutrients {
  return { kcal: item.kcal, protein_g: item.protein_g, carbs_g: item.carbs_g, fat_g: item.fat_g, fibre_g: item.fibre_g }
}

/**
 * Foods from meals of the last three days ending on `date`, newest first, each with the grams last used. Three small
 * reads (one per day) that the Log tab already caches.
 */
export function useRecentFoods(date: string): RecentFood[] {
  const day0 = useApiQuery(endpoints.nutrition.listMeals, { query: { date } })
  const day1 = useApiQuery(endpoints.nutrition.listMeals, { query: { date: shiftDate(date, -1) } })
  const day2 = useApiQuery(endpoints.nutrition.listMeals, { query: { date: shiftDate(date, -2) } })
  return useMemo(() => {
    const meals: Meal[] = [day0.data, day1.data, day2.data].slice(0, RECENT_DAYS).flatMap((list) => list ?? [])
    meals.sort((a, b) => b.eaten_at.localeCompare(a.eaten_at))
    const out = new Map<string, RecentFood>()
    for (const meal of meals) {
      for (const item of meal.items) {
        if (!item.food_id || out.has(item.food_id) || item.grams <= 0) continue
        out.set(item.food_id, {
          foodId: item.food_id,
          description: item.description,
          grams: item.grams,
          nutrients: itemNutrients(item),
        })
        if (out.size >= RECENT_MAX) return [...out.values()]
      }
    }
    return [...out.values()]
  }, [day0.data, day1.data, day2.data])
}

export interface WaterDay {
  /** Server total plus entries not yet synced. */
  totalMl: number
  /** False while the day has not loaded (offline with nothing cached, or the server failed): the total is unknown. */
  known: boolean
  targetMl: number
  /** Entries for the day not yet reflected in the server total (queued or saving). */
  pending: { id: string; amountMl: number; loggedAt: string; queued: boolean }[]
  isLoading: boolean
  error: unknown
  refetch: () => void
}

/** Water for one day: the total vs the day's target (or the settings target), with unsynced entries added in. */
export function useWater(date: string): WaterDay {
  const day = useDay(date)
  const settings = useLogSettings()
  const pendingLogs = usePendingLogs(endpoints.water.create)
  return useMemo(() => {
    const pending = pendingLogs
      .map((p) => ({ id: p.body.id, amountMl: p.body.amount_ml, loggedAt: p.body.logged_at ?? p.at, queued: p.queued }))
      .filter((p) => dateOf(p.loggedAt) === date)
    const serverMl = day.data?.water_ml ?? 0
    return {
      totalMl: serverMl + pending.reduce((a, p) => a + p.amountMl, 0),
      known: day.data !== undefined,
      targetMl: day.data?.targets?.water_ml ?? settings.waterTargetMl,
      pending,
      isLoading: day.isLoading,
      error: day.error,
      refetch: () => void day.refetch(),
    }
  }, [day.data, day.isLoading, day.error, day.refetch, settings.waterTargetMl, pendingLogs, date])
}
