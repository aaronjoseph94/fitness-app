// Owns: characterisation tests for the safety flags (SPEC §3: rapid loss > 1 % of bodyweight a week for 3 weeks;
// plateau < 0.2 kg in 21 days at ≥ 80 % adherence) — shown to Aaron and the coach, never applied.
import { describe, expect, test } from 'vitest'
import { addDays, safetyFlags, type DayRow } from '../index'

const AS_OF = '2026-10-26'

/** 22 days ending AS_OF, trend from `startKg` to `endKg` (linear); every day adherent (weigh-in, 2 meals, water). */
const series = (startKg: number, endKg: number): DayRow[] =>
  Array.from({ length: 22 }, (_, i) => ({
    date: addDays(AS_OF, i - 21),
    weight_kg: startKg + ((endKg - startKg) * i) / 21,
    trend_kg: startKg + ((endKg - startKg) * i) / 21,
    intake: { kcal: 1400, protein_g: 135, carbs_g: 119, fat_g: 45, fibre_g: 30 },
    meals_logged: 2,
    water_ml: 3000,
    steps: 8000,
    sleep_min: 450,
    is_fast_day: false,
    sessions_done: 0,
    targets: { protein_g: 130, steps: 8000 },
  }))

describe('safetyFlags', () => {
  test('rapid_loss: 95.1 → 91.5 kg in 3 weeks is 1.2 kg a week, above 1 % of bodyweight each week', () => {
    const flags = safetyFlags({ as_of: AS_OF, days: series(95.1, 91.5) })

    expect(flags.map((f) => f.kind)).toEqual(['rapid_loss'])
  })

  test('plateau: 95.1 → 95.0 kg in 21 days (< 0.2 kg) at 100 % adherence', () => {
    const flags = safetyFlags({ as_of: AS_OF, days: series(95.1, 95.0) })

    expect(flags).toEqual([expect.objectContaining({ kind: 'plateau', adherence: 1 })])
  })

  test('0.9 kg a week (0.95 % of 95.1 kg, under 1 %) at full adherence raises nothing', () => {
    expect(safetyFlags({ as_of: AS_OF, days: series(95.1, 92.4) })).toEqual([])
  })
})
