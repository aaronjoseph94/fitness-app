// Owns: seam test for the muscle score (SPEC §7: Σ sets × (1.0 primary, 0.5 secondary)) and its map levels.
import { describe, expect, test } from 'vitest'
import { e1rm, muscleLevels, muscleScores, sessionSummary } from '../index'

describe('muscle score', () => {
  test('a two-exercise session scores primaries in full and secondaries at half, and maps them to levels', () => {
    const scores = muscleScores([
      // dumbbell bench press, 4 sets
      { primary_muscles: ['chest'], secondary_muscles: ['shoulders', 'triceps'], sets: 4 },
      // triceps pushdown, 3 sets
      { primary_muscles: ['triceps'], secondary_muscles: [], sets: 3 },
    ])

    // chest 4 × 1.0 = 4; shoulders 4 × 0.5 = 2; triceps 4 × 0.5 + 3 × 1.0 = 5
    expect(scores).toEqual({ chest: 4, shoulders: 2, triceps: 5 })

    // Quantiles over the trained muscles [2, 4, 5]: shoulders ⅓ → 2, chest ⅔ → 3, triceps 1 → 4; untrained → 0.
    const levels = muscleLevels(scores)
    expect([levels.shoulders, levels.chest, levels.triceps, levels.biceps]).toEqual([2, 3, 4, 0])
  })
})

describe('e1RM and PRs', () => {
  test('Epley: 100 kg × 10 reps → 133.3 kg; 0 reps → the load itself', () => {
    expect(e1rm(100, 10)).toBeCloseTo(133.333, 3)
    expect(e1rm(60, 0)).toBe(60)
  })

  test('62.5 kg × 8 after 60 kg × 10 is a best load at 8+ reps, not an e1RM PR (79.17 < 80.0 kg)', () => {
    const tags = { id: 'bench', primary_muscles: ['chest' as const], secondary_muscles: ['triceps' as const] }
    const set = (reps: number, load_kg: number) => ({ exercise_id: 'bench', reps, load_kg, completed: true })
    const summary = sessionSummary({
      date: '2026-10-08',
      started_at: '2026-10-08T22:30:00.000Z',
      ended_at: '2026-10-08T23:31:00.000Z',
      sets: [set(8, 62.5), set(8, 62.5), set(7, 62.5)],
      exercises: [tags],
      history: [set(10, 60), set(10, 60)],
    })

    // volume 8 × 62.5 + 8 × 62.5 + 7 × 62.5 = 1,437.5 kg; chest 3 sets × 1.0, triceps 3 × 0.5
    expect(summary).toMatchObject({ duration_min: 61, total_volume_kg: 1437.5, muscle_scores: { chest: 3, triceps: 1.5 } })
    // e1RM 62.5 × (1 + 8/30) = 79.17 < 60 × (1 + 10/30) = 80.0; best load at ≥ 8 reps 62.5 > 60 (7 × 62.5 is dominated)
    expect(summary.prs.map((p) => [p.kind, p.reps, p.load_kg])).toEqual([['best_load_at_reps', 8, 62.5]])
  })
})
