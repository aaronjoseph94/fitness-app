// Owns: the health ingest seam — the iOS Shortcut webhook body (SPEC §8 route 3) as the Worker receives it.
import { describe, expect, test } from 'vitest'
import { HealthIngest } from '../index'

describe('HealthIngest', () => {
  test('the Shortcut body {date, steps, sleep:{in_bed_at, woke_at, asleep_min}} parses with instants in UTC', () => {
    const body = {
      date: '2026-10-04',
      steps: 8432,
      sleep: { in_bed_at: '2026-10-03T22:41:00-06:00', woke_at: '2026-10-04T06:12:00-06:00', asleep_min: 412 },
    }
    expect(HealthIngest.parse(body)).toEqual({
      date: '2026-10-04',
      steps: 8432,
      sleep: { in_bed_at: '2026-10-04T04:41:00.000Z', woke_at: '2026-10-04T12:12:00.000Z', asleep_min: 412 },
    })
  })

  test('numbers sent as text by Shortcuts are read as whole numbers', () => {
    const body = { date: '2026-10-04', steps: '8432', sleep: { in_bed_at: '2026-10-03T22:41:00-06:00', woke_at: '2026-10-04T06:12:00-06:00', asleep_min: '411.6' } }
    expect(HealthIngest.parse(body)).toMatchObject({ steps: 8432, sleep: { asleep_min: 412 } })
  })
})
