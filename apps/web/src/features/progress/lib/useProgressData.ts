// Owns: the reads behind the Progress tab for one range — v_day rows (GET /api/days), the trend series with forecast,
// measurements and milestones (GET /api/trend), fasts from the range start on (so planned ones show), the range's
// workout sessions with their sets (GET /api/sessions), and settings (start date, goal, fast length). Switching range keeps the previous range on screen until the new one arrives.
import { endpoints } from '@fitness/shared/api'
import { keepPreviousData } from '@tanstack/react-query'
import { useApiQuery } from '../../../api'
import { rangeDates, type RangeKey } from './range'
import type { LocalDate } from '@fitness/shared/schemas'

export function useProgressData(range: RangeKey, date: LocalDate) {
  const settings = useApiQuery(endpoints.settings.get, {})
  // Ranges start no earlier than the profile's start date: wait for settings so each range is fetched once, but not
  // past a first failure or an offline pause (then the range simply isn't clipped).
  const ready = !settings.isPending || settings.failureCount > 0 || settings.fetchStatus === 'paused'
  const { from, to } = rangeDates(range, date, settings.data?.profile.start_date ?? null)
  const days = useApiQuery(endpoints.day.range, { query: { from, to } }, { enabled: ready, placeholderData: keepPreviousData })
  const trend = useApiQuery(endpoints.body.trend, { query: { from, to } }, { enabled: ready, placeholderData: keepPreviousData })
  const fasts = useApiQuery(endpoints.fasting.list, { query: { from } }, { enabled: ready, placeholderData: keepPreviousData })
  const sessions = useApiQuery(endpoints.training.listSessions, { query: { from, to } }, { enabled: ready, placeholderData: keepPreviousData })
  return { from, to, settings, days, trend, fasts, sessions }
}
