// Owns: seam test for the weekly split (upper / lower by training-day position, a letter every two days) and the key
// split days, templates and drafts are matched by.
import { describe, expect, test } from 'vitest'
import { splitNameKey, splitSlot, splitSlots } from '../index'

const MON_THU = ['mon', 'tue', 'wed', 'thu'] as const

describe('weekly split', () => {
  test('Mon–Thu → Upper A, Lower A, Upper B, Lower B', () => {
    expect(splitSlots(MON_THU)).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'tue', name: 'Lower A', focus: 'lower' },
      { weekday: 'wed', name: 'Upper B', focus: 'upper' },
      { weekday: 'thu', name: 'Lower B', focus: 'lower' },
    ])
  })

  test('days given out of order (and twice) are taken in week order: fri, mon, wed → mon Upper A, wed Lower A, fri Upper B', () => {
    expect(splitSlots(['fri', 'mon', 'wed', 'mon'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'wed', name: 'Lower A', focus: 'lower' },
      { weekday: 'fri', name: 'Upper B', focus: 'upper' },
    ])
  })

  test('one day: its slot, or null on a rest day', () => {
    expect(splitSlot('thu', MON_THU)).toEqual({ weekday: 'thu', name: 'Lower B', focus: 'lower' })
    expect(splitSlot('sat', MON_THU)).toBeNull()
  })

  test("names match trimmed and case-insensitive: ' Upper A ' → 'upper a'", () => {
    expect(splitNameKey(' Upper A ')).toBe('upper a')
  })
})
