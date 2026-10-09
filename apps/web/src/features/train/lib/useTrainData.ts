// Owns: the reads behind the Train tab for today — the day view (planned session, training flag, today's session,
// last night's sleep), four weeks of sessions (recent list, days since the last one), the 15 days of steps readiness
// needs, the templates, the training days (settings) and the pending AI workout drafts — plus today's readiness, the
// session in progress on this phone, today's split template (the template named for today's day of the split, when
// the week plan leaves a training day open) and the split's AI drafts still waiting for Keep.
import { endpoints } from '@fitness/shared/api'
import { splitSlot, splitSlots, weekdayOf } from '@fitness/shared/engine'
import type { Readiness, SleepLog, Template } from '@fitness/shared/schemas'
import { useMemo } from 'react'
import { useApiQuery } from '../../../api'
import { usePendingWorkouts, type PendingWorkout } from '../../builder'
import { setCounts, type LoggerSession } from './logger-model'
import { useLoggerStore } from './logger-store'
import { recentSessionsInput, stepsWindowInput } from '../queries'
import { readinessToday } from './readiness'
import { useTemplates } from './session'

/** Last night's minutes asleep: the logged value, else woke − in bed. */
function sleepMinutes(sleep: Pick<SleepLog, 'asleep_min' | 'in_bed_at' | 'woke_at'> | null): number | null {
  if (!sleep) return null
  if (sleep.asleep_min !== null && sleep.asleep_min !== undefined) return sleep.asleep_min
  return sleep.in_bed_at && sleep.woke_at
    ? Math.max(0, (Date.parse(sleep.woke_at) - Date.parse(sleep.in_bed_at)) / 60_000)
    : null
}

/** A template's or draft's name as the split matches it ("Upper A"): trimmed, case-insensitive. */
const nameKey = (name: string) => name.trim().toLowerCase()

export function useTrainData(date: string) {
  const day = useApiQuery(endpoints.day.get, { params: { date } })
  const sessions = useApiQuery(endpoints.training.listSessions, recentSessionsInput(date))
  const days = useApiQuery(endpoints.day.range, stepsWindowInput(date))
  const templates = useTemplates()
  const settings = useApiQuery(endpoints.settings.get, {})
  const pending = usePendingWorkouts()
  const copies = useLoggerStore((s) => s.sessions)
  const trainingDays = settings.data?.settings.training_days

  /** The newest unfinished working copy of today (started here, maybe still queued). */
  const active: LoggerSession | null = useMemo(
    () =>
      Object.values(copies)
        .filter((s) => !s.finished && s.date === date)
        .sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null,
    [copies, date],
  )

  /** Finished here but not in the Worker's list yet (finish queued offline). */
  const unsynced = useMemo(
    () =>
      Object.values(copies).filter(
        (s) => s.finished?.queued && !(sessions.data ?? []).some((x) => x.id === s.id),
      ),
    [copies, sessions.data],
  )

  const readiness: Readiness | null = useMemo(() => {
    if (active?.readiness) return active.readiness
    if (!day.data && !days.data) return null
    return readinessToday({
      date,
      sleep_min: sleepMinutes(day.data?.sleep ?? null),
      days: days.data ?? [],
      session_dates: (sessions.data ?? []).map((s) => s.date),
    })
  }, [active, day.data, days.data, sessions.data, date])

  /**
   * Today's split template: today's slot = splitSlot(weekday, training_days), and the template named like it. None
   * when today isn't one of the training days, the day's training flag says rest, or a week-plan session covers today.
   */
  const splitTemplate: Template | null = useMemo(() => {
    const view = day.data
    if (!view || !trainingDays || view.planned_session || view.targets?.training_planned === false) return null
    const slot = splitSlot(weekdayOf(date), trainingDays)
    return slot ? (templates.data?.find((t) => nameKey(t.name) === nameKey(slot.name)) ?? null) : null
  }, [day.data, trainingDays, templates.data, date])

  /**
   * The split's AI drafts waiting for Keep: pending workout proposals with a name, the newest per name, none for a name
   * a template already has; in split order (Upper A, Lower A, …), any other name after them.
   */
  const drafts: PendingWorkout[] = useMemo(() => {
    if (!templates.data) return []
    const taken = new Set(templates.data.map((t) => nameKey(t.name)))
    const newest = pending.filter((w) => {
      const key = w.draft.name ? nameKey(w.draft.name) : ''
      if (!key || taken.has(key)) return false
      taken.add(key)
      return true
    })
    const order = splitSlots(trainingDays ?? []).map((s) => nameKey(s.name))
    const rank = (w: PendingWorkout) => {
      const i = order.indexOf(nameKey(w.draft.name ?? ''))
      return i < 0 ? order.length : i
    }
    return newest.sort((a, b) => rank(a) - rank(b))
  }, [pending, templates.data, trainingDays])

  return {
    day,
    sessions,
    templates,
    active,
    activeCounts: active ? setCounts(active) : null,
    unsynced,
    readiness,
    splitTemplate,
    drafts,
  }
}
