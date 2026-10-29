// Owns: seam tests for body notes — the 7-day active window, resolving, and what notes steer (a knee → quads and
// hamstrings off, illness → reduced volume), plus daysAgo on the Edmonton day.
import { describe, expect, test } from 'vitest'
import { activeBodyNotes, bodyNoteSteer, daysAgo, type BodyNoteInput } from '../index'

const note = (over: Partial<BodyNoteInput>): BodyNoteInput => ({
  date: '2026-10-20',
  area: 'knee',
  kind: 'pain',
  severity: 2,
  resolved_on: null,
  ...over,
})

describe('activeBodyNotes', () => {
  test('active from its date for 7 days, then not', () => {
    const n = note({})
    expect(activeBodyNotes([n], '2026-10-19')).toEqual([])
    expect(activeBodyNotes([n], '2026-10-27')).toEqual([n])
    expect(activeBodyNotes([n], '2026-10-28')).toEqual([])
  })
  test('resolved on a day: inactive from that day', () => {
    const n = note({ resolved_on: '2026-10-22' })
    expect(activeBodyNotes([n], '2026-10-21')).toEqual([n])
    expect(activeBodyNotes([n], '2026-10-22')).toEqual([])
  })
})

describe('bodyNoteSteer', () => {
  test('a knee pain note avoids quadriceps and hamstrings', () => {
    expect(bodyNoteSteer([note({})])).toEqual({ avoid: ['hamstrings', 'quadriceps'], reduced_volume: false })
  })
  test('mild soreness steers nothing; moderate soreness on a muscle avoids it', () => {
    expect(bodyNoteSteer([note({ kind: 'soreness', area: 'chest', severity: 1 })]).avoid).toEqual([])
    expect(bodyNoteSteer([note({ kind: 'soreness', area: 'chest', severity: 2 })]).avoid).toEqual(['chest'])
  })
  test('illness or low energy reduces volume', () => {
    expect(bodyNoteSteer([note({ kind: 'illness', area: 'whole_body', severity: 1 })])).toEqual({
      avoid: [],
      reduced_volume: true,
    })
    expect(bodyNoteSteer([note({ kind: 'energy', area: 'whole_body', severity: 2 })]).reduced_volume).toBe(true)
  })
})

describe('daysAgo', () => {
  test('yesterday is the Edmonton day before, even after UTC midnight', () => {
    // 2026-10-29 04:30Z is 22:30 on the 28th in Edmonton (MDT).
    expect(daysAgo('2026-10-29T04:30:00.000Z', 1)).toBe('2026-10-27')
    expect(daysAgo('2026-10-29T04:30:00.000Z', 0)).toBe('2026-10-28')
  })
})
