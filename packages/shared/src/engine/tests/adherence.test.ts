// Owns: seam tests for logging adherence (GLOSSARY: a day with a weigh-in, at least two logged meals or a fast, and
// water logged) — a fast day is a known pattern, not a missed day (CLAUDE.md rails).
import { describe, expect, test } from 'vitest'
import { adherence, dayAdherence } from '../index'

const day = { date: '2026-10-07', weight_kg: 94.8, meals_logged: 2, is_fast_day: false, water_ml: 3000 }

describe('adherence', () => {
  test('a fast day with a weigh-in and water and no meals is adherent', () => {
    expect(dayAdherence({ ...day, meals_logged: 0, is_fast_day: true })).toMatchObject({ meals_or_fast: true, score: 1, adherent: true })
  })

  test('one meal (not a fast day) is two of three checks: not adherent', () => {
    expect(dayAdherence({ ...day, meals_logged: 1 })).toMatchObject({ meals_or_fast: false, score: 2 / 3, adherent: false })
  })

  test('over a 7-day window, days without a row count as not adherent: 3 rows → 3 / 7', () => {
    const rows = ['2026-10-05', '2026-10-06', '2026-10-07'].map((date) => ({ ...day, date }))
    expect(adherence(rows, 7)).toMatchObject({ share: 3 / 7, adherent_days: 3, window_days: 7 })
    expect(adherence([]).share).toBe(0)
  })
})
