// Owns: the reads behind the Train tab for today — the day view (planned session, training flag, today's session,
// last night's sleep), four weeks of sessions (recent list, days since the last one), the 15 days of steps readiness
// needs, the templates — plus today's readiness and the session in progress on this phone, if any.
import { endpoints } from '@fitness/shared/api'
import type { Readiness, SleepLog } from '@fitness/shared/schemas'
import { useMemo } from 'react'
import { useApiQuery } from '../../../api'
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

export function useTrainData(date: string) {
  const day = useApiQuery(endpoints.day.get, { params: { date } })
  const sessions = useApiQuery(endpoints.training.listSessions, recentSessionsInput(date))
  const days = useApiQuery(endpoints.day.range, stepsWindowInput(date))
  const templates = useTemplates()
  const copies = useLoggerStore((s) => s.sessions)

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

  return {
    day,
    sessions,
    templates,
    active,
    activeCounts: active ? setCounts(active) : null,
    unsynced,
    readiness,
  }
}
