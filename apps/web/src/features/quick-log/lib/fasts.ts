// Owns: what each fast is right now — active, planned, completed, partial or missed — from GET /api/fasts, today's
// fast state (GET /api/day/:date) and starts / ends / plans not yet synced, so the sheet and the Log tab agree.
import { endpoints } from '@fitness/shared/api'
import type { Fast } from '@fitness/shared/schemas'
import { useEffect, useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { dateOf, todayLocal } from './dates'
import { useDay, useLogSettings } from './reads'
import { usePendingLogs } from './writes'

export type FastStatusView = 'active' | 'planned' | 'completed' | 'partial' | 'missed'

export interface FastView {
  id: string
  startedAt: string
  endedAt: string | null
  planned: boolean
  note: string | null
  status: FastStatusView
  /** Real duration so far (active) or in total (ended), hours. */
  hours: number | null
  /** A start, end or plan for it is still waiting to sync. */
  pending: boolean
}

/** A planned fast past its start, not ended, counts as running this long (it may have started automatically). */
const AUTO_START_WINDOW_H = 48
/** An ended fast within this share of the planned length counts as completed. */
const COMPLETE_SHARE = 0.95
const HOUR_MS = 3_600_000

/** The current time, re-read every `everyMs` (fast timers). */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}

export interface FastsResult {
  /** Fasts overlapping the range, newest first. */
  fasts: FastView[]
  active: FastView | null
  /** Planned fasts that have not started, soonest first. */
  upcoming: FastView[]
  isLoading: boolean
  error: unknown
  refetch: () => void
}

export function useFasts(range: { from: string; to: string }, now = Date.now()): FastsResult {
  const { fastHours } = useLogSettings()
  const list = useApiQuery(endpoints.fasting.list, { query: range })
  const today = useDay(todayLocal(now))
  const starts = usePendingLogs(endpoints.fasting.start)
  const ends = usePendingLogs(endpoints.fasting.end)
  const plans = usePendingLogs(endpoints.fasting.plan)

  return useMemo(() => {
    const byId = new Map<string, Fast & { pending?: boolean }>()
    for (const f of list.data ?? []) byId.set(f.id, f)
    const todayFast = today.data?.fast.fast
    if (todayFast && !byId.has(todayFast.id)) byId.set(todayFast.id, todayFast)
    const stamp = (at: string) => ({ created_at: at, updated_at: at })
    for (const p of plans) {
      if (byId.has(p.body.id)) continue
      byId.set(p.body.id, { id: p.body.id, started_at: p.body.started_at, ended_at: null, planned: true, note: p.body.note ?? null, pending: true, ...stamp(p.at) })
    }
    for (const p of starts) {
      const existing = byId.get(p.body.id)
      byId.set(p.body.id, {
        ...(existing ?? { id: p.body.id, planned: false, note: p.body.note ?? null, ended_at: null, ...stamp(p.at) }),
        started_at: p.body.started_at ?? p.at,
        pending: true,
      })
    }
    for (const p of ends) {
      const id = p.path.split('/')[3]
      const existing = id ? byId.get(id) : undefined
      if (existing) byId.set(existing.id, { ...existing, ended_at: p.body.ended_at ?? p.at, pending: true })
    }
    const activeId = today.data?.fast.state === 'active' ? today.data.fast.fast?.id : undefined
    // The server knows a planned fast that has not started yet even when its start time has passed.
    const scheduledId = today.data?.fast.state === 'scheduled' ? today.data.fast.fast?.id : undefined
    const pendingStarted = new Set(starts.map((p) => p.body.id))

    const fasts = [...byId.values()].map((f): FastView => {
      const start = Date.parse(f.started_at)
      const view = { id: f.id, startedAt: f.started_at, endedAt: f.ended_at, planned: f.planned, note: f.note, pending: f.pending === true }
      if (f.ended_at) {
        const hours = (Date.parse(f.ended_at) - start) / HOUR_MS
        return { ...view, hours, status: hours >= fastHours * COMPLETE_SHARE ? 'completed' : 'partial' }
      }
      if (start > now || (f.id === scheduledId && !pendingStarted.has(f.id))) return { ...view, hours: null, status: 'planned' }
      const hours = (now - start) / HOUR_MS
      const running = f.id === activeId || pendingStarted.has(f.id) || !f.planned || hours < AUTO_START_WINDOW_H
      return { ...view, hours: running ? hours : null, status: running ? 'active' : 'missed' }
    })
    fasts.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const active = fasts.find((f) => f.status === 'active') ?? null
    const upcoming = fasts.filter((f) => f.status === 'planned').reverse()
    return {
      fasts,
      active,
      upcoming,
      isLoading: list.isLoading,
      error: list.error,
      refetch: () => void list.refetch(),
    }
  }, [list.data, list.isLoading, list.error, list.refetch, today.data, starts, ends, plans, fastHours, now])
}

/** Planned fasts starting in the month of `date` ("2026-10"), for the "1 of 2 planned" line. */
export function plannedInMonth(fasts: readonly FastView[], date: string): number {
  const month = date.slice(0, 7)
  return fasts.filter((f) => f.planned && dateOf(f.startedAt).slice(0, 7) === month).length
}
