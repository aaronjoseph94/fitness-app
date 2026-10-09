// Owns: the session logger's working copy (SPEC §7 session logging) as plain data and the pure functions over it —
// seed from a plan (template, week plan, blank), build from or merge in the Worker's session, swap an exercise
// mid-session for another, the greyed hints per set (last session, progression default), what a set sends to the
// Worker, and the progression hint text.
// The working copy is the logger's source of truth while a session runs: every tap lands here first and is mirrored to
// the Worker set by set (see sync.ts), so the logger works offline and survives a reload mid-session.
import type {
  DeloadStatus,
  PersonalRecord,
  ProgressionSuggestion,
  Readiness,
  SessionOrigin,
  SessionPlanExercise,
  SessionRecovery,
  SessionSummary,
  TemplateExerciseInput,
  WorkoutSession,
} from '@fitness/shared/schemas'

/** Rep range, sets and rest for an exercise added mid-session (the Worker's default for one too). */
export const ADDED_EXERCISE = { sets: 3, rep_min: 8, rep_max: 12, rest_sec: 90 } as const

/** One set: a planned placeholder until it is ticked done (or carries the exercise note), then a stored set. */
export interface LoggerSet {
  /** Client UUID, the Worker's id once created. */
  id: string
  /** Set number within the exercise as stored (never reused while the set exists; display order is array order). */
  set_index: number
  reps: number | null
  load_kg: number | null
  rpe: number | null
  done: boolean
  /** A create write was issued (saved, or queued on this phone). */
  created: boolean
  /** The fields last sent, so an unchanged set is not patched again. */
  sent: string | null
}

export interface LastSet {
  set_index: number
  reps: number | null
  load_kg: number | null
}

export interface LoggerExercise {
  exercise_id: string
  rep_min: number
  rep_max: number
  rest_sec: number
  /** The greyed default load: the progression suggestion, else the target load, else last session's top load. */
  default_load_kg: number | null
  last: { date: string; sets: LastSet[] } | null
  suggestion: ProgressionSuggestion | null
  /** Notes per exercise; stored on the exercise's first set. */
  note: string
  sets: LoggerSet[]
}

export interface LoggerFinish {
  ended_at: string
  /** The Worker's summary when finish was saved; null when it is queued (or read back from history). */
  summary: SessionSummary | null
  queued: boolean
}

export interface LoggerSession {
  id: string
  /** Local date of the start. */
  date: string
  started_at: string
  origin: SessionOrigin
  template_id: string | null
  /** Template or week-plan name for the header. */
  name: string | null
  exercises: LoggerExercise[]
  readiness: Readiness | null
  recovery: SessionRecovery | null
  deload: DeloadStatus | null
  prs: PersonalRecord[] | null
  /** Ids of sets removed here: never re-added from the Worker. */
  removed: string[]
  /** Removed sets that were created and still need a DELETE. */
  to_delete: string[]
  /** 'pending' until POST /api/sessions was issued (saved or queued). */
  start: 'pending' | 'sent'
  finished: LoggerFinish | null
  /** A finished session reopened in the logger to fix its sets; "Save changes" finishes it again with its ended_at. */
  editing?: boolean
  /**
   * Planned exercises left out when the session was started here, being outside the allowed set by then (equipment
   * status or an exclusion changed since the template or plan was made), as notes in the Worker's format (LEFT_OUT).
   */
  left_out?: string[]
  /** Last local change (ms), for pruning old copies. */
  touched: number
}

/** Start of a "left out" note: `Left out <name>: <reason>` (the Worker's session recovery notes use the same). */
export const LEFT_OUT = 'Left out '

const uuid = () => crypto.randomUUID()

function placeholders(count: number, from: number): LoggerSet[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => ({
    id: uuid(),
    set_index: from + i,
    reps: null,
    load_kg: null,
    rpe: null,
    done: false,
    created: false,
    sent: null,
  }))
}

/** Next free set_index in an exercise (1-based). */
export function nextSetIndex(exercise: LoggerExercise): number {
  return exercise.sets.reduce((max, s) => Math.max(max, s.set_index), 0) + 1
}

export function plannedExercise(
  e: Pick<
    TemplateExerciseInput,
    'exercise_id' | 'sets' | 'rep_min' | 'rep_max' | 'target_load_kg' | 'rest_sec'
  >,
): LoggerExercise {
  return {
    exercise_id: e.exercise_id,
    rep_min: e.rep_min,
    rep_max: e.rep_max,
    rest_sec: e.rest_sec,
    default_load_kg: e.target_load_kg,
    last: null,
    suggestion: null,
    note: '',
    sets: placeholders(e.sets, 1),
  }
}

