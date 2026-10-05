// Owns: seam tests for the Edmonton date helpers (CLAUDE.md "Time": instants stored in UTC, the local date computed with
// Intl in America/Edmonton) — day boundaries, the clock changes, ISO weeks and the leap day.
// Edmonton after 2026-11-01 differs between tz databases (2025b: back to MST −07:00 each winter; 2026c: UTC−6 all
// year), so tests after that date assert what holds under either rule instead of a fixed offset.
import { describe, expect, test } from 'vitest'
import { addDays, daysBetween, eachDate, isoWeek, isoWeekRange, localDate, localMidnight, localTime, weekdayOf, weekStart } from '../index'

describe('local date and time of an instant', () => {
  test('in summer (MDT, UTC−6) the Edmonton day starts at 06:00Z', () => {
    expect([localDate('2026-10-05T05:59:59.000Z'), localTime('2026-10-05T05:59:59.000Z')]).toEqual(['2026-10-04', '23:59'])
    expect([localDate('2026-10-05T06:00:00.000Z'), localTime('2026-10-05T06:00:00.000Z')]).toEqual(['2026-10-05', '00:00'])
  })

  test('spring forward on 2026-03-08: 01:59 MST is followed by 03:00 MDT', () => {
    expect(localTime('2026-03-08T08:59:00.000Z')).toBe('01:59')
    expect(localTime('2026-03-08T09:00:00.000Z')).toBe('03:00')
  })

  test('an offset instant and its UTC form give the same local date', () => {
    expect(localDate('2026-10-04T23:30:00-06:00')).toBe('2026-10-04')
    expect(localDate('2026-10-05T05:30:00.000Z')).toBe('2026-10-04')
  })
})

describe('localMidnight', () => {
  test.each(['2026-03-08', '2026-10-31', '2026-11-01', '2026-11-02', '2027-03-14', '2027-03-15', '2028-02-29'])(
    '%s starts at 00:00 local, and the instant before it is the previous date',
    (date) => {
      const start = localMidnight(date)
      expect([localDate(start), localTime(start)]).toEqual([date, '00:00'])
      expect(localDate(start - 1)).toBe(addDays(date, -1))
    },
  )

  test('a summer day starts at 06:00Z', () => {
    expect(new Date(localMidnight('2026-10-05')).toISOString()).toBe('2026-10-05T06:00:00.000Z')
  })
})

describe('calendar arithmetic', () => {
  test('the 2028 leap day: 28 Feb + 1 = 29 Feb (a Tuesday), + 2 = 1 Mar; February 2028 has 29 days', () => {
    expect([addDays('2028-02-28', 1), addDays('2028-02-28', 2), addDays('2028-02-29', 365)]).toEqual(['2028-02-29', '2028-03-01', '2029-02-28'])
    expect(daysBetween('2028-02-01', '2028-03-01')).toBe(29)
    expect(weekdayOf('2028-02-29')).toBe('tue')
  })

  test('eachDate lists every day once across the clock change, and nothing when to < from', () => {
    expect(eachDate('2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-01', '2026-11-02'])
    expect(eachDate('2027-03-13', '2027-03-15')).toEqual(['2027-03-13', '2027-03-14', '2027-03-15'])
    expect(eachDate('2026-10-05', '2026-10-04')).toEqual([])
  })

  test('weeks run Monday to Sunday: Sunday 2026-10-11 is in the week of Monday 2026-10-05', () => {
    expect(weekStart('2026-10-11')).toBe('2026-10-05')
    expect(weekStart('2026-10-05')).toBe('2026-10-05')
  })
})

describe('ISO weeks', () => {
  test('the week belongs to the year of its Thursday', () => {
    expect(isoWeek('2026-10-05')).toBe('2026-W41')
    expect(isoWeek('2026-12-31')).toBe('2026-W53')
    expect(isoWeek('2027-01-03')).toBe('2026-W53')
    expect(isoWeek('2027-01-04')).toBe('2027-W01')
    expect(isoWeek('2024-12-30')).toBe('2025-W01')
    expect(isoWeek('2028-02-29')).toBe('2028-W09')
  })

  test('2026-W53 runs 2026-12-28 … 2027-01-03; 2027 has no week 53', () => {
    expect(isoWeekRange('2026-W53')).toEqual({ from: '2026-12-28', to: '2027-01-03' })
    expect(() => isoWeekRange('2027-W53')).toThrow(RangeError)
  })
})
