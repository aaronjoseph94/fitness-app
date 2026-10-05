// Owns: seam tests for double progression (SPEC §7): every working set at the top of the rep range at a load in two
// consecutive sessions → +2.5 kg (upper body, dumbbells) or +5 kg (lower body, machines).
import { describe, expect, test } from 'vitest'
import { nextProgression } from '../index'

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
