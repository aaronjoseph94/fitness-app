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
