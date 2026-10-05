// Owns: the day adjustment's data (GLOSSARY "Day adjustment") — the newest 'adjustment' event for a date from the
// event feed (GET /api/events, re-read every 2.5 s for up to 40 s after a confirm until one newer than the confirm
// arrives), and what a suggestion logs: a favourite scaled to the suggested grams.
import { endpoints } from '@fitness/shared/api'
import type { AiEvent, Favourite } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { useApiQuery } from '../../../../api'

export type AdjustmentEvent = Extract<AiEvent, { kind: 'adjustment' }>

const WAIT_POLL_MS = 2_500
const WAIT_MAX_MS = 40_000

/** The newest adjustment for `date` (by created_at) among `events`, or null. */
export function latestAdjustment(events: readonly AiEvent[], date: string): AdjustmentEvent | null {
  let best: AdjustmentEvent | null = null
  for (const e of events) {
    if (e.kind !== 'adjustment' || e.body.date !== date) continue
    if (!best || e.created_at > best.created_at) best = e
  }
  return best
}

/**
 * The newest adjustment for `date`. With `since` (the server's updated_at of the meal just confirmed) it polls until an
 * adjustment created at or after it arrives (`fresh`), for at most 40 s; `waiting` is true meanwhile.
 */
export function useDayAdjustment(
  date: string,
  since: string | null = null,
): { adjustment: AdjustmentEvent | null; fresh: boolean; waiting: boolean } {
  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    setTimedOut(false)
    if (!since) return
    const timer = setTimeout(() => setTimedOut(true), WAIT_MAX_MS)
    return () => clearTimeout(timer)
  }, [since])
  const feed = useApiQuery(
    endpoints.day.events,
    { query: {} },
    {
      staleTime: 10_000,
      select: (page) => latestAdjustment(page.events, date),
      refetchInterval: (query) => {
        if (!since || timedOut) return false
        const latest = query.state.data ? latestAdjustment(query.state.data.events, date) : null
        return latest && latest.created_at >= since ? false : WAIT_POLL_MS
      },
    },
  )
  const adjustment = feed.data ?? null
  const fresh = adjustment !== null && (!since || adjustment.created_at >= since)
  return { adjustment, fresh, waiting: since !== null && !fresh && !timedOut && !feed.isError }
}

/**
 * The scale that logs `grams` of a favourite: food → grams / default_grams; recipe → grams / Σ recipe grams.
 * Clamped to the API's (0, 10]. Null when the favourite has no grams to scale by.
 */
export function suggestionScale(favourite: Favourite, grams: number): number | null {
  const base = favourite.kind === 'food' ? favourite.default_grams : favourite.recipe.reduce((a, r) => a + r.grams, 0)
  if (!(base > 0) || !(grams > 0)) return null
  return Math.min(10, Math.max(0.05, Math.round((grams / base) * 100) / 100))
}
