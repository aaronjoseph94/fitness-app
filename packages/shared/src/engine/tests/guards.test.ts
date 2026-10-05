// Owns: seam tests for the guards (SPEC §9 guardrails) — rails from CLAUDE.md: floor 1,400, ceiling 1,700, protein
// ≥ 130 g, fat ≥ 45 g, ≤150 kcal per proposal (over a rolling 7 days), 12–28 sets, allowed exercise set only, and
// macros that never imply more energy than the day's kcal (carbs are the remainder).
import { describe, expect, test } from 'vitest'
import { applyGuards, type GuardContext } from '../guards'

const ctx: GuardContext = {
  actor: 'ai',
  rails: { calorie_floor: 1400, calorie_ceiling: 1700, protein_min_g: 130, fat_min_g: 45, fasts_per_month: 2 },
  plan: {
    defaults: { kcal: 1400, protein_g: 130, carbs_g: 119, fat_g: 45, fibre_g: 30, water_ml: 3000, steps: 8000 },
    overrides: {},
  },
  exercises: [
    { id: 'bench', category: 'strength', equipment: 'dumbbell', primary_muscles: ['chest'], secondary_muscles: ['triceps'], allowed: true },
    { id: 'press', category: 'strength', equipment: 'machine', primary_muscles: ['shoulders'], secondary_muscles: [], allowed: true },
    { id: 'pushup', category: 'strength', equipment: 'body only', primary_muscles: ['chest'], secondary_muscles: [], allowed: false },
    { id: 'fly', category: 'strength', equipment: 'machine', primary_muscles: ['chest'], secondary_muscles: [], allowed: true },
  ],
  excluded_categories: ['body only'],
  planned_fast_dates: [],
  auto_apply_safe: false,
}

const kcal = (from: number, to: number, weekday: 'mon' | null = null) => ({ kind: 'target' as const, field: 'kcal' as const, weekday, from, to })
const at1550 = { ...ctx.plan, defaults: { ...ctx.plan.defaults, kcal: 1550 } }

describe('guards', () => {
  test('rejects a proposal below the 1,400 kcal floor', () => {
    const change = kcal(1400, 1350)
    const result = applyGuards([change], ctx)

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ change, rule: 'calorie_floor', reason: expect.any(String) }])
  })

  test('splits a +300 kcal move into +150 now and +150 the week after', () => {
    const change = kcal(1400, 1700)
    const result = applyGuards([change], ctx)

    expect(result.rejected).toEqual([])
    expect(result.accepted).toEqual([{ change: { ...change, from: 1400, to: 1550 }, auto_apply: false }])
    expect(result.scheduled).toEqual([{ change: { ...change, from: 1550, to: 1700 }, week_offset: 1 }])
  })

  test('rejects a negative water target and fractional steps (they would break TargetValues)', () => {
    const water = { kind: 'target' as const, field: 'water_ml' as const, weekday: null, from: 3000, to: -500 }
    const steps = { kind: 'target' as const, field: 'steps' as const, weekday: 'mon' as const, from: 8000, to: 7500.5 }
    const result = applyGuards([water, steps], ctx)

    expect(result.accepted).toEqual([])
    expect(result.rejected.map((r) => r.rule)).toEqual(['target_range', 'target_range'])
  })

  test('rejects a carbs_g change: carbs are the remainder of kcal after protein and fat', () => {
    const change = { kind: 'target' as const, field: 'carbs_g' as const, weekday: null, from: 119, to: 160 }
    const result = applyGuards([change], { ...ctx, actor: 'mcp' })

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ change, rule: 'carbs_remainder', reason: expect.any(String) }])
  })

  test('rejects a workout that uses an exercise from an excluded category', () => {
    const workout = {
      kind: 'workout' as const,
      exercises: [
        { exercise_id: 'bench', sets: 4 },
        { exercise_id: 'press', sets: 4 },
        { exercise_id: 'pushup', sets: 4 },
      ],
    }
    const result = applyGuards([workout], ctx)

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ change: workout, rule: 'excluded_category', reason: expect.stringContaining('body only') }])
  })
})

describe('guards: kcal floor and ceiling boundaries (ai/mcp)', () => {
  test('1,400 kcal (the floor) passes; 1,399 is calorie_floor', () => {
    const mcp = { ...ctx, actor: 'mcp' as const, plan: at1550 }
    expect(applyGuards([kcal(1550, 1400)], mcp).accepted.map((a) => a.change.to)).toEqual([1400])
    expect(applyGuards([kcal(1550, 1399)], mcp).rejected.map((r) => r.rule)).toEqual(['calorie_floor'])
  })

  test('1,700 kcal (the ceiling) passes; 1,701 is calorie_ceiling', () => {
    const mcp = { ...ctx, actor: 'mcp' as const, plan: at1550 }
    expect(applyGuards([kcal(1550, 1700)], mcp).accepted.map((a) => a.change.to)).toEqual([1700])
    expect(applyGuards([kcal(1550, 1701)], mcp).rejected.map((r) => r.rule)).toEqual(['calorie_ceiling'])
  })
})