export function addedExercise(exercise_id: string): LoggerExercise {
  return plannedExercise({ exercise_id, ...ADDED_EXERCISE, target_load_kg: null })
}

/** A fresh working copy for a session about to be started here (POST /api/sessions still to send). */
export function seedSession(input: {
  id: string
  date: string
  started_at: string
  origin: SessionOrigin
  template_id: string | null
  name: string | null
  exercises: readonly TemplateExerciseInput[]
  left_out?: string[]
}): LoggerSession {
  return {
    id: input.id,
    date: input.date,
    started_at: input.started_at,
    origin: input.origin,
    template_id: input.template_id,
    name: input.name,
    exercises: dedupe(input.exercises).map(plannedExercise),
    readiness: null,
    recovery: null,
    deload: null,
    prs: null,
    removed: [],
    to_delete: [],
    start: 'pending',
    finished: null,
    ...(input.left_out?.length ? { left_out: input.left_out } : {}),
    touched: Date.now(),
  }
}

function dedupe<T extends { exercise_id: string }>(list: readonly T[]): T[] {
  const seen = new Set<string>()
  return list.filter((e) => !seen.has(e.exercise_id) && !!seen.add(e.exercise_id))
}

type ServerSet = WorkoutSession['sets'][number]

function fromServerSet(s: ServerSet): LoggerSet {
  return {
    id: s.id,
    set_index: s.set_index,
    reps: s.reps,
    load_kg: s.load_kg,
    rpe: s.rpe,
    done: s.completed,
    created: true,
    sent: null,
  }
}

/** Stored sets were sent as they are: mark them so, so nothing is patched until it changes here. */
function markSent(exercise: LoggerExercise): LoggerExercise {
  return {
    ...exercise,
    sets: exercise.sets.map((s) =>
      s.created && s.sent === null ? { ...s, sent: payloadKey(s, noteFor(exercise, s)) } : s,
    ),
  }
}

function planFields(p: SessionPlanExercise): Pick<LoggerExercise, 'default_load_kg' | 'last' | 'suggestion'> {
  return {
    default_load_kg: p.default_load_kg,
    last: p.last
      ? {
          date: p.last.date,
          sets: p.last.sets.map((s) => ({ set_index: s.set_index, reps: s.reps, load_kg: s.load_kg })),
        }
      : null,
    suggestion: p.suggestion,
  }
}

/** How many sets to plan: the deload suggestion's count in a deload week, else the plan's. */
function plannedCount(p: SessionPlanExercise): number {
  return p.suggestion?.kind === 'deload' && p.suggestion.sets ? p.suggestion.sets : p.sets
}

/** The working copy for a session the Worker has (opened from history, another device, or a lost local copy). */
export function fromServer(session: WorkoutSession, name: string | null): LoggerSession {
  const finished = session.ended_at !== null
  const sets = [...session.sets].sort((a, b) => a.set_index - b.set_index)
  const plan = dedupe(session.plan ?? [])
  const exercises: LoggerExercise[] = plan.map((p) => {
    const stored = sets.filter((s) => s.exercise_id === p.exercise_id).map(fromServerSet)
    const missing = finished ? 0 : plannedCount(p) - stored.length
    const exercise: LoggerExercise = {
      exercise_id: p.exercise_id,
      rep_min: p.rep_min,
      rep_max: p.rep_max,
      rest_sec: p.rest_sec,
      ...planFields(p),
      note: sets.find((s) => s.exercise_id === p.exercise_id)?.note ?? '',
      sets: stored,
    }
    exercise.sets = [...stored, ...placeholders(missing, nextSetIndex(exercise))]
    return markSent(exercise)
  })
  // Sets of exercises the plan does not list (it always should; never drop a logged set).
  for (const s of sets) {
    if (exercises.some((e) => e.exercise_id === s.exercise_id)) continue
    const own = sets.filter((x) => x.exercise_id === s.exercise_id)
    exercises.push(
      markSent({ ...addedExercise(s.exercise_id), note: own[0]?.note ?? '', sets: own.map(fromServerSet) }),
    )
  }
  return {
    id: session.id,
    date: session.date,
    started_at: session.started_at,
    origin: session.origin,
    template_id: session.template_id,
    name,
    exercises,
    readiness: session.readiness,
    recovery: session.recovery ?? null,
    deload: session.deload ?? null,
    prs: session.prs,
    removed: [],
    to_delete: [],
    start: 'sent',
    finished: finished ? { ended_at: session.ended_at!, summary: null, queued: false } : null,
    touched: Date.now(),
  }
}

