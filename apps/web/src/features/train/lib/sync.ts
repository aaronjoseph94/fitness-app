// Owns: mirroring the logger's working copy to the Worker — one serial write chain for every training write (so a
// set never overtakes the session it belongs to), per-set reconcile (create when ticked or noted, patch only what
// changed, delete removed ones), debounced typing, the session start, and finish. Every write goes through the
// offline-aware mutations, so a write made offline is queued with its client id and replays in order.
import { endpoints } from '@fitness/shared/api'
import type { SessionCreate, SetCreate, SetPatch } from '@fitness/shared/schemas'
import { useEffect, useMemo } from 'react'
import { useApiMutation, type WriteOutcome } from '../../../api'
import { problemText } from '../../quick-log'
import { findSet, mergeServer, noteFor, payloadKey, shouldExist, type LoggerSession } from './logger-model'
import { loggerState } from './logger-store'

const t = endpoints.training

/** The writes the chain makes: the offline-aware mutations (saved, or queued on this phone). */
export interface TrainingWriters {
  start: (body: SessionCreate) => Promise<WriteOutcome<typeof t.startSession>>
  logSet: (sessionId: string, body: SetCreate) => Promise<unknown>
  updateSet: (setId: string, body: SetPatch) => Promise<unknown>
  deleteSet: (setId: string) => Promise<unknown>
  finish: (sessionId: string, ended_at: string) => Promise<WriteOutcome<typeof t.finishSession>>
}

/** What a session finish invalidates: the lists and days that show sessions. */
const FINISH_REFRESHES = [
  t.listSessions,
  t.getSession,
  endpoints.day.get,
  endpoints.day.range,
  endpoints.day.events,
]

/** Bind the training mutations. Mount wherever the logger writes (Train tab, session page). */
export function useTrainingWriters(): TrainingWriters {
  const start = useApiMutation(t.startSession, { invalidates: [t.listSessions, endpoints.day.get] })
  const logSet = useApiMutation(t.logSet)
  const updateSet = useApiMutation(t.updateSet)
  const deleteSet = useApiMutation(t.deleteSet)
  const finish = useApiMutation(t.finishSession, { invalidates: FINISH_REFRESHES })
  const writers = useMemo<TrainingWriters>(
    () => ({
      start: (body) => start.mutateAsync({ body }),
      logSet: (id, body) => logSet.mutateAsync({ params: { id }, body }),
      updateSet: (id, body) => updateSet.mutateAsync({ params: { id }, body }),
      deleteSet: (id) => deleteSet.mutateAsync({ params: { id } }),
      finish: (id, ended_at) => finish.mutateAsync({ params: { id }, body: { ended_at } }),
    }),
    [start.mutateAsync, logSet.mutateAsync, updateSet.mutateAsync, deleteSet.mutateAsync, finish.mutateAsync],
  )
  // The chain outlives a page; it always writes through the most recently mounted writers.
  useEffect(() => {
    latest = writers
  }, [writers])
  latest ??= writers
  return writers
}

let latest: TrainingWriters | null = null
let tail: Promise<void> = Promise.resolve()

/** Run `op` after every earlier training write; a failure is reported, never blocks the chain. */
function enqueue(op: (w: TrainingWriters) => Promise<void>): Promise<void> {
  const run = tail.then(async () => {
    if (!latest) return
    try {
      await op(latest)
    } catch (error) {
      loggerState().setProblem(problemText(error))
    }
  })
  tail = run
  return run
}

const session = (id: string): LoggerSession | undefined => loggerState().sessions[id]

const orUndefined = <T>(v: T | null): T | undefined => (v === null ? undefined : v)

/** POST /api/sessions once for a copy seeded here; a saved answer is folded in (last sets, suggestions, readiness). */
async function sendStart(w: TrainingWriters, id: string): Promise<void> {
  const s = session(id)
  if (!s || s.start === 'sent') return
  const exercises = s.exercises.slice(0, 20).map((e) => ({
    exercise_id: e.exercise_id,
    sets: Math.min(10, Math.max(1, e.sets.length)),
    rep_min: e.rep_min,
    rep_max: e.rep_max,
    target_load_kg: e.default_load_kg,
    rest_sec: e.rest_sec,
    note: null,
  }))
  const outcome = await w.start({
    id,
    template_id: s.template_id,
    origin: s.origin,
    started_at: s.started_at,
    // A template session's plan is the template; anything else (week plan, AI, blank) sends its own plan.
    ...(s.origin !== 'template' && exercises.length ? { exercises } : {}),
  })
  loggerState().update(id, (current) =>
    outcome.status === 'saved'
      ? mergeServer(current, outcome.data, current.name)
      : { ...current, start: 'sent' },
  )
}

