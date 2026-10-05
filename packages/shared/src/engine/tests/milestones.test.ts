// Owns: seam tests for milestones (SPEC §3) — stored definitions, including ones the coach adds, are each evaluated.
import { describe, expect, test } from 'vitest'
import { milestones } from '../index'

const leg = (fat_kg: number) => ({ lean_kg: 10, fat_kg })

describe('milestones', () => {
  test('a coach-added WHR < 0.95 and a left-leg segment milestone are reached by the first scan meeting them', () => {
    const scans = [
      { id: 'baseline', scanned_at: '2026-09-26T14:00:00.000Z', waist_hip_ratio: 0.97, segments: { torso: leg(14), left_leg: leg(5.2) } },
      { id: 'october', scanned_at: '2026-10-24T14:00:00.000Z', waist_hip_ratio: 0.94, segments: { torso: leg(10.4), left_leg: leg(4.9) } },
    ]
    const result = milestones({
      trend: [],
      scans,
      definitions: [
        { id: 'whr', kind: 'whr', target_value: 0.95 },
        { id: 'leg', kind: 'segment', target_value: 5, segment: 'left_leg' },
        { id: 'torso', kind: 'segment', target_value: 10.4, segment: 'torso' },
      ],
    })

    expect(result).toEqual([
      { id: 'whr', kind: 'whr', target_value: 0.95, reached_on: '2026-10-24', scan_id: 'october' },
      { id: 'leg', kind: 'segment', target_value: 5, reached_on: '2026-10-24', scan_id: 'october' },
      { id: 'torso', kind: 'segment', target_value: 10.4, reached_on: null, scan_id: null },
    ])
  })
})

describe('weight milestones', () => {
  test('90 kg is reached on the first date the trend is at or under 90.0 (input in any order), with the nearest scan', () => {
    const result = milestones({
      trend: [
        { date: '2026-11-03', trend_kg: 89.8 },
        { date: '2026-11-01', trend_kg: 90.05 },
        { date: '2026-11-02', trend_kg: 90.0 },
        { date: '2026-10-31', trend_kg: null },
      ],
      scans: [
        { id: 'sep', scanned_at: '2026-09-26T16:13:00.000Z' },
        { id: 'oct', scanned_at: '2026-10-24T16:00:00.000Z' },
        { id: 'nov', scanned_at: '2026-11-21T16:00:00.000Z' },
      ],
      definitions: [
        { id: 'w90', kind: 'weight', target_value: 90 },
        { id: 'w85', kind: 'weight', target_value: 85 },
      ],
    })

    // 2026-11-02 is 9 days after the October scan and 19 days before November's
    expect(result).toEqual([
      { id: 'w90', kind: 'weight', target_value: 90, reached_on: '2026-11-02', scan_id: 'oct' },
      { id: 'w85', kind: 'weight', target_value: 85, reached_on: null, scan_id: null },
    ])
  })
})
