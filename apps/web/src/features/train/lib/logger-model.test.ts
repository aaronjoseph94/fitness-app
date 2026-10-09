// Owns: the mid-session swap rule of the logger's working copy (swapExercise): done sets stay on the old exercise,
// open sets move to the new one as fresh placeholders with the same reps and rest and no load, right after the old one.
import { describe, expect, it } from 'vitest'
import { seedSession, swapExercise, type LoggerSession } from './logger-model'

/** [A: done, open, open; B: open ×3], A at 6–10 reps, 120 s rest and a 50 kg target. */
function session(): LoggerSession {
  const s = seedSession({
    id: 'session-1',
    date: '2026-10-09',
    started_at: '2026-10-09T17:00:00.000Z',
    origin: 'template',
    template_id: null,
    name: 'Lower A',
    exercises: [
      { exercise_id: 'A', sets: 3, rep_min: 6, rep_max: 10, target_load_kg: 50, rest_sec: 120, note: null },
      { exercise_id: 'B', sets: 3, rep_min: 8, rep_max: 12, target_load_kg: null, rest_sec: 90, note: null },
    ],
  })
  const [a] = s.exercises
  a!.sets[0] = { ...a!.sets[0]!, reps: 8, load_kg: 50, done: true, created: true }
  return s
}

describe('swapExercise', () => {
  it('keeps the done set on A and moves the two open ones to C, right after A', () => {
    const before = session()
    const open = before.exercises[0]!.sets.slice(1).map((s) => s.id)
    const result = swapExercise(before, 'A', 'C')

    expect(result).not.toBeNull()
    const { session: after, dropped } = result!
    expect(after.exercises.map((e) => e.exercise_id)).toEqual(['A', 'C', 'B'])
    expect(after.exercises[0]!.sets).toEqual([before.exercises[0]!.sets[0]])
    expect(dropped.map((s) => s.id)).toEqual(open)

    const c = after.exercises[1]!
    expect(c).toMatchObject({ rep_min: 6, rep_max: 10, rest_sec: 120 })
    expect(c).toMatchObject({ default_load_kg: null, last: null, suggestion: null })
    expect(c.sets.map((s) => s.set_index)).toEqual([1, 2])
    for (const s of c.sets) {
      expect(s).toMatchObject({ reps: null, load_kg: null, rpe: null, done: false, created: false, sent: null })
      expect(open).not.toContain(s.id)
    }
  })

  it('replaces B entirely when none of its sets is done', () => {
    const result = swapExercise(session(), 'B', 'D')

    expect(result!.session.exercises.map((e) => e.exercise_id)).toEqual(['A', 'D'])
    expect(result!.session.exercises[1]!.sets.map((s) => s.set_index)).toEqual([1, 2, 3])
    expect(result!.dropped).toHaveLength(3)
  })

  it('is null when the new exercise is already in the session, the old one is not, or nothing is left to move', () => {
    const allDone = session()
    allDone.exercises[0]!.sets = allDone.exercises[0]!.sets.map((s) => ({ ...s, done: true }))

    expect(swapExercise(session(), 'A', 'B')).toBeNull()
    expect(swapExercise(session(), 'X', 'C')).toBeNull()
    expect(swapExercise(allDone, 'A', 'C')).toBeNull()
  })
})
