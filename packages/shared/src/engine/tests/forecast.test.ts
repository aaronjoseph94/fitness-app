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

describe('forecast: a deficit too small to reach the goal on any calendar date', () => {
  test('0.001 and 0.05 kcal/day deficits give no finish date (the nightly reforecast must not throw or store "+0…")', () => {
    // 0.001 kcal/day → 30.1 kg takes ≈ 4.5 × 10⁹ days; 0.05 kcal/day → ≈ 4.6 × 10⁶ days (year ≈ 14,600)
    for (const tdee_est of [1400.001, 1400.05]) {
      const f = forecast({ as_of: '2026-10-05', tdee_est, intake_kcal: 1400, trend_kg: 95.1, goal_kg: 65 })
      expect(f.weekly_rate_kg).toBeGreaterThan(0)
      expect(f.finish_date).toBeNull()
      expect(f.finish_band).toEqual({ early: null, late: null })
    }
  })
})

describe('forecast: the ±20 % band and the goal', () => {
  test('SPEC §3 example: finish dates at the band rates are 2027-03-13 (fast) and 2027-06-05 (slow)', () => {
    const f = forecast({ as_of: '2026-09-26', tdee_est: 2551, intake_kcal: 1400, trend_kg: 95.1, goal_kg: 65 })

    // 30.1 kg / 1.2556 kg/week = 23.97 weeks = 167.8 days → 168; 30.1 / 0.8371 = 35.96 weeks = 251.7 days → 252
    expect(f.finish_band).toEqual({ early: '2027-03-13', late: '2027-06-05' })
  })

  test('already at 65 kg: no weeks to go, finish today', () => {
    const f = forecast({ as_of: '2026-10-05', tdee_est: 2000, intake_kcal: 1400, trend_kg: 65, goal_kg: 65 })
    expect(f).toMatchObject({ weeks_to_goal: 0, finish_date: '2026-10-05' })
  })
})
