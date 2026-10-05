// Owns: seam test for the muscle score (SPEC §7: Σ sets × (1.0 primary, 0.5 secondary)) and its map levels.
import { describe, expect, test } from 'vitest'
import { muscleLevels, muscleScores } from '../index'

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
