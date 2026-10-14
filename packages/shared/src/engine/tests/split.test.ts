// Owns: seam test for the weekly split (upper / lower by training-day position, a letter every two days; 1-3 day weeks
// follow the rest between the days: Full body goes on the best-rested day, back-to-back days are Upper A, Lower A) and
// the key split days, templates and drafts are matched by.
import { describe, expect, test } from 'vitest'
import { splitNameKey, splitSlot, splitSlots, splitTemplateFor } from '../index'

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

  test('three days: Full body goes on the best-rested day, the other two are Upper A then Lower A', () => {
    // Mon, Tue, Thu: rest mon 1, tue 1, thu 2 → Full body on Thu.
    expect(splitSlots(['mon', 'tue', 'thu'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'tue', name: 'Lower A', focus: 'lower' },
      { weekday: 'thu', name: 'Full body', focus: 'full' },
    ])
    // Mon, Wed, Fri: every rest is 2 → the tie goes to the latest day, Fri.
    expect(splitSlots(['mon', 'wed', 'fri'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'wed', name: 'Lower A', focus: 'lower' },
      { weekday: 'fri', name: 'Full body', focus: 'full' },
    ])
    // Tue, Thu, Fri: rest tue 2, thu 1, fri 1 → Full body on Tue; slots stay in week order.
    expect(splitSlots(['tue', 'thu', 'fri'])).toEqual([
      { weekday: 'tue', name: 'Full body', focus: 'full' },
      { weekday: 'thu', name: 'Upper A', focus: 'upper' },
      { weekday: 'fri', name: 'Lower A', focus: 'lower' },
    ])
    expect(splitSlot('thu', ['mon', 'tue', 'thu'])?.focus).toBe('full')
  })

  test('two back-to-back days → Upper A, Lower A (Sun and Mon count as back to back)', () => {
    expect(splitSlots(['mon', 'tue'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'tue', name: 'Lower A', focus: 'lower' },
    ])
    expect(splitSlots(['sun', 'mon'])).toEqual([
      { weekday: 'mon', name: 'Upper A', focus: 'upper' },
      { weekday: 'sun', name: 'Lower A', focus: 'lower' },
    ])
  })

  test('two days with rest between → Full body A, Full body B', () => {
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

  test("a split day's template is the oldest of that name (ties by id); none → null", () => {
    const templates = [
      { id: 'c', name: 'upper a', created_at: '2026-10-02T00:00:00.000Z' },
      { id: 'b', name: 'Upper A ', created_at: '2026-10-01T00:00:00.000Z' },
      { id: 'a', name: 'Upper A', created_at: '2026-10-01T00:00:00.000Z' },
      { id: '0', name: 'Lower A', created_at: '2026-09-01T00:00:00.000Z' },
    ]
    expect(splitTemplateFor(templates, 'Upper A')?.id).toBe('a')
    expect(splitTemplateFor(templates, 'Full body')).toBeNull()
  })
})
