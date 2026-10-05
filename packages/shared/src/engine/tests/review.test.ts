// Owns: seam tests for the weekly review aggregate (SPEC §8): intake averaged over logged days with a fast day at
// 0 kcal (SPEC §3), protein adherence on eating days, logging adherence over 7 days, and how each fast went.
import { describe, expect, test } from 'vitest'
import { addDays, weeklyMetrics, type DayRow } from '../index'

const meal = { kcal: 1400, protein_g: 135, carbs_g: 119, fat_g: 45, fibre_g: 30 }
const none = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0 }
const trend = [95.0, 94.9, 94.8, 94.7, 94.6, 94.5, 94.4, 94.3]

/** Sunday 2026-10-04 (the trend start) to Sunday 2026-10-11: Wednesday is a fast day, the last Sunday is not logged. */
const days: DayRow[] = trend.map((trend_kg, i) => {
  const fast = i === 3
  const skipped = i === 7
  return {
    date: addDays('2026-10-04', i),
    weight_kg: skipped ? null : trend_kg,
    trend_kg,
    intake: fast || skipped ? none : meal,
    meals_logged: fast || skipped ? 0 : 2,
    water_ml: skipped ? 0 : 3000,
    steps: skipped ? null : 8000,
    sleep_min: 450,
    is_fast_day: fast,
    sessions_done: i >= 1 && i <= 4 ? 1 : 0,
    targets: { protein_g: 130, steps: 8000 },
  }
})

describe('weeklyMetrics', () => {
  const week = weeklyMetrics({
    week_start: '2026-10-05',
    days,
    sessions_planned: 4,
    fast_hours: 24,
    now: '2026-10-11T13:00:00.000Z',
    fasts: [
      { id: 'done', started_at: '2026-10-07T01:00:00.000Z', ended_at: '2026-10-08T00:00:00.000Z' },
      { id: 'broken', started_at: '2026-10-07T01:00:00.000Z', ended_at: '2026-10-07T21:00:00.000Z' },
      { id: 'running', started_at: '2026-10-11T01:00:00.000Z', ended_at: null },
    ],
  })

  test('intake averages the 6 logged days with the fast day at 0 kcal: 5 × 1,400 / 6 = 1,167 kcal', () => {
    expect(week).toMatchObject({ days_logged: 6, intake_avg: { kcal: 1167, protein_g: 112.5 }, protein_adherence: 1 })
  })

  test('trend 95.0 (the Sunday before) → 94.3 kg; 6 of 7 days adherent; 4 of 4 sessions', () => {
    expect(week.trend_change_kg).toBeCloseTo(-0.7, 10)
    expect(week).toMatchObject({ logging_adherence: 6 / 7, sessions_done: 4, sessions_planned: 4, steps_avg: 8000, water_avg_ml: 3000 })
  })

  test('a 23 h fast of 24 is completed (≥ 95 %), 20 h is partial, one with no end is active', () => {
    expect(week.fasts.map((f) => [f.fast_id, f.hours, f.status])).toEqual([
      ['done', 23, 'completed'],
      ['broken', 20, 'partial'],
      ['running', 12, 'active'],
    ])
  })
})
