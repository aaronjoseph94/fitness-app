// Owns: the reads behind Today for one local date — the day (GET /api/day/:date), the last eight weeks of trend for the
// hero chart, the active plan (its forecast), settings (start and goal weight), the pinned note (GET /api/notes), this
// week's active week plan (GET /api/week-plans/view), and the offline queue folded into the day — plus the local date.
import { endpoints } from '@fitness/shared/api'
import { addDays, today } from '@fitness/shared/engine'
import type { LocalDate } from '@fitness/shared/schemas'
import { useEffect, useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { usePendingWrites } from '../../../offline'
import { useWeekPlan } from '../../week'
import { pendingFor } from './pending'

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
  const writes = usePendingWrites()
  const pending = useMemo(() => pendingFor(writes, date), [writes, date])
  return { day, trend, plan, settings, weekPlan: week.data?.active ?? null, note, pending }
}

/** Today in America/Edmonton, re-read every minute and whenever the app comes back into view (it may be a new day). */
export function useLocalDate(): LocalDate {
  const [date, setDate] = useState(() => today(Date.now()))
  useEffect(() => {
    const check = () => setDate(today(Date.now()))
    const timer = window.setInterval(check, 60_000)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])
  return date
}
