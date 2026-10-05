// Owns: seam tests for materialiseTargets (SPEC §5, §6, §8) — which days are training days under a week plan.
import { describe, expect, test } from 'vitest'
import { fastDay, materialiseTargets, meanPlannedIntake, type TargetsInput, type WeekPlanLike } from '../index'

const day = { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30 }
const rest = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }

/** The week of Monday 2026-10-05, settings.training_days = Mon–Thu (SPEC §12 default split). */
const input = (sessions: WeekPlanLike['plan']['sessions']): TargetsInput => ({
  from: '2026-10-05',
  to: '2026-10-11',
  plan_version: { id: 'v1', targets: { defaults: { ...day, water_ml: 3000, steps: 8000 }, overrides: {} } },
  rails: { calorie_floor: 1400, protein_min_g: 130, fat_min_g: 45 },
  training_days: ['mon', 'tue', 'wed', 'thu'],
  fast_dates: [],
  week_plans: [
    {
      id: 'wp',
      week_start: '2026-10-05',
      plan: {
        targets: { mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day },
        sessions,
        water_ml: 3000,
        steps: 8000,
        fast_dates: [],
      },
    },
  ],
})

const planned = (sessions: WeekPlanLike['plan']['sessions']) => materialiseTargets(input(sessions)).map((d) => d.training_planned)

describe('materialiseTargets training days', () => {
  test('a week plan with no sessions (the carry-forward draft) keeps the Mon–Thu training days', () => {
    expect(planned(rest)).toEqual([true, true, true, true, false, false, false])
  })

  test('a week plan with sessions decides the training days itself', () => {
    expect(planned({ ...rest, tue: { name: 'Upper' }, sat: { name: 'Lower' } })).toEqual([false, true, false, false, false, true, false])
  })
})

describe('fast days', () => {
  test('a 24 h fast from 19:00 (dinner to dinner) makes one fast day: the next day', () => {
    // 2026-10-15 19:00 MDT = 2026-10-16T01:00Z
    expect(fastDay({ started_at: '2026-10-16T01:00:00.000Z', ended_at: null }, 24)).toBe('2026-10-16')
    expect(fastDay({ started_at: '2026-10-16T01:00:00.000Z', ended_at: '2026-10-17T01:00:00.000Z' }, 24)).toBe('2026-10-16')
  })

  test('a fast ended 5 s after it started (a mis-tap) makes no fast day', () => {
    expect(fastDay({ started_at: '2026-10-05T18:00:00.000Z', ended_at: '2026-10-05T18:00:05.000Z' }, 24)).toBeNull()
  })

  test("a week plan's fast date without a fast in the log is not a fast day", () => {
    const base = input(rest)
    const days = materialiseTargets({ ...base, week_plans: base.week_plans!.map((w) => ({ ...w, plan: { ...w.plan, fast_dates: ['2026-10-08'] } })) })
    expect(days.find((d) => d.date === '2026-10-08')).toMatchObject({ is_fast_day: false, kcal: 1400 })
  })
})

describe('macros held to the kcal target', () => {
  test('a stored fat target of 200 g on a 1,400 kcal day is cut so protein × 4 + fat × 9 ≤ kcal (carbs ≥ 0)', () => {
    const base = input(rest)
    const [day] = materialiseTargets({
      ...base,
      to: base.from,
      week_plans: [],
      plan_version: { id: 'v', targets: { defaults: { ...base.plan_version.targets.defaults, fat_g: 200 }, overrides: {} } },
    })
    // 1,400 − 130 × 4 = 880 kcal left for fat: 97 g (873 kcal), 7 kcal → carbs 2 g.
    expect(day).toMatchObject({ kcal: 1400, protein_g: 130, fat_g: 97, carbs_g: 2 })
  })
})

describe('materialiseTargets: rails and fast days', () => {
  const plain = (over: Partial<TargetsInput> = {}): TargetsInput => ({ ...input(rest), week_plans: [], ...over })

  test('a Thursday override under the rails (1,200 kcal, 100 g protein, 30 g fat) is held at 1,400 / 130 / 45 with 119 g carbs', () => {
    const base = plain()
    const days = materialiseTargets({
      ...base,
      plan_version: { id: 'v', targets: { ...base.plan_version.targets, overrides: { thu: { kcal: 1200, protein_g: 100, fat_g: 30 } } } },
    })
    // carbs = (1,400 − 130 × 4 − 45 × 9) / 4 = 118.75 → 119
    expect(days.find((d) => d.date === '2026-10-08')).toMatchObject({ kcal: 1400, protein_g: 130, fat_g: 45, carbs_g: 119 })
  })

  test('a week plan day under the floor is held at 1,400 kcal', () => {
    const base = input(rest)
    const wp = base.week_plans![0]!
    const days = materialiseTargets({ ...base, week_plans: [{ ...wp, plan: { ...wp.plan, targets: { ...wp.plan.targets, fri: { ...day, kcal: 1100 } } } }] })
    expect(days.find((d) => d.date === '2026-10-09')).toMatchObject({ kcal: 1400 })
  })

  test('a fast day on a training day: 0 kcal and macros, water 3,000 + 500 ml, a light session', () => {
    const [wed] = materialiseTargets(plain({ from: '2026-10-07', to: '2026-10-07', fast_dates: ['2026-10-07'] }))
    expect(wed).toMatchObject({ is_fast_day: true, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fibre_g: 0, water_ml: 3500, training_planned: true, training_load: 'light' })
  })
})

describe('fast days across the clock change and the month end', () => {
  // These instants give the same fast day under either tz rule for Edmonton after 2026-11-01 (fall back to MST,
  // or the tzdata 2026c rule that stays on UTC−6), so the test does not depend on the runtime's time zone data.
  test('a 24 h fast from 19:00 on 31 October (MDT) makes 1 November the fast day — November counts it', () => {
    // 2026-10-31 19:00 MDT = 2026-11-01T01:00Z: 5 h on 31 Oct, 19 h on 1 Nov
    expect(fastDay({ started_at: '2026-11-01T01:00:00.000Z', ended_at: null }, 24)).toBe('2026-11-01')
    expect(fastDay({ started_at: '2026-11-01T01:00:00.000Z', ended_at: '2026-11-02T01:00:00.000Z' }, 24)).toBe('2026-11-01')
  })

  test('a 24 h fast starting the evening of 13 March 2027 makes 14 March the fast day', () => {
    expect(fastDay({ started_at: '2027-03-14T02:00:00.000Z', ended_at: null }, 24)).toBe('2027-03-14')
  })

  test('a fast ended after 11 h 59 min of a 24 h plan (under half) makes no fast day; 12 h does', () => {
    expect(fastDay({ started_at: '2026-10-05T18:00:00.000Z', ended_at: '2026-10-06T05:59:00.000Z' }, 24)).toBeNull()
    expect(fastDay({ started_at: '2026-10-05T18:00:00.000Z', ended_at: '2026-10-06T06:00:00.000Z' }, 24)).toBe('2026-10-05')
  })
})

describe('meanPlannedIntake', () => {
  test('fast days enter as 0 kcal: 26 days at 1,400 and 2 fast days average 1,300 kcal', () => {
    const days = [...Array.from({ length: 26 }, () => ({ kcal: 1400, is_fast_day: false })), { kcal: 0, is_fast_day: true }, { kcal: 1400, is_fast_day: true }]
    expect(meanPlannedIntake(days)).toBe(1300)
    expect(meanPlannedIntake([])).toBeNull()
  })
})
