// Owns: the reads behind Today for one local date — the day (GET /api/day/:date), the last eight weeks of trend for the
// hero chart, the active plan (its forecast), settings (start and goal weight), the pinned note (GET /api/notes), this
// week's active week plan (GET /api/week-plans/view), and pending logs (saving or queued) folded into the day.
import { endpoints } from '@fitness/shared/api'
import { addDays } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { useApiQuery } from '../../../api'
import { useWeekPlan } from '../../week'
import { usePendingToday } from './pending'

/** The hero chart's history: about eight weeks. */
const HERO_DAYS = 56

export function useTodayData(date: LocalDate) {
  const day = useApiQuery(endpoints.day.get, { params: { date } })
  const trend = useApiQuery(endpoints.body.trend, { query: { from: addDays(date, -(HERO_DAYS - 1)), to: date } })
  const plan = useApiQuery(endpoints.plan.get, {})
  const settings = useApiQuery(endpoints.settings.get, {}, { staleTime: 5 * 60_000 })
  // The week view (shared with the This week card, same query): its active plan.
  const week = useWeekPlan(date)
  // The pinned note has its own read (GET /api/notes); the day's copy covers the moment before it answers.
  const notes = useApiQuery(endpoints.day.note, {})
  const note = notes.isSuccess ? notes.data.note : (day.data?.note ?? null)
  const pending = usePendingToday(date)
  return { day, trend, plan, settings, weekPlan: week.data?.active ?? null, note, pending }
}
