// Owns: what Today adds on top of the server's day while logs are saving or wait in the offline queue — water added, a
// weigh-in, meals, a fast started or ended, steps and sleep — from the logging kit's usePendingLogs (one per endpoint).
import { endpoints } from '@fitness/shared/api'
import { localDate } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { useMemo } from 'react'
import { usePendingLogs, type PendingLog } from '../../quick-log'

export interface PendingToday {
  /** Pending writes that change this date. */
  count: number
  /** Water pending for this date, ml. */
  waterMl: number
  /** The latest pending weigh-in for this date, kg. */
  weighInKg: number | null
  /** Meals pending for this date (their nutrition is known once the Worker has them). */
  meals: number
  /** The latest pending fast action. */
  fast: 'started' | 'ended' | null
  steps: number | null
  sleepMin: number | null
}

const last = <T,>(list: readonly T[]): T | undefined => list[list.length - 1]
const latestAt = (logs: readonly PendingLog<unknown>[]) => last(logs)?.at ?? ''

/** Pending logs, oldest first per endpoint, folded into what they change on `date` (later writes win). */
export function usePendingToday(date: LocalDate): PendingToday {
  const water = usePendingLogs(endpoints.water.create)
  const weighIns = usePendingLogs(endpoints.body.createWeight)
  const meals = usePendingLogs(endpoints.nutrition.createMeal)
  const fastStarts = usePendingLogs(endpoints.fasting.start)
  const fastEnds = usePendingLogs(endpoints.fasting.end)
  const steps = usePendingLogs(endpoints.health.createSteps)
  const sleep = usePendingLogs(endpoints.health.createSleep)
  return useMemo(() => {
    const waterToday = water.filter((w) => localDate(w.body.logged_at ?? w.at) === date)
    const weighInToday = weighIns.filter((w) => w.body.date === date)
    const mealsToday = meals.filter((m) => localDate(m.body.eaten_at) === date)
    const stepsToday = steps.filter((s) => s.body.date === date)
    const sleepToday = sleep.filter((s) => s.body.date === date)
    const night = last(sleepToday)?.body
    const fasts = fastStarts.length + fastEnds.length
    return {
      count: waterToday.length + weighInToday.length + mealsToday.length + fasts + stepsToday.length + sleepToday.length,
      waterMl: waterToday.reduce((sum, w) => sum + w.body.amount_ml, 0),
      weighInKg: last(weighInToday)?.body.weight_kg ?? null,
      meals: mealsToday.length,
      fast: fasts === 0 ? null : latestAt(fastEnds) >= latestAt(fastStarts) ? 'ended' : 'started',
      steps: last(stepsToday)?.body.steps ?? null,
      sleepMin: !night
        ? null
        : (night.asleep_min ??
          (night.in_bed_at && night.woke_at ? Math.round((Date.parse(night.woke_at) - Date.parse(night.in_bed_at)) / 60_000) : null)),
    }
  }, [date, water, weighIns, meals, fastStarts, fastEnds, steps, sleep])
}
