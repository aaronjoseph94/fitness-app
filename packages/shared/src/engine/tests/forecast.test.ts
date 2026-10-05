// Owns: seam tests for the forecast, against the SPEC §3 worked example (TEE 2,551 − 1,400 kcal → ~1.0 kg/week).
import { describe, expect, test } from 'vitest'
import { forecast } from '../index'

describe('forecast', () => {
  test('scan TEE 2,551 kcal at 1,400 kcal intake loses ≈1.05 kg/week and reaches 65 kg from 95.1 kg on 2027-04-16', () => {
    const f = forecast({ as_of: '2026-09-26', tdee_est: 2551, intake_kcal: 1400, trend_kg: 95.1, goal_kg: 65 })

    // (2,551 − 1,400) × 7 / 7,700 = 1.0464 kg/week
    expect(f.weekly_rate_kg).toBeCloseTo(1.05, 2)
    // 30.1 kg / 1.0464 kg/week = 28.77 weeks = 201.4 days → day 202 = 2027-04-16
    expect(f.finish_date).toBe('2027-04-16')
    // band ±20 % of the rate: 0.8371 … 1.2557 kg/week
    expect(f.band.low).toBeCloseTo(0.84, 2)
    expect(f.band.high).toBeCloseTo(1.26, 2)
  })

  test('no finish date when intake does not create a deficit', () => {
    const f = forecast({ as_of: '2026-09-26', tdee_est: 1400, intake_kcal: 1400, trend_kg: 95.1, goal_kg: 65 })
    expect(f.weekly_rate_kg).toBe(0)
    expect(f.finish_date).toBeNull()
  })
})
