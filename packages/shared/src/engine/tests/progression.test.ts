// Owns: seam tests for double progression (SPEC §7): every working set at the top of the rep range at a load in two
// consecutive sessions → +2.5 kg (upper body, dumbbells) or +5 kg (lower body, machines).
import { describe, expect, test } from 'vitest'
import { deloadCheck, nextProgression, recoveryConflicts } from '../index'

const sets = (reps: readonly number[], load_kg: number) => reps.map((r) => ({ reps: r, load_kg, completed: true }))

describe('double progression', () => {
  test('adds 2.5 kg to a dumbbell press after two sessions with every set at rep_max', () => {
    const next = nextProgression({
      exercise: { primary_muscles: ['chest'], equipment: 'dumbbell' },
      rep_min: 8,
      rep_max: 12,
      sets: 3,
      history: [
        { date: '2026-10-05', sets: sets([12, 12, 12], 20) },
        { date: '2026-10-08', sets: sets([12, 12, 12], 20) },
      ],
    })
    expect(next).toMatchObject({ kind: 'increase', load_kg: 22.5, sets: 3 })
  })

  test('adds 5 kg to a leg press machine, and holds while a set falls short of rep_max', () => {
    const exercise = { primary_muscles: ['quadriceps'] as const, equipment: 'machine' }
    const base = { exercise, rep_min: 10, rep_max: 15, sets: 3 }

    const ready = nextProgression({
      ...base,
      history: [
        { date: '2026-10-06', sets: sets([15, 15, 15], 100) },
        { date: '2026-10-09', sets: sets([15, 15, 16], 100) },
      ],
    })
    expect(ready).toMatchObject({ kind: 'increase', load_kg: 105 })

    const notYet = nextProgression({
      ...base,
      history: [
        { date: '2026-10-06', sets: sets([15, 15, 15], 100) },
        { date: '2026-10-09', sets: sets([15, 15, 13], 100) },
      ],
    })
    expect(notYet).toMatchObject({ kind: 'hold', load_kg: 100 })
  })
})

describe('double progression: increments', () => {
  const topped = [
    { date: '2026-10-05', sets: sets([10, 10, 10], 60) },
    { date: '2026-10-08', sets: sets([10, 10, 10], 60) },
  ]

  test('an upper-body barbell lift adds 2.5 kg; an upper-body machine (chest press, stack) adds 5 kg', () => {
    const base = { rep_min: 6, rep_max: 10, sets: 3, history: topped }
    expect(nextProgression({ ...base, exercise: { primary_muscles: ['chest'], equipment: 'barbell' } })).toMatchObject({ kind: 'increase', load_kg: 62.5 })
    expect(nextProgression({ ...base, exercise: { primary_muscles: ['chest'], equipment: 'machine' } })).toMatchObject({ kind: 'increase', load_kg: 65 })
  })

  test('the top of the range at a lower load last time is not two sessions at the same load: hold', () => {
    const history = [topped[0]!, { date: '2026-10-08', sets: sets([10, 10, 10], 57.5) }]
    expect(nextProgression({ rep_min: 6, rep_max: 10, sets: 3, history, exercise: { primary_muscles: ['chest'], equipment: 'dumbbell' } })).toMatchObject({ kind: 'hold', load_kg: 57.5 })
  })
})

describe('deload', () => {
  test('a deload week keeps 60 % of the sets at the same load: 5 → 3, 4 → 2 (2.4), 3 → 2 (1.8)', () => {
    const at = (n: number) =>
      nextProgression({ exercise: { primary_muscles: ['chest'], equipment: 'dumbbell' }, rep_min: 8, rep_max: 12, sets: n, deload_week: true, history: [{ date: '2026-10-05', sets: sets([10, 10], 20) }] })
    expect([at(5), at(4), at(3)].map((p) => [p.kind, p.sets, p.load_kg])).toEqual([['deload', 3, 20], ['deload', 2, 20], ['deload', 2, 20]])
  })

  test('scheduled 6 weeks after the block began (41 days is 5 weeks: not yet)', () => {
    const base = { last_deload_on: null, training_started_on: '2026-10-05', recent_sessions: [] }
    expect(deloadCheck({ ...base, as_of: '2026-11-15' })).toMatchObject({ due: false, weeks_since: 5 })
    expect(deloadCheck({ ...base, as_of: '2026-11-16' })).toMatchObject({ due: true, reason: 'scheduled', weeks_since: 6, sets_factor: 0.6 })
  })

  test('two sessions running that miss the rep minimum on most sets propose a deload', () => {
    const miss = (date: string) => ({ date, sets: [6, 6, 9].map((reps) => ({ reps, rep_min: 8, completed: true })) })
    const hit = (date: string) => ({ date, sets: [8, 6, 9].map((reps) => ({ reps, rep_min: 8, completed: true })) })
    const base = { as_of: '2026-10-20', last_deload_on: null, training_started_on: '2026-10-05' }

    expect(deloadCheck({ ...base, recent_sessions: [miss('2026-10-15'), miss('2026-10-19')] })).toMatchObject({ due: true, reason: 'missed_reps' })
    expect(deloadCheck({ ...base, recent_sessions: [miss('2026-10-15'), hit('2026-10-19')] })).toMatchObject({ due: false })
  })
})

describe('recovery', () => {
  test('a muscle trained as a primary target yesterday conflicts with planning it as a primary today', () => {
    const conflicts = recoveryConflicts({
      date: '2026-10-06',
      planned_primary: ['chest', 'triceps'],
      sessions: [
        { date: '2026-10-05', primary_muscles: ['chest', 'shoulders'] },
        { date: '2026-10-03', primary_muscles: ['triceps'] },
      ],
    })
    expect(conflicts).toEqual(['chest'])
  })
})
