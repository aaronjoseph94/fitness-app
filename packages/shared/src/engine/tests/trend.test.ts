// Owns: seam tests for trend weight (EWMA α = 0.25, gaps carry the trend forward). Literals worked by hand.
import { describe, expect, test } from 'vitest'
import { trendChange, trendWeights } from '../index'

describe('trend weight', () => {
  test('seeds with the first weigh-in, smooths by α = 0.25 and carries the trend across a missed day', () => {
    const series = trendWeights([
      { date: '2026-10-01', weight_kg: 95.1 },
      { date: '2026-10-02', weight_kg: 94.7 },
      // 2026-10-03: no weigh-in
      { date: '2026-10-04', weight_kg: 94.3 },
    ])

    expect(series.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(series.map((p) => p.weight_kg)).toEqual([95.1, 94.7, null, 94.3])
    // 95.1 → 95.1 + 0.25 × (94.7 − 95.1) = 95.0 → gap 95.0 → 95.0 + 0.25 × (94.3 − 95.0) = 94.825
    const trend = series.map((p) => p.trend_kg)
    expect(trend[0]).toBeCloseTo(95.1, 10)
    expect(trend[1]).toBeCloseTo(95.0, 10)
    expect(trend[2]).toBeCloseTo(95.0, 10)
    expect(trend[3]).toBeCloseTo(94.825, 10)
  })

  test('7-day change is of the trend, carried forward to the asked date', () => {
    const series = trendWeights(
      [
        { date: '2026-10-01', weight_kg: 96.0 },
        { date: '2026-10-08', weight_kg: 92.0 },
      ],
      { to: '2026-10-09' },
    )
    // trend 10-01 = 96.0, carried to 10-07; 10-08 = 96 + 0.25 × (92 − 96) = 95.0; 10-09 carries 95.0.
    expect(trendChange(series, '2026-10-08')).toBeCloseTo(-1.0, 10)
    expect(trendChange(series, '2026-10-09')).toBeCloseTo(-1.0, 10)
    expect(trendChange(series, '2026-10-05')).toBeNull()
  })
})
