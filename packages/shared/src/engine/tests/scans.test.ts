// Owns: seam tests for the lean-loss guard (SPEC §3, §8): lean > 25 % of the weight lost between two scans is
// flagged; a lean drop matched by a water drop is flagged as hydration instead.
import { describe, expect, test } from 'vitest'
import { compareScans } from '../index'

/** The 2026-09-26 baseline (SPEC §2). */
const baseline = {
  scanned_at: '2026-09-26T16:13:00.000Z',
  weight_kg: 95.1,
  lean_body_mass_kg: 59.6,
  body_fat_mass_kg: 35.5,
  total_body_water_kg: 42.9,
}

describe('lean-loss guard', () => {
  test('flags lean loss when lean is more than 25 % of the weight lost', () => {
    // −4.0 kg weight, −1.3 kg lean (32.5 %), water only −0.3 kg
    const next = { scanned_at: '2026-10-24T16:00:00.000Z', weight_kg: 91.1, lean_body_mass_kg: 58.3, body_fat_mass_kg: 32.8, total_body_water_kg: 42.6 }
    const result = compareScans(baseline, next)

    expect(result.lean_loss).toBe('lean_loss')
    expect(result.lean_share_of_loss).toBeCloseTo(0.325, 3)
  })

  test('calls it hydration when the water drop matches the lean drop', () => {
    // −4.0 kg weight, −1.3 kg lean, −1.4 kg water
    const next = { scanned_at: '2026-10-24T16:00:00.000Z', weight_kg: 91.1, lean_body_mass_kg: 58.3, body_fat_mass_kg: 32.8, total_body_water_kg: 41.5 }
    expect(compareScans(baseline, next).lean_loss).toBe('hydration')
  })
})

describe('lean-loss guard boundary', () => {
  test('lean exactly 25 % of the loss is not more than 25 %: −2.8 kg weight, −0.7 kg lean is ok', () => {
    // 95.1 → 92.3 kg, lean 59.6 → 58.9 kg, fat 35.5 → 33.4 kg, water unchanged
    const next = { scanned_at: '2026-10-24T16:00:00.000Z', weight_kg: 92.3, lean_body_mass_kg: 58.9, body_fat_mass_kg: 33.4, total_body_water_kg: 42.9 }
    const result = compareScans(baseline, next)

    expect(result.lean_share_of_loss).toBe(0.25)
    expect(result.lean_loss).toBe('ok')
  })
})

describe('compareScans: gains and milestones', () => {
  test('lean gained while weight fell is ok (share negative), and body fat 37.3 → 29.9 % reaches "Body fat < 30 %"', () => {
    const before = { ...baseline, body_fat_pct: 37.3 }
    const next = { scanned_at: '2026-11-21T16:00:00.000Z', weight_kg: 90.1, lean_body_mass_kg: 60.1, body_fat_mass_kg: 30.0, total_body_water_kg: 43.2, body_fat_pct: 29.9 }
    const result = compareScans(before, next)

    // weight −5.0 kg, lean +0.5 kg: −0.5 / 5.0 = −0.1
    expect(result.lean_share_of_loss).toBe(-0.1)
    expect(result.lean_loss).toBe('ok')
    expect(result.milestones_reached.map((m) => m.label)).toEqual(['Body fat < 30 %'])
  })
})