/** Bring one set on the Worker in line with the working copy (create, patch, delete or nothing). */
async function reconcileSet(w: TrainingWriters, sessionId: string, setId: string): Promise<void> {
  await sendStart(w, sessionId)
  const s = session(sessionId)
  if (!s) return
  const state = loggerState()
  if (s.to_delete.includes(setId)) {
    await w.deleteSet(setId)
    state.update(sessionId, (c) => ({ ...c, to_delete: c.to_delete.filter((x) => x !== setId) }))
    return
  }
  const found = findSet(s, setId)
  if (!found) return
  const { exercise, set } = found
  const note = noteFor(exercise, set)
  const key = payloadKey(set, note)
  if (!set.created) {
    if (!shouldExist(exercise, set)) return
    await w.logSet(sessionId, {
      id: set.id,
      exercise_id: exercise.exercise_id,
      set_index: set.set_index,
      reps: orUndefined(set.reps),
      load_kg: orUndefined(set.load_kg),
      rpe: orUndefined(set.rpe),
      completed: set.done,
      note: orUndefined(note),
    })
  } else {
    if (set.sent === key) return
    const first = exercise.sets[0]?.id === set.id
    await w.updateSet(set.id, {
      reps: set.reps,
      load_kg: set.load_kg,
      rpe: set.rpe,
      completed: set.done,
      ...(first ? { note } : {}),
    })
  }
  state.update(sessionId, (c) => ({
    ...c,
    exercises: c.exercises.map((e) =>
      e.exercise_id !== exercise.exercise_id
        ? e
        : { ...e, sets: e.sets.map((x) => (x.id === set.id ? { ...x, created: true, sent: key } : x)) },
    ),
  }))
}

const timers = new Map<string, { timer: ReturnType<typeof setTimeout>; sessionId: string }>()

/**
 * Mirror one set (or a removed set's id) to the Worker after `delayMs` (typing settles first; a tick goes at once).
 * Repeated calls for the same set collapse into one write that sends the latest values.
 */
export function syncSet(sessionId: string, setId: string, delayMs = 0): void {
  const pending = timers.get(setId)
  if (pending) clearTimeout(pending.timer)
  const run = () => {
    timers.delete(setId)
    void enqueue((w) => reconcileSet(w, sessionId, setId))
  }
  if (delayMs <= 0) run()
  else timers.set(setId, { timer: setTimeout(run, delayMs), sessionId })
}

/** Send every debounced write of a session now (leaving the page, finishing). */
export function flushSession(sessionId: string): void {
  for (const [setId, p] of [...timers]) {
    if (p.sessionId !== sessionId) continue
    clearTimeout(p.timer)
    timers.delete(setId)
    void enqueue((w) => reconcileSet(w, sessionId, setId))
  }
}

/** Issue POST /api/sessions for a copy seeded here (no-op once sent). */
export function syncStart(sessionId: string): Promise<void> {
  return enqueue((w) => sendStart(w, sessionId))
}

/**
 * Finish: flush every set (and removal), then POST /api/sessions/:id/finish. A saved finish stores the Worker's
 * summary and PRs; a queued one marks the copy finished with the summary still to come.
 */
export async function finishSession(sessionId: string, ended_at: string): Promise<void> {
  flushSession(sessionId)
  const s = session(sessionId)
  if (!s) return
  for (const id of [...s.to_delete, ...s.exercises.flatMap((e) => e.sets.map((x) => x.id))])
    void enqueue((w) => reconcileSet(w, sessionId, id))
  await enqueue(async (w) => {
    await sendStart(w, sessionId)
    const outcome = await w.finish(sessionId, ended_at)
    loggerState().update(sessionId, (c) =>
      outcome.status === 'saved'
        ? {
            ...c,
            prs: outcome.data.summary.prs,
            finished: { ended_at, summary: outcome.data.summary, queued: false },
          }
        : { ...c, finished: { ended_at, summary: null, queued: true } },
    )
  })
}
