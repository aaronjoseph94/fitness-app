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

  test('impossible sleep from the Shortcut is refused: waking before bed, or asleep longer than in bed', () => {
    const night = { in_bed_at: '2026-10-03T22:41:00-06:00', woke_at: '2026-10-04T06:12:00-06:00' }
    const body = (sleep: object) => ({ date: '2026-10-04', steps: 8432, sleep })
    expect(HealthIngest.safeParse(body({ in_bed_at: night.woke_at, woke_at: night.in_bed_at, asleep_min: 412 })).success).toBe(false)
    expect(HealthIngest.safeParse(body({ ...night, asleep_min: 452 })).success).toBe(false) // in bed 451 min
    expect(HealthIngest.safeParse(body({ ...night, asleep_min: 451 })).success).toBe(true)
  })
})
