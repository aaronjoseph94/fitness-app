// Owns: what each tap in the session logger does — change the working copy first (instant, offline), then ask the
// sync chain to mirror it: type reps / kg / RPE, copy last session's set, tick a set done (greyed hints fill empty
// fields, the rest timer starts), add or remove sets, add or remove exercises (with their history), exercise notes.
import { endpoints } from '@fitness/shared/api'
import type { ExerciseHistory } from '@fitness/shared/schemas'
import { call } from '../../../api'
import {
  addedExercise,
  findSet,
  nextSetIndex,
  previousSet,
  setHint,
  type LoggerExercise,
  type LoggerSession,
  type LoggerSet,
} from './logger-model'
import { loggerState } from './logger-store'
import { askNotificationPermission } from './rest'
import { syncSet } from './sync'

/** Typing settles before a stored set is patched; notes settle a little longer. */
const TYPING_MS = 800
const NOTE_MS = 1200

export type SetValues = Partial<Pick<LoggerSet, 'reps' | 'load_kg' | 'rpe'>>

function mapExercise(
  session: LoggerSession,
  exerciseId: string,
  fn: (e: LoggerExercise) => LoggerExercise,
): LoggerSession {
  return { ...session, exercises: session.exercises.map((e) => (e.exercise_id === exerciseId ? fn(e) : e)) }
}

function mapSet(session: LoggerSession, setId: string, fn: (s: LoggerSet) => LoggerSet): LoggerSession {
  return {
    ...session,
    exercises: session.exercises.map((e) =>
      e.sets.some((s) => s.id === setId)
        ? { ...e, sets: e.sets.map((s) => (s.id === setId ? fn(s) : s)) }
        : e,
    ),
  }
}

/** Last session's sets of an exercise from its history (skipping this session), with the next-session suggestion. */
function fromHistory(
  history: ExerciseHistory,
  sessionId: string,
): Pick<LoggerExercise, 'last' | 'suggestion' | 'default_load_kg'> {
  const entry = history.entries.find((e) => e.session_id !== sessionId && e.sets.some((s) => s.completed))
  const sets = (entry?.sets ?? [])
    .filter((s) => s.completed)
    .sort((a, b) => a.set_index - b.set_index)
    .map((s) => ({ set_index: s.set_index, reps: s.reps, load_kg: s.load_kg }))
  return {
    last: entry ? { date: entry.date, sets } : null,
    suggestion: history.next,
    default_load_kg: history.next?.load_kg ?? entry?.top_load_kg ?? null,
  }
}

export interface LoggerActions {
  setValues: (setId: string, values: SetValues) => void
  /** Copy last session's set at this position into this set (then edit). */
  copyPrevious: (setId: string) => void
  /** Tick or untick. Ticking fills empty fields from the hints; 'need-load' when there is no load to log. */
  toggleDone: (setId: string) => 'ok' | 'need-load'
  addSet: (exerciseId: string) => void
  removeLastSet: (exerciseId: string) => void
  /** Add an exercise mid-session; false when it is already in the session. */
  addExercise: (exerciseId: string) => boolean
  removeExercise: (exerciseId: string) => void
  setNote: (exerciseId: string, note: string) => void
}

export function loggerActions(sessionId: string): LoggerActions {
  const update = (fn: (s: LoggerSession) => LoggerSession) => loggerState().update(sessionId, fn)
  const current = () => loggerState().sessions[sessionId]

  const removeSets = (sets: readonly LoggerSet[]) => {
    const created = sets.filter((s) => s.created).map((s) => s.id)
    update((s) => ({
      ...s,
      removed: [...s.removed, ...sets.map((x) => x.id)],
      to_delete: [...s.to_delete, ...created],
    }))
    for (const id of created) syncSet(sessionId, id)
  }

  return {
    setValues(setId, values) {
      update((s) => mapSet(s, setId, (x) => ({ ...x, ...values })))
      const found = current() && findSet(current()!, setId)
      if (found?.set.created) syncSet(sessionId, setId, TYPING_MS)
    },

    copyPrevious(setId) {
      const s = current()
      const found = s && findSet(s, setId)
      if (!found) return
      const prev = previousSet(found.exercise, found.position)
      if (!prev) return
      update((x) =>
        mapSet(x, setId, (set) => ({
          ...set,
          reps: prev.reps ?? set.reps,
          load_kg: prev.load_kg ?? set.load_kg,
        })),
      )
      if (found.set.created) syncSet(sessionId, setId)
    },

    toggleDone(setId) {
      const s = current()
      const found = s && findSet(s, setId)
      if (!found) return 'ok'
      const { exercise, set, position } = found
      if (set.done) {
        update((x) => mapSet(x, setId, (y) => ({ ...y, done: false })))
        syncSet(sessionId, setId)
        return 'ok'
      }
      const hint = setHint(exercise, position)
      const load_kg = set.load_kg ?? hint.load_kg
      if (load_kg === null) return 'need-load'
      update((x) => mapSet(x, setId, (y) => ({ ...y, reps: y.reps ?? hint.reps, load_kg, done: true })))
      syncSet(sessionId, setId)
      // Fixing a finished session's sets afterwards: no rest to time.
      if (current()?.finished) return 'ok'
      askNotificationPermission()
      loggerState().startRest({
        session_id: sessionId,
        exercise_id: exercise.exercise_id,
        total_sec: exercise.rest_sec,
      })
      return 'ok'
    },

    addSet(exerciseId) {
      update((s) =>
        mapExercise(s, exerciseId, (e) => ({
          ...e,
          sets: [
            ...e.sets,
            {
              id: crypto.randomUUID(),
              set_index: nextSetIndex(e),
              reps: null,
              load_kg: null,
              rpe: null,
              done: false,
              created: false,
              sent: null,
            },
          ],
        })),
      )
    },

    removeLastSet(exerciseId) {
      const e = current()?.exercises.find((x) => x.exercise_id === exerciseId)
      const last = e?.sets.at(-1)
      if (!e || !last) return
      update((s) => mapExercise(s, exerciseId, (x) => ({ ...x, sets: x.sets.slice(0, -1) })))
      removeSets([last])
    },

    addExercise(exerciseId) {
      const s = current()
      if (!s || s.exercises.some((e) => e.exercise_id === exerciseId)) return false
      update((x) => ({ ...x, exercises: [...x.exercises, addedExercise(exerciseId)] }))
      // Last session's sets and the progression default, when the Worker can be reached.
      call(endpoints.training.exerciseHistory, { params: { id: exerciseId } }).then(
        (history) =>
          update((x) => mapExercise(x, exerciseId, (e) => ({ ...e, ...fromHistory(history, sessionId) }))),
        () => undefined,
      )
      return true
    },

    removeExercise(exerciseId) {
      const e = current()?.exercises.find((x) => x.exercise_id === exerciseId)
      if (!e) return
      update((s) => ({ ...s, exercises: s.exercises.filter((x) => x.exercise_id !== exerciseId) }))
      removeSets(e.sets)
    },

    setNote(exerciseId, note) {
      update((s) => mapExercise(s, exerciseId, (e) => ({ ...e, note })))
      const first = current()?.exercises.find((x) => x.exercise_id === exerciseId)?.sets[0]
      if (first) syncSet(sessionId, first.id, NOTE_MS)
    },
  }
}
