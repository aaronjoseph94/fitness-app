// Owns: the guardrails (SPEC §9) — every change an LLM or MCP proposes passes applyGuards before it touches the
// database. A change that breaks a rail is dropped and reported with its rule; the rest of the batch applies.
import type { Actor, LocalDate, Weekday } from '../schemas/common'
import { TargetValues } from '../schemas/plan'
import { Rails, type Settings } from '../schemas/profile-settings'
import type { ExerciseInfo, PlanTargetsLike, TargetField } from './lib/types'

/** Largest move of daily kcal one proposal may make (SPEC §9); larger moves are split across weeks. */
export const KCAL_STEP = 150
/** Working sets per session (SPEC §9). */
export const SESSION_SETS = { min: 12, max: 28 } as const
/**
 * `settings` fields only Aaron may change: every `Rails` field, and the switch that lets AI changes apply without a
 * tap. Derived from the schema, so a new rail is locked and a renamed one fails typecheck. Typed as plain strings
 * because callers test arbitrary patch keys against it (settings updateSettings).
 */
export const LOCKED_SETTINGS: readonly string[] = [
  ...Rails.keyof().options,
  'auto_apply_safe',
] satisfies readonly (keyof Settings)[]

// ── Changes the guards understand ──────────────────────────────────────────────────────────────────────────────

/** Move one target for every day (`weekday: null`) or one weekday's override. Structurally a `PlanChange` + kind. */
export type TargetChange = { kind: 'target'; field: TargetField; weekday: Weekday | null; from: number; to: number }

/** A template, week-plan session or workout draft: the exercises and their set counts. */
export type WorkoutChange = { kind: 'workout'; exercises: readonly { exercise_id: string; sets: number }[] }

/** Replace one exercise with another. */
export type ExerciseSwapChange = { kind: 'exercise_swap'; from_exercise_id: string; to_exercise_id: string }

/** Plan a fast on a date. */
export type FastChange = { kind: 'fast'; date: LocalDate }

/** Changes no rail limits; both are on the auto-apply safe list (SPEC §9). */
export type OpenChange = { kind: 'meal_suggestion' | 'reminder_time' }

export type GuardChange = TargetChange | WorkoutChange | ExerciseSwapChange | FastChange | OpenChange

// ── Context and result ─────────────────────────────────────────────────────────────────────────────────────────

/** The rails from `settings` the guards check (every rail but the fast length). */
export type GuardRails = Omit<Rails, 'fast_hours'>

export type GuardContext = {
  /** Who proposes the batch. */
  actor: Actor
  rails: GuardRails
  /** The active plan version's targets. A target change's `from` is re-read from here (the proposer's is ignored). */
  plan: PlanTargetsLike
  /** The exercise library with each exercise's `allowed` flag. An id not listed here is not allowed. */
  exercises: readonly ExerciseInfo[]
  /** Hard-excluded categories ("body only", "floor"), matched against an exercise's category and equipment. */
  excluded_categories: readonly string[]
  /** Fast dates already planned (any months the batch may touch). */
  planned_fast_dates: readonly LocalDate[]
  /** settings.auto_apply_safe. */
  auto_apply_safe: boolean
}

export type GuardRule =
  | 'target_range'
  | 'carbs_remainder'
  | 'calorie_floor'
  | 'calorie_ceiling'
  | 'protein_min'
  | 'fat_min'
  | 'duplicate_target'
  | 'exercise_not_allowed'
  | 'excluded_category'
  | 'session_sets'
  | 'fasting_pattern'

export type GuardResult<C extends GuardChange> = {
  /** Changes that pass, in batch order. `auto_apply` = may apply without a tap in the app. */
  accepted: { change: C; auto_apply: boolean }[]
  /** Changes dropped, with the rail they break. */
  rejected: { change: C; rule: GuardRule; reason: string }[]
  /** Later steps of a kcal move split into ≤150 kcal steps: propose step n in week `week_offset` = n − 1 (n ≥ 2). */
  scheduled: { change: C; week_offset: number }[]
}

type Verdict<C> = { ok: true; change: C; later?: C[] } | { ok: false; rule: GuardRule; reason: string }

