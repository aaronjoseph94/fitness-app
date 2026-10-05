// Owns: the common schema seam — instants arrive with any offset and are stored as UTC; anything else is invalid.
import { describe, expect, test } from 'vitest'
import { Instant } from '../index'

describe('Instant', () => {
  test('an offset instant is normalised to UTC milliseconds', () => {
    expect(Instant.parse('2026-11-20T07:15:00-06:00')).toBe('2026-11-20T13:15:00.000Z')
  })

  test('text that is not a date ("now") is a validation issue, not a thrown RangeError', () => {
    expect(Instant.safeParse('now').success).toBe(false)
    expect(Instant.safeParse('2026-13-45T99:99:99Z').success).toBe(false)
  })
})