describe('guards: macros never imply more energy than the kcal target', () => {
  test('fat 45 → 200 g at 1,400 kcal is macro_energy (130 × 4 + 200 × 9 = 2,320 kcal > 1,400)', () => {
    const change = { kind: 'target' as const, field: 'fat_g' as const, weekday: null, from: 45, to: 200 }
    const result = applyGuards([change], { ...ctx, actor: 'mcp' })

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([{ change, rule: 'macro_energy', reason: expect.stringContaining('2320') }])
  })

  test('protein 130 → 150 g at 1,400 kcal passes (150 × 4 + 45 × 9 = 1,005 kcal)', () => {
    const change = { kind: 'target' as const, field: 'protein_g' as const, weekday: null, from: 130, to: 150 }
    const result = applyGuards([change], { ...ctx, actor: 'mcp' })

    expect(result.rejected).toEqual([])
    expect(result.accepted).toEqual([{ change, auto_apply: true }])
  })

  test('a kcal cut is checked against the fat already planned (fat 100 g: 520 + 900 = 1,420 > 1,400)', () => {
    const plan = { defaults: { ...at1550.defaults, fat_g: 100 }, overrides: {} }
    const result = applyGuards([kcal(1550, 1400)], { ...ctx, actor: 'user', plan })

    expect(result.rejected.map((r) => r.rule)).toEqual(['macro_energy'])
  })
})

describe('guards: 150 kcal per step over a rolling 7 days (ai/mcp)', () => {
  test('a second +150 within the week (base 1,400, now 1,550 → 1,700) applies nothing now and is scheduled', () => {
    const result = applyGuards([kcal(1550, 1700)], { ...ctx, actor: 'mcp', plan: at1550, kcal_base: ctx.plan })

    expect(result.accepted).toEqual([])
    expect(result.rejected).toEqual([])
    expect(result.scheduled).toEqual([{ change: kcal(1550, 1700), week_offset: 1 }])
  })

  test('a second −150 within the week (base 1,700, now 1,550 → 1,400) applies nothing now and is scheduled', () => {
    const base = { ...ctx.plan, defaults: { ...ctx.plan.defaults, kcal: 1700 } }
    const result = applyGuards([kcal(1550, 1400)], { ...ctx, actor: 'mcp', plan: at1550, kcal_base: base })

    expect(result.accepted).toEqual([])
    expect(result.scheduled).toEqual([{ change: kcal(1550, 1400), week_offset: 1 }])
  })

  test('moving back toward the week-old value is not limited by the window (base 1,400, now 1,550 → 1,400)', () => {
    const result = applyGuards([kcal(1550, 1400)], { ...ctx, actor: 'mcp', plan: at1550, kcal_base: ctx.plan })

    expect(result.accepted.map((a) => a.change)).toEqual([kcal(1550, 1400)])
  })

  test('accepting a stored step never schedules another: what does not fit is kcal_step', () => {
    const result = applyGuards([kcal(1550, 1700)], { ...ctx, actor: 'ai', plan: at1550, kcal_base: ctx.plan, schedule_steps: false })

    expect(result.accepted).toEqual([])
    expect(result.scheduled).toEqual([])
    expect(result.rejected).toEqual([{ change: kcal(1550, 1700), rule: 'kcal_step', reason: expect.any(String) }])
  })

  test('Aaron (user) is not held to the step', () => {
    const result = applyGuards([kcal(1550, 1700)], { ...ctx, actor: 'user', plan: at1550, kcal_base: ctx.plan })

    expect(result.accepted.map((a) => a.change.to)).toEqual([1700])
  })
})

describe('guards: sets per session and the allowed set', () => {
  const workout = (sets: number[]) => ({ kind: 'workout' as const, exercises: sets.map((n, i) => ({ exercise_id: ['bench', 'press', 'fly'][i]!, sets: n })) })

  test('12 and 28 sets pass', () => {
    expect(applyGuards([workout([4, 4, 4]), workout([10, 10, 8])], ctx).rejected).toEqual([])
  })

  test('11 and 29 sets are session_sets', () => {
    expect(applyGuards([workout([4, 4, 3]), workout([10, 10, 9])], ctx).rejected.map((r) => r.rule)).toEqual(['session_sets', 'session_sets'])
  })

  test('an exercise id not in the library is exercise_not_allowed', () => {
    const result = applyGuards([{ kind: 'exercise_swap' as const, from_exercise_id: 'bench', to_exercise_id: 'no-such-id' }], ctx)
    expect(result.rejected.map((r) => r.rule)).toEqual(['exercise_not_allowed'])
  })
})

describe('guards: auto_apply', () => {
  const swap = { kind: 'exercise_swap' as const, from_exercise_id: 'bench', to_exercise_id: 'fly' }
  const reminder = { kind: 'reminder_time' as const }

  test('ai: off unless auto_apply_safe, and then only for safe kinds', () => {
    expect(applyGuards([swap, reminder], ctx).accepted.map((a) => a.auto_apply)).toEqual([false, false])
    const safe = { ...ctx, auto_apply_safe: true }
    expect(applyGuards([swap, reminder, kcal(1400, 1450)], safe).accepted.map((a) => a.auto_apply)).toEqual([true, true, false])
  })

  test('mcp: always (Aaron approves in the Claude chat)', () => {
    expect(applyGuards([kcal(1400, 1450), swap], { ...ctx, actor: 'mcp' }).accepted.map((a) => a.auto_apply)).toEqual([true, true])
  })
})