/**
 * Check a batch against the rails, change by change in batch order:
 *   target range:      `to` is a valid value of its field in `TargetValues` (finite, ≥ 0, whole ml and steps, ≤ the
 *                      unit's sanity maximum), so an applied change always parses as a plan version
 *   target carbs_g:    always rejected — carbs = (kcal − protein × 4 − fat × 9) / 4 is the remainder (materialiseTargets)
 *   target kcal:       calorie_floor ≤ to ≤ calorie_ceiling
 *   target protein_g:  to ≥ protein_min_g;   target fat_g: to ≥ fat_min_g
 *   targets:           one change per (field, weekday) per batch; `from` is re-read from ctx.plan
 *   ai/mcp kcal moves: |to − from| ≤ 150 now; a larger move becomes ⌈|Δ| / 150⌉ steps, step n ending at
 *                      from + sign(Δ) × min(150 × n, |Δ|); step 1 is accepted, steps 2… are scheduled a week apart
 *   workout:           every exercise in the allowed set and in no excluded category; 12 ≤ Σ sets ≤ 28
 *   exercise_swap:     the new exercise in the allowed set and in no excluded category
 *   fast:              planned fasts in that calendar month ≤ fasts_per_month
 * (The settings rails are locked outside the guards: updateSettings refuses LOCKED_SETTINGS to any actor but `user`.)
 * auto_apply (may apply without a tap in the app):
 *   user → true; mcp → true (Aaron approves in the Claude chat; still versioned and guarded);
 *   ai   → auto_apply_safe ∧ kind ∈ {meal_suggestion, reminder_time, exercise_swap sharing a primary muscle}
 */
export function applyGuards<C extends GuardChange>(batch: readonly C[], ctx: GuardContext): GuardResult<C> {
  const result: GuardResult<C> = { accepted: [], rejected: [], scheduled: [] }
  const state: BatchState = {
    exercises: new Map(ctx.exercises.map((e) => [e.id, e])),
    excluded: new Set(ctx.excluded_categories.map((c) => c.toLowerCase())),
    targets: new Set(),
    fasts: new Set(ctx.planned_fast_dates),
  }

  for (const change of batch) {
    const verdict = check(change, ctx, state)
    if (!verdict.ok) {
      result.rejected.push({ change, rule: verdict.rule, reason: verdict.reason })
      continue
    }
    result.accepted.push({ change: verdict.change, auto_apply: mayAutoApply(change, ctx, state) })
    verdict.later?.forEach((step, i) => result.scheduled.push({ change: step, week_offset: i + 1 }))
  }
  return result
}

/** What earlier changes in the batch have claimed, plus lookups built once per batch. */
type BatchState = {
  exercises: Map<string, ExerciseInfo>
  excluded: Set<string>
  /** (field, weekday) keys already changed. */
  targets: Set<string>
  /** Planned fast dates, including ones accepted earlier in the batch. */
  fasts: Set<LocalDate>
}

function check<C extends GuardChange>(change: C, ctx: GuardContext, state: BatchState): Verdict<C> {
  switch (change.kind) {
    case 'target':
      return checkTarget(change as C & TargetChange, ctx, state.targets)
    case 'workout': {
      const workout = change as C & WorkoutChange
      for (const { exercise_id } of workout.exercises) {
        const bad = checkExercise(exercise_id, state)
        if (bad) return bad
      }
      const sets = workout.exercises.reduce((n, e) => n + e.sets, 0)
      if (sets < SESSION_SETS.min || sets > SESSION_SETS.max)
        return reject('session_sets', `${sets} sets; a session has ${SESSION_SETS.min}–${SESSION_SETS.max}`)
      return { ok: true, change }
    }
    case 'exercise_swap':
      return checkExercise((change as C & ExerciseSwapChange).to_exercise_id, state) ?? { ok: true, change }
    case 'fast': {
      const { date } = change as C & FastChange
      const month = date.slice(0, 7)
      const inMonth = [...state.fasts].filter((d) => d.slice(0, 7) === month && d !== date).length + 1
      if (inMonth > ctx.rails.fasts_per_month)
        return reject('fasting_pattern', `${month} would have ${inMonth} planned fasts; the pattern is ${ctx.rails.fasts_per_month} a month`)
      state.fasts.add(date)
      return { ok: true, change }
    }
    default:
      return { ok: true, change }
  }
}

