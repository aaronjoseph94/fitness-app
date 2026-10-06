// Owns: the reads behind the Dashboard — one window of history (default 90 days, from `?window=`), plus the settings
// the tiles and charts need. Everything a section receives is already resolved: `data` is non-null as soon as the two
// essentials (the day rows and the trend) have arrived, and the optional reads fall back to empty lists.
import { endpoints } from '@fitness/shared/api'
import { addDays, daysBetween } from '@fitness/shared/engine'
import type { DaySummary, Fast, LocalDate, Profile, Scan, Settings, TrendSeries, WorkoutSession } from '@fitness/shared/schemas'
import { keepPreviousData } from '@tanstack/react-query'
import { useApiQuery, type ApiError } from '../../../api'

/** Windows the dashboard offers, in days. */
export const WINDOWS = [
  { key: '30', label: '30 d', days: 30 },
  { key: '90', label: '90 d', days: 90 },
  { key: '180', label: '180 d', days: 180 },
] as const

export type WindowKey = (typeof WINDOWS)[number]['key']
export const DEFAULT_WINDOW: WindowKey = '90'

export function windowDays(key: WindowKey): number {
  return WINDOWS.find((w) => w.key === key)?.days ?? 90
}

/** Everything the Dashboard sections draw. All lists are oldest-first. */
export interface DashboardData {
  /** First day of the window (inclusive). */
  from: LocalDate
  /** Last day of the window (inclusive) — today in Edmonton. */
  to: LocalDate
  /** Inclusive length of the window in days. */
  windowDays: number
  profile: Profile | null
  settings: Settings | null
  /** One v_day row per date in the window (GET /api/days). */
  days: DaySummary[]
  /** Trend, forecast, measurements and milestones (GET /api/trend). */
  trend: TrendSeries | null
  fasts: Fast[]
  sessions: WorkoutSession[]
  scans: Scan[]
}

export interface DashboardReads {
  data: DashboardData | null
  /** True before the first window has arrived (a range switch keeps the old one on screen). */
  loading: boolean
  refreshing: boolean
  error: ApiError | null
}

export function useDashboardData(window: WindowKey, date: LocalDate): DashboardReads {
  const length = windowDays(window)
  const from = addDays(date, -(length - 1))
  const range = { from, to: date }
  const keep = { placeholderData: keepPreviousData }

  const settings = useApiQuery(endpoints.settings.get, {})
  const days = useApiQuery(endpoints.day.range, { query: range }, keep)
  const trend = useApiQuery(endpoints.body.trend, { query: range }, keep)
  const fasts = useApiQuery(endpoints.fasting.list, { query: { from } }, keep)
  const sessions = useApiQuery(endpoints.training.listSessions, { query: range }, keep)
  const scans = useApiQuery(endpoints.scans.list, {}, { staleTime: 5 * 60_000 })

  // The essentials: without these there is no dashboard, only a loading or error state.
  if (!days.data || !trend.data)
    return { data: null, loading: true, refreshing: false, error: (days.error ?? trend.error) as ApiError | null }

  return {
    data: {
      from,
      to: date,
      windowDays: daysBetween(from, date) + 1,
      profile: settings.data?.profile ?? null,
      settings: settings.data?.settings ?? null,
      days: days.data,
      trend: trend.data,
      fasts: fasts.data ?? [],
      sessions: sessions.data ?? [],
      scans: scans.data ?? [],
    },
    loading: false,
    refreshing: Boolean(days.isPlaceholderData || trend.isPlaceholderData),
    error: null,
  }
}