/** Untouched placeholders only: nothing created, ticked or typed. */
function untouched(e: LoggerExercise): boolean {
  return e.sets.every((s) => !s.created && !s.done && s.reps === null && s.load_kg === null && s.rpe === null)
}

/**
 * Fold the Worker's view into the working copy without losing anything typed here: plan data (last sets, suggestion,
 * default load, a deload week's set count for untouched exercises), readiness, recovery, deload and PRs come from the
 * Worker; sets it has that this copy never saw are added; this copy's sets and values win.
 */
export function mergeServer(
  local: LoggerSession,
  server: WorkoutSession,
  name: string | null,
): LoggerSession {
  const known = new Set([...local.removed, ...local.exercises.flatMap((e) => e.sets.map((s) => s.id))])
  const plan = new Map((server.plan ?? []).map((p) => [p.exercise_id, p]))
  const exercises = local.exercises.map((e) => {
    const p = plan.get(e.exercise_id)
    let next: LoggerExercise = p ? { ...e, ...planFields(p) } : e
    if (p && untouched(e) && !local.finished) {
      const count = plannedCount(p)
      if (count !== e.sets.length) next = { ...next, sets: placeholders(count, 1) }
    }
    const fresh = server.sets
      .filter((s) => s.exercise_id === e.exercise_id && !known.has(s.id))
      .map(fromServerSet)
    if (fresh.length)
      next = markSent({ ...next, sets: [...next.sets, ...fresh].sort((a, b) => a.set_index - b.set_index) })
    // A set the Worker has is created, whichever write made it.
    const onServer = new Set(server.sets.map((s) => s.id))
    if (next.sets.some((s) => !s.created && onServer.has(s.id)))
      next = { ...next, sets: next.sets.map((s) => (onServer.has(s.id) ? { ...s, created: true } : s)) }
    return next
  })
  const extra = fromServer(server, name).exercises.filter(
    (e) =>
      !local.exercises.some((x) => x.exercise_id === e.exercise_id) &&
      e.sets.some((s) => !known.has(s.id) && s.created),
  )
  return {
    ...local,
    name: local.name ?? name,
    template_id: local.template_id ?? server.template_id,
    exercises: [...exercises, ...extra],
    readiness: server.readiness ?? local.readiness,
    recovery: server.recovery ?? local.recovery,
    deload: server.deload ?? local.deload,
    prs: server.prs ?? local.prs,
    start: 'sent',
    // A queued finish has landed once the Worker has an end time.
    finished: local.finished
      ? { ...local.finished, queued: local.finished.queued && server.ended_at === null }
      : server.ended_at
        ? { ended_at: server.ended_at, summary: null, queued: false }
        : null,
  }
}