function checkExercise(id: string, state: BatchState): { ok: false; rule: GuardRule; reason: string } | null {
  const exercise = state.exercises.get(id)
  if (!exercise) return reject('exercise_not_allowed', `Exercise ${id} is not in the library`)
  const category = [exercise.category, exercise.equipment].find((c) => c !== null && state.excluded.has(c.toLowerCase()))
  if (category) return reject('excluded_category', `Exercise ${id} is in the excluded category "${category}"`)
  if (!exercise.allowed) return reject('exercise_not_allowed', `Exercise ${id} is not in the allowed exercise set`)
  return null
}

function mayAutoApply(change: GuardChange, ctx: GuardContext, state: BatchState): boolean {
  if (ctx.actor !== 'ai') return true
  if (!ctx.auto_apply_safe) return false
  if (change.kind === 'meal_suggestion' || change.kind === 'reminder_time') return true
  if (change.kind !== 'exercise_swap') return false
  const from = state.exercises.get(change.from_exercise_id)?.primary_muscles ?? []
  const to = state.exercises.get(change.to_exercise_id)?.primary_muscles ?? []
  return from.some((m) => to.includes(m))
}

function checkTarget<C extends GuardChange>(change: C & TargetChange, ctx: GuardContext, seen: Set<string>): Verdict<C> {
  const { field, weekday, to } = change
  const { rails } = ctx
  const key = `${field}:${weekday ?? 'all'}`
  if (seen.has(key)) return reject('duplicate_target', `${label(change)} is already changed in this batch`)
  if (field === 'carbs_g')
    return reject('carbs_remainder', 'Carbs are the remainder of kcal after protein and fat; move kcal, protein_g or fat_g instead')
  if (!TargetValues.shape[field].safeParse(to).success)
    return reject('target_range', `${label(change)} ${to} is not a valid ${field}`)
  if (field === 'kcal' && to < rails.calorie_floor)
    return reject('calorie_floor', `${label(change)} ${to} kcal is below the ${rails.calorie_floor} kcal floor`)
  if (field === 'kcal' && to > rails.calorie_ceiling)
    return reject('calorie_ceiling', `${label(change)} ${to} kcal is above the ${rails.calorie_ceiling} kcal ceiling`)
  if (field === 'protein_g' && to < rails.protein_min_g)
    return reject('protein_min', `${label(change)} ${to} g is below the ${rails.protein_min_g} g protein minimum`)
  if (field === 'fat_g' && to < rails.fat_min_g)
    return reject('fat_min', `${label(change)} ${to} g is below the ${rails.fat_min_g} g fat minimum`)
  seen.add(key)
  const from = targetValue(ctx.plan, field, weekday)
  if (field !== 'kcal' || ctx.actor === 'user' || Math.abs(to - from) <= KCAL_STEP) return { ok: true, change: { ...change, from } }

  const delta = to - from
  const steps: C[] = []
  for (let n = 1; n <= Math.ceil(Math.abs(delta) / KCAL_STEP); n++) {
    const stepFrom = from + Math.sign(delta) * KCAL_STEP * (n - 1)
    const stepTo = from + Math.sign(delta) * Math.min(KCAL_STEP * n, Math.abs(delta))
    steps.push({ ...change, from: stepFrom, to: stepTo })
  }
  return { ok: true, change: steps[0]!, later: steps.slice(1) }
}

/**
 * The value a target has in a plan: value(f, w) = overrides[w]?.[f] ?? defaults[f]  (w = null → defaults[f]).
 * The `from` of every target change (PlanChange) is read with this.
 */
export function targetValue(plan: PlanTargetsLike, field: TargetField, weekday: Weekday | null): number {
  return (weekday === null ? undefined : plan.overrides[weekday]?.[field]) ?? plan.defaults[field]
}

function label(change: TargetChange): string {
  return change.weekday === null ? `Daily ${change.field}` : `${change.weekday} ${change.field}`
}

function reject(rule: GuardRule, reason: string): { ok: false; rule: GuardRule; reason: string } {
  return { ok: false, rule, reason }
}
