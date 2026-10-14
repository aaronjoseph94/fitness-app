// Owns: seam test for the weekly split (upper / lower by training-day position, a letter every two days; a 3-day week
// is Upper A, Lower A, Full body; a 2-day week is Full body A, B; a 1-day week is Full body) and the key split days,
// templates and drafts are matched by.
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

  test('days given out of order (and twice) are taken in week order: sat, fri, mon, wed, mon → mon Upper A, wed Lower A, fri Upper B, sat Lower B', () => {
    expect(splitSlots(['sat', 'fri', 'mon', 'wed', 'mon'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'wed', name: 'Lower A', focus: 'lower' },
      { weekday: 'fri', name: 'Upper B', focus: 'upper' },
      { weekday: 'sat', name: 'Lower B', focus: 'lower' },
    ])
  })

  test('one day: its slot, or null on a rest day', () => {
    expect(splitSlot('thu', MON_THU)).toEqual({ weekday: 'thu', name: 'Lower B', focus: 'lower' })
    expect(splitSlot('sat', MON_THU)).toBeNull()
  })

  test('three days (Mon, Tue, Thu) → Upper A, Lower A, Full body', () => {
    expect(splitSlots(['mon', 'tue', 'thu'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'tue', name: 'Lower A', focus: 'lower' },
      { weekday: 'thu', name: 'Full body', focus: 'full' },
    ])
    expect(splitSlots(['mon', 'wed', 'fri']).map((s) => s.name)).toEqual(['Upper A', 'Lower A', 'Full body'])
    expect(splitSlot('thu', ['mon', 'tue', 'thu'])?.focus).toBe('full')
  })

  test('two days → Full body A, Full body B', () => {
    expect(splitSlots(['tue', 'fri'])).toEqual([
      { weekday: 'tue', name: 'Full body A', focus: 'full' },
      { weekday: 'fri', name: 'Full body B', focus: 'full' },
    ])
  })

  test('one day → Full body', () => {
    expect(splitSlots(['sat'])).toEqual([{ weekday: 'sat', name: 'Full body', focus: 'full' }])
  })

  test('four days keep their names: Upper A, Lower A, Upper B, Lower B', () => {
    expect(splitSlots(MON_THU).map((s) => s.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B'])
  })

  test("names match trimmed and case-insensitive: ' Upper A ' → 'upper a'", () => {
    expect(splitNameKey(' Upper A ')).toBe('upper a')
  })
})
