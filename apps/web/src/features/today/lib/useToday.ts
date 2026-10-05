// Owns: the reads behind Today for one local date — the day (GET /api/day/:date: also the pinned note and the active
// plan's forecast), the last eight weeks of trend for the hero chart, settings (start and goal weight), this week's
// active week plan (GET /api/week-plans/view), and pending logs (saving or queued) folded into the day. The pinned note
// shows from this phone's memory (./note-memory) until the day answers.
import { endpoints } from '@fitness/shared/api'
import type { LocalDate } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { useApiQuery } from '../../../api'
import { useWeekPlan } from '../../week'
import { heroTrendInput, SETTINGS_STALE_MS } from '../queries'
import { rememberedNote, rememberNote } from './note-memory'
import { usePendingToday } from './pending'

export function useTodayData(date: LocalDate) {
  const day = useApiQuery(endpoints.day.get, { params: { date } })
  const trend = useApiQuery(endpoints.body.trend, heroTrendInput(date))
  const settings = useApiQuery(endpoints.settings.get, {}, { staleTime: SETTINGS_STALE_MS })
  // The week view (shared with the This week card, same query): its active plan.
  const week = useWeekPlan(date)
  const pending = usePendingToday(date)
  // The pinned note paints in its place from this phone's memory until the day answers (no shift when it arrives).
  const [remembered] = useState(() => rememberedNote())
  const dayNote = day.data?.note
  useEffect(() => {
    if (dayNote !== undefined) rememberNote(dayNote)
  }, [dayNote])
  const note = dayNote !== undefined ? dayNote : remembered
  return { day, trend, settings, weekPlan: week.data?.active ?? null, note, pending }
}
