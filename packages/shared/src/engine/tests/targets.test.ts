// Owns: seam tests for materialiseTargets (SPEC §5, §6, §8) — which days are training days under a week plan.
import { describe, expect, test } from 'vitest'
import { fastDay, materialiseTargets, type TargetsInput, type WeekPlanLike } from '../index'

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
