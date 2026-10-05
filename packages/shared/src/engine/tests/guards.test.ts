// Owns: seam tests for the guards (SPEC §9 guardrails) — rails from CLAUDE.md: floor 1,400, ceiling 1,700, ≤150 kcal
// per proposal, allowed exercise set only.
import { describe, expect, test } from 'vitest'
import { applyGuards, type GuardContext } from '../guards'

const ctx: GuardContext = {
  actor: 'ai',
  rails: { calorie_floor: 1400, calorie_ceiling: 1700, protein_min_g: 120, fat_min_g: 45, fasts_per_month: 2 },
  plan: {
    defaults: { kcal: 1400, protein_g: 130, carbs_g: 95, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 },
    overrides: {},
  },
  exercises: [
    { id: 'bench', category: 'strength', equipment: 'dumbbell', primary_muscles: ['chest'], secondary_muscles: ['triceps'], allowed: true },
    { id: 'press', category: 'strength', equipment: 'machine', primary_muscles: ['shoulders'], secondary_muscles: [], allowed: true },
    { id: 'pushup', category: 'strength', equipment: 'body only', primary_muscles: ['chest'], secondary_muscles: [], allowed: false },
  ],
  excluded_categories: ['body only'],
  planned_fast_dates: [],
  auto_apply_safe: false,
}

describe('guards', () => {
  test('rejects a proposal below the 1,400 kcal floor', () => {
    const change = { kind: 'target' as const, field: 'kcal' as const, weekday: null, from: 1400, to: 1350 }
    const result = applyGuards([change], ctx)

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ change, rule: 'calorie_floor', reason: expect.any(String) }])
  })

  test('splits a +300 kcal move into +150 now and +150 the week after', () => {
    const change = { kind: 'target' as const, field: 'kcal' as const, weekday: null, from: 1400, to: 1700 }
    const result = applyGuards([change], ctx)

    expect(result.rejected).toEqual([])
    expect(result.accepted).toEqual([{ change: { ...change, from: 1400, to: 1550 }, auto_apply: false }])
    expect(result.scheduled).toEqual([{ change: { ...change, from: 1550, to: 1700 }, week_offset: 1 }])
  })

  test('rejects a workout that uses an exercise from an excluded category', () => {
    const workout = {
      kind: 'workout' as const,
      exercises: [
        { exercise_id: 'bench', sets: 4 },
        { exercise_id: 'press', sets: 4 },
        { exercise_id: 'pushup', sets: 4 },
      ],
    }
    const result = applyGuards([workout], ctx)

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ change: workout, rule: 'excluded_category', reason: expect.stringContaining('body only') }])
  })
})
