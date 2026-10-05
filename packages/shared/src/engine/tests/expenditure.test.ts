// Owns: seam tests for the adaptive expenditure estimate (SPEC §9: 14-day window, ≥ 10 logged intake days, 50/50
// smoothing with the previous estimate, clamped to 1,200–4,500 kcal) — literals from SPEC §2/§3 (baseline TEE 2,551).
import { describe, expect, test } from 'vitest'
import { estimateExpenditure, type ExpenditureDay } from '../index'

/** 15 days 2026-10-01 … 2026-10-15, trend falling linearly from `startKg` to `endKg`; the first `logged` days logged. */
const days = (startKg: number, endKg: number, logged = 15, kcal = 1400): ExpenditureDay[] =>
  Array.from({ length: 15 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    trend_kg: startKg + ((endKg - startKg) * i) / 14,
    meals_logged: i < logged ? 2 : 0,
    is_fast_day: false,
    intake: { kcal: i < logged ? kcal : 0 },
  }))

describe('estimateExpenditure', () => {
  test('14 logged days at 1,400 kcal with the trend 95.1 → 94.1 kg: raw 1,950, smoothed with 2,551 → 2,251', () => {
    const r = estimateExpenditure({ as_of: '2026-10-15', days: days(95.1, 94.1), previous_kcal: 2551 })

    expect(r.raw_kcal).toBeCloseTo(1950, 6)
    expect(r).toMatchObject({ tdee_est: 2251, updated: true })
  })

  test('9 logged days in the window keep the previous 2,551', () => {
    // Days 1 … 10 logged: 2026-10-02 … 10-10 are in the window (as_of − 13 … as_of), i.e. 9 days.
    const r = estimateExpenditure({ as_of: '2026-10-15', days: days(95.1, 94.1, 10), previous_kcal: 2551 })

    expect(r).toMatchObject({ tdee_est: 2551, updated: false, days_logged: 9 })
  })

  test('an implausible raw value is clamped at 4,500 before smoothing: 0.5 × 4,500 + 0.5 × 2,551 = 3,526', () => {
    // 1,400 kcal while the trend fell 10 kg in 14 days: raw = 1,400 + 10 × 7,700 / 14 = 6,900.
    const r = estimateExpenditure({ as_of: '2026-10-15', days: days(105.1, 95.1), previous_kcal: 2551 })

    expect(r.raw_kcal).toBeCloseTo(6900, 6)
    expect(r.tdee_est).toBe(3526)
  })
})

/** 15 days 2026-10-01 … 10-15, trend falling linearly 95.1 → 94.1 kg; `meals` days at 1,400 kcal, fast days at 0 kcal. */
const withFasts = (kind: (i: number) => 'meals' | 'fast' | 'none'): ExpenditureDay[] =>
  Array.from({ length: 15 }, (_, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    trend_kg: 95.1 - i / 14,
    meals_logged: kind(i) === 'meals' ? 2 : 0,
    is_fast_day: kind(i) === 'fast',
    intake: { kcal: kind(i) === 'meals' ? 1400 : 0 },
  }))

describe('estimateExpenditure: fast days', () => {
  test('two fast days count as logged days at 0 kcal: mean 1,200, raw 1,200 + 550 = 1,750, smoothed → 2,151', () => {
    // window 10-02 … 10-15: 12 days × 1,400 + 2 fast days × 0 = 16,800 / 14 = 1,200; 1 kg × 7,700 / 14 = 550
    // round(0.5 × 1,750 + 0.5 × 2,551) = round(2,150.5) = 2,151
    const r = estimateExpenditure({ as_of: '2026-10-15', days: withFasts((i) => (i === 4 || i === 11 ? 'fast' : 'meals')), previous_kcal: 2551 })

    expect(r).toMatchObject({ tdee_est: 2151, days_logged: 14, updated: true })
    expect(r.raw_kcal).toBeCloseTo(1750, 6)
  })

  test('a fast day is not a missed day: 8 meal days + 2 fast days reach the 10 logged days', () => {
    // logged 10-06 … 10-15: 8 × 1,400 / 10 = 1,120; raw 1,120 + 550 = 1,670; round(0.5 × 1,670 + 0.5 × 2,551) = 2,111
    const r = estimateExpenditure({ as_of: '2026-10-15', days: withFasts((i) => (i < 5 ? 'none' : i === 7 || i === 8 ? 'fast' : 'meals')), previous_kcal: 2551 })

    expect(r).toMatchObject({ tdee_est: 2111, days_logged: 10, updated: true })
  })
})

describe('estimateExpenditure: clamp and missing trend', () => {
  test('a raw value under 1,200 is clamped before smoothing: trend up 3 kg → raw −250 → round(0.5 × 1,200 + 0.5 × 2,551) = 1,876', () => {
    const up: ExpenditureDay[] = days(94.1, 97.1)
    const r = estimateExpenditure({ as_of: '2026-10-15', days: up, previous_kcal: 2551 })

    expect(r.raw_kcal).toBeCloseTo(-250, 6)
    expect(r.tdee_est).toBe(1876)
  })

  test('no trend on as_of − 14 (first weigh-in inside the window) keeps the previous estimate', () => {
    const r = estimateExpenditure({ as_of: '2026-10-15', days: days(95.1, 94.1).slice(1), previous_kcal: 2551 })
    expect(r).toMatchObject({ tdee_est: 2551, updated: false })
  })
})
