// Owns: seam tests for readiness (SPEC §9: 0–100 from last night's sleep vs 7.5 h, yesterday's steps vs the 14-day
// median, days since the last session; under 40 suggests reduced volume; SPEC §7: a night under 5 h does too).
import { describe, expect, test } from 'vitest'
import { readiness } from '../index'

const median8000 = Array.from({ length: 14 }, () => 8000)

describe('readiness', () => {
  test('a session dated after today (days since −3) cannot pull the score under 0', () => {
    const r = readiness({ sleep_min: 210, steps_yesterday: 30000, steps_prior_14d: median8000, days_since_last_session: -3 })
    expect(r.score).toBe(0)
  })

  test('7.5 h asleep, yesterday at the 14-day median of steps, two rest days: 100, full volume', () => {
    const r = readiness({ sleep_min: 450, steps_yesterday: 8000, steps_prior_14d: median8000, days_since_last_session: 2 })
    expect(r).toEqual({ score: 100, sleep_h: 7.5, steps_vs_median: 1, days_since_last_session: 2, reduced_volume: false })
  })

  test('5.5 h asleep after a 2.25× median step day and training yesterday scores under 40: reduced volume', () => {
    const r = readiness({ sleep_min: 330, steps_yesterday: 18000, steps_prior_14d: median8000, days_since_last_session: 0 })
    expect(r.score).toBeLessThan(40)
    expect(r.score).toBeGreaterThanOrEqual(0)
    expect(r.reduced_volume).toBe(true)
  })

  test('4 h 59 min asleep suggests reduced volume whatever the score', () => {
    const r = readiness({ sleep_min: 299, steps_yesterday: 8000, steps_prior_14d: median8000, days_since_last_session: 3 })
    expect(r.score).toBeGreaterThanOrEqual(40)
    expect(r.reduced_volume).toBe(true)
  })

  test('the worst case stays inside 0–100; no data at all is 100', () => {
    expect(readiness({ sleep_min: 0, steps_yesterday: 40000, steps_prior_14d: median8000, days_since_last_session: 0 }).score).toBeGreaterThanOrEqual(0)
    expect(readiness({ sleep_min: null, steps_yesterday: null, steps_prior_14d: [], days_since_last_session: null })).toMatchObject({ score: 100, reduced_volume: false })
  })
})