// ── Swap ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Swap an exercise mid-session (a busy machine) for another, here on the phone only (the Worker's start plan stays):
 *   null when `toId` is already in the session, `fromId` is not, or every set of `fromId` is done (nothing to move);
 *   otherwise the done sets of `from` stay under it (its card stays with only those; with none done it goes), and its
 *   n open sets become n fresh placeholders for `to` — new client UUIDs, set_index 1…n, `from`'s rep range and rest,
 *   no load and no default load (`to`'s own history fills those in) — placed right after `from`, or in its place.
 * `dropped` is the open sets taken off `from`, for the caller to mark removed (and DELETE where already created).
 */
export function swapExercise(
  session: LoggerSession,
  fromId: string,
  toId: string,
): { session: LoggerSession; dropped: LoggerSet[] } | null {
  const at = session.exercises.findIndex((e) => e.exercise_id === fromId)
  const from = session.exercises[at]
  if (!from || session.exercises.some((e) => e.exercise_id === toId)) return null
  const done = from.sets.filter((s) => s.done)
  const dropped = from.sets.filter((s) => !s.done)
  if (dropped.length === 0) return null
  const to = plannedExercise({
    exercise_id: toId,
    sets: dropped.length,
    rep_min: from.rep_min,
    rep_max: from.rep_max,
    target_load_kg: null,
    rest_sec: from.rest_sec,
  })
  const kept = done.length ? [{ ...from, sets: done }] : []
  return {
    session: {
      ...session,
      exercises: [...session.exercises.slice(0, at), ...kept, to, ...session.exercises.slice(at + 1)],
    },
    dropped,
  }
}

// ── Hints ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Last session's set at the same position, for the greyed "Previous" column (tap to copy). */
export function previousSet(exercise: LoggerExercise, position: number): LastSet | null {
  return exercise.last?.sets[position] ?? null
}

/**
 * The greyed values a set shows until typed (and logs when ticked empty):
 *   load = the nearest earlier ticked set's load in this session, else the default load (progression), else last
 *          session's load at this position
 *   reps = last session's reps at this position (unless the load just went up), else the nearest earlier ticked set's
 *          reps, else the target: rep_min after an increase, rep_max otherwise (double progression aims for the top)
 */
export function setHint(
  exercise: LoggerExercise,
  position: number,
): { reps: number; load_kg: number | null } {
  const earlier = exercise.sets
    .slice(0, position)
    .reverse()
    .find((s) => s.done)
  const prev = previousSet(exercise, position)
  const increase = exercise.suggestion?.kind === 'increase'
  const load_kg = earlier?.load_kg ?? exercise.default_load_kg ?? prev?.load_kg ?? null
  const reps =
    (!increase ? prev?.reps : null) ?? earlier?.reps ?? (increase ? exercise.rep_min : exercise.rep_max)
  return { reps, load_kg }
}

/** "+2.5 kg" when the engine suggests an increase over last session's working load; "Deload" in a deload week. */
export function progressionHint(exercise: LoggerExercise): string | null {
  const s = exercise.suggestion
  if (!s) return null
  if (s.kind === 'deload') return 'Deload'
  if (s.kind !== 'increase' || s.load_kg === null) return null
  const loads = (exercise.last?.sets ?? []).flatMap((x) => (x.load_kg === null ? [] : [x.load_kg]))
  const base = loads.length ? Math.min(...loads) : null
  const delta = base === null ? null : Math.round((s.load_kg - base) * 100) / 100
  return delta !== null && delta > 0 ? `+${delta} kg` : `${s.load_kg} kg`
}

// ── What a set sends ─────────────────────────────────────────────────────────────────────────────────────────────

/** The note a set carries: the exercise note on its first set, nothing on the others. */
export function noteFor(exercise: LoggerExercise, set: LoggerSet): string | null {
  return exercise.sets[0]?.id === set.id && exercise.note.trim() ? exercise.note.trim() : null
}

/** A set exists on the Worker once it is ticked or carries the exercise note. */
export function shouldExist(exercise: LoggerExercise, set: LoggerSet): boolean {
  return set.done || noteFor(exercise, set) !== null
}

export function payloadKey(
  set: Pick<LoggerSet, 'reps' | 'load_kg' | 'rpe' | 'done'>,
  note: string | null,
): string {
  return JSON.stringify([set.reps, set.load_kg, set.rpe, set.done, note])
}

// ── Reading the copy ─────────────────────────────────────────────────────────────────────────────────────────────

export function findSet(
  session: LoggerSession,
  setId: string,
): { exercise: LoggerExercise; set: LoggerSet; position: number } | null {
  for (const exercise of session.exercises) {
    const position = exercise.sets.findIndex((s) => s.id === setId)
    if (position >= 0) return { exercise, set: exercise.sets[position]!, position }
  }
  return null
}

export function setCounts(session: LoggerSession): { done: number; planned: number; volume_kg: number } {
  let done = 0
  let planned = 0
  let volume_kg = 0
  for (const e of session.exercises)
    for (const s of e.sets) {
      planned++
      if (!s.done) continue
      done++
      volume_kg += (s.reps ?? 0) * (s.load_kg ?? 0)
    }
  return { done, planned, volume_kg }
}

/** The session's exercises as a template (Save as template): ticked sets, rep range, top ticked load, rest, note. */
export function asTemplateExercises(session: LoggerSession): TemplateExerciseInput[] {
  return session.exercises.flatMap((e) => {
    const done = e.sets.filter((s) => s.done)
    if (done.length === 0) return []
    const loads = done.flatMap((s) => (s.load_kg === null ? [] : [s.load_kg]))
    return [
      {
        exercise_id: e.exercise_id,
        sets: Math.min(10, done.length),
        rep_min: e.rep_min,
        rep_max: Math.max(e.rep_min, e.rep_max),
        target_load_kg: loads.length ? Math.max(...loads) : null,
        rest_sec: e.rest_sec,
        note: e.note.trim() ? e.note.trim().slice(0, 200) : null,
      },
    ]
  })
}
