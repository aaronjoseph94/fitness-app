// Owns: the reads behind the Train tab for today — the day view (planned session, training flag, today's session,
// last night's sleep), four weeks of sessions (recent list, days since the last one), the 15 days of steps readiness
// needs, the templates, the training days (settings), the training week (GET /api/ai/week: polled while a day is
// drafting, and the feed re-read when a draft lands) and the pending AI workout drafts — plus today's readiness, the
// session in progress on this phone, today's split template (the template named for today's day of the split, when
// the week plan leaves a training day open) and the split's AI drafts: those waiting for Keep (with the template each
// would replace) and those kept from this page (by their card or Keep all), which stay on screen with their outcome so
// a replacing Keep can be undone, until the next Generate. A split day's template is the engine's splitTemplateFor
// (the oldest one named like it), the Worker's rule too.
import { endpoints } from '@fitness/shared/api'
import { splitNameKey, splitSlot, splitSlots, splitTemplateFor, weekdayOf } from '@fitness/shared/engine'
import type { ProposalDecision, Readiness, SleepLog, Template } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiQueryKey, useApiQuery } from '../../../api'
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

/** How often the week is re-read while a day is drafting (a workout_template job takes 10–30 s). */
const DRAFTING_POLL_MS = 4_000

/** A split draft kept from this page: the template it made or replaced, and the name of the one it replaced (Undo). */
export interface KeptDraft {
  template_id: string | null
  /** The replaced template's name, from the accepted proposal's snapshot; null = Keep made a new template. */
  replaced: string | null
}

/** One split draft card on the Train tab. */
export interface SplitDraft {
  workout: PendingWorkout
  /** The template Keep would replace in place ("Replaces your Upper A"); null = Keep makes a new one. */
  replaces: string | null
  /** Set once kept from this page; the card then shows the outcome (and Undo when it replaced a template). */
  kept: KeptDraft | null
}

/** What accepting a split draft did, from the Worker's answer. */
function keptOutcome(decision: ProposalDecision): KeptDraft {
  const body = decision.proposal.body
  return {
    template_id: decision.applied?.entity === 'template' ? decision.applied.id : null,
    replaced: body.kind === 'workout' && body.replaced ? body.replaced.name : null,
  }
}

export function useTrainData(date: string) {
  const day = useApiQuery(endpoints.day.get, { params: { date } })
  const sessions = useApiQuery(endpoints.training.listSessions, recentSessionsInput(date))
  const days = useApiQuery(endpoints.day.range, stepsWindowInput(date))
  const templates = useTemplates()
  const settings = useApiQuery(endpoints.settings.get, {})
  const week = useApiQuery(endpoints.ai.week, {}, {
    refetchInterval: (q) => (q.state.data?.slots.some((s) => s.drafting) ? DRAFTING_POLL_MS : false),
  })
  const pending = usePendingWorkouts()
  const copies = useLoggerStore((s) => s.sessions)
  const trainingDays = settings.data?.settings.training_days
  const queryClient = useQueryClient()

  // A day's draft landed (or went): the feed the draft cards read is re-read, so the card shows up with the week.
  const draftIds = week.data ? week.data.slots.map((s) => s.draft?.proposal_id ?? '-').join() : null
  const seenDraftIds = useRef<string | null>(null)
  useEffect(() => {
    if (draftIds === null) return
    if (seenDraftIds.current !== null && seenDraftIds.current !== draftIds)
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(endpoints.day.events) })
    seenDraftIds.current = draftIds
  }, [draftIds, queryClient])

  /**
   * Drafts kept from this page, by proposal id, with the draft as it was. The caller hands the draft over (the card's
   * own, or Keep all's from the Worker's answer), since it leaves the pending feed once kept and a lookup there could
   * miss it and lose the Undo.
   */
  const [kept, setKept] = useState<ReadonlyMap<string, { workout: PendingWorkout; outcome: KeptDraft }>>(() => new Map())
  const markKept = useCallback((workout: PendingWorkout, decision: ProposalDecision) => {
    setKept((m) => new Map(m).set(workout.id, { workout, outcome: keptOutcome(decision) }))
  }, [])
  /** A new Generate starts the drafts over: the kept cards go (the AI tab keeps their Undo for 7 days). */
  const clearKept = useCallback(() => setKept((m) => (m.size === 0 ? m : new Map())), [])

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
   * Today's split template: today's slot = splitSlot(weekday, training_days), and its template (splitTemplateFor).
   * None when today isn't one of the training days, the day's training flag says rest, or a week-plan session covers today.
   */
  const splitTemplate: Template | null = useMemo(() => {
    const view = day.data
    if (!view || !trainingDays || view.planned_session || view.targets?.training_planned === false) return null
    const slot = splitSlot(weekdayOf(date), trainingDays)
    return slot ? splitTemplateFor(templates.data ?? [], slot.name) : null
  }, [day.data, trainingDays, templates.data, date])

  /**
   * The split's AI drafts: pending workout proposals with a name, the newest per name, each with the template Keep
   * would replace (the week's `replaces_template_id`, else splitTemplateFor its name), plus the drafts kept from
   * this page; in split order (Upper A, Lower A, …), any other name after them.
   */
  const drafts: SplitDraft[] = useMemo(() => {
    if (!templates.data) return []
    const list = templates.data
    const replacing = new Map(
      (week.data?.slots ?? []).flatMap((s): [string, string | null][] =>
        s.draft ? [[s.draft.proposal_id, s.draft.replaces_template_id]] : [],
      ),
    )
    const names = new Set<string>()
    const waiting = pending.filter((w) => {
      const key = w.draft.name ? splitNameKey(w.draft.name) : ''
      if (!key || names.has(key) || kept.has(w.id)) return false
      names.add(key)
      return true
    })
    const replaces = (w: PendingWorkout): string | null => {
      const id = replacing.get(w.id)
      const byId = id ? list.find((t) => t.id === id) : undefined
      return (byId ?? splitTemplateFor(list, w.draft.name ?? ''))?.name ?? null
    }
    const all: SplitDraft[] = [
      ...waiting.map((workout) => ({ workout, replaces: replaces(workout), kept: null })),
      ...[...kept.values()].map(({ workout, outcome }) => ({ workout, replaces: outcome.replaced, kept: outcome })),
    ]
    const order = splitSlots(trainingDays ?? []).map((s) => splitNameKey(s.name))
    const rank = (d: SplitDraft) => {
      const i = order.indexOf(splitNameKey(d.workout.draft.name ?? ''))
      return i < 0 ? order.length : i
    }
    return all.sort((a, b) => rank(a) - rank(b))
  }, [pending, kept, templates.data, week.data, trainingDays])

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
    week,
    markKept,
    clearKept,
  }
}
