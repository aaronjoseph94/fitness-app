// Owns: the reads behind Today for one local date — the day (GET /api/day/:date: also the pinned note and the active
// plan's forecast), the last eight weeks of trend for the hero (with the milestones), settings (start and goal
// weight), this week's view (GET /api/week-plans/view: the active plan and the days so far), the week plans still
// proposed from this week on (GET /api/week-plans?status=proposed), when the next Evolt scan is due (GET
// /api/scans/schedule), today's readiness (from the day's sleep, GET /api/days for the steps window and GET
// /api/sessions for the last session, in the Train tab's windows so the two share their cache), and pending logs
// (saving or queued) folded into the day. The pinned note shows from this device's memory (./note-memory) until the
// day answers.
import { endpoints } from '@fitness/shared/api'
import type { LocalDate } from '@fitness/shared/schemas'
import { useEffect, useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { recentSessionsInput, stepsWindowInput } from '../../train/queries'
import { useProposedWeekPlans, useWeekPlan } from '../../week'
import { heroTrendInput, SETTINGS_STALE_MS } from '../queries'
import { rememberedNote, rememberNote } from './note-memory'
import { usePendingToday } from './pending'
import { readinessToday } from './readiness'

export function useTodayData(date: LocalDate) {
  const day = useApiQuery(endpoints.day.get, { params: { date } })
  const trend = useApiQuery(endpoints.body.trend, heroTrendInput(date))
  const settings = useApiQuery(endpoints.settings.get, {}, { staleTime: SETTINGS_STALE_MS })
  // The week view: its active plan (today's session, the plan's name) and the week's days (what was done).
  const week = useWeekPlan(date)
  // Plans waiting for Review → Accept, this week's or later.
  const proposed = useProposedWeekPlans(date)
  const pending = usePendingToday(date)
  const scanSchedule = useApiQuery(endpoints.scans.schedule, {})
  const steps = useApiQuery(endpoints.day.range, stepsWindowInput(date))
  const sessions = useApiQuery(endpoints.training.listSessions, recentSessionsInput(date))
  // Only once all three answer: a score from part of its inputs would change under the reader.
  const readiness = useMemo(
    () =>
      day.data && steps.data && sessions.data
        ? readinessToday({
            date,
            sleep: day.data.sleep,
            days: steps.data,
            sessionDates: sessions.data.map((s) => s.date),
          })
        : null,
    [day.data, steps.data, sessions.data, date],
  )
  // The pinned note paints in its place from this device's memory until the day answers (no shift when it arrives).
  const [remembered] = useState(() => rememberedNote())
  const dayNote = day.data?.note
  useEffect(() => {
    if (dayNote !== undefined) rememberNote(dayNote)
  }, [dayNote])
  const note = dayNote !== undefined ? dayNote : remembered
  return {
    day,
    trend,
    settings,
    week,
    weekPlan: week.data?.active ?? null,
    proposed,
    note,
    pending,
    scanDue: scanSchedule.data?.due ?? null,
    readiness,
  }
}
