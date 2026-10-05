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
  /**
   * The plan ai/mcp kcal moves are measured from over a rolling 7 days: the version active a week ago, or Aaron's own
   * newer kcal edit. Absent: the active plan (the 150 kcal step then holds within this batch only).
   */
  kcal_base?: PlanTargetsLike
  /**
   * false when accepting a stored step: a kcal move that does not fit now is cut to what fits and the rest dropped as
   * `kcal_step`, never scheduled again (it would re-split from a stale base). Default true.
   */
  schedule_steps?: boolean
}

export type GuardRule =
  | 'target_range'
  | 'carbs_remainder'
  | 'calorie_floor'
  | 'calorie_ceiling'
  | 'protein_min'
  | 'fat_min'
  | 'macro_energy'
  | 'kcal_step'
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

type Rejection = { ok: false; rule: GuardRule; reason: string }
/** `change` null: nothing applies now (a kcal move whose first step waits for the rolling window). */
type Verdict<C> = { ok: true; change: C | null; later?: C[]; rest?: { change: C; rule: GuardRule; reason: string } } | Rejection

/**
 * Check a batch against the rails, change by change in batch order:
 *   target range:      `to` is a valid value of its field in `TargetValues` (finite, ≥ 0, whole ml and steps, ≤ the
 *                      unit's sanity maximum), so an applied change always parses as a plan version
 *   target carbs_g:    always rejected — carbs = (kcal − protein × 4 − fat × 9) / 4 is the remainder (materialiseTargets)
 *   target kcal:       calorie_floor ≤ to ≤ calorie_ceiling
 *   target protein_g:  to ≥ protein_min_g;   target fat_g: to ≥ fat_min_g
 *   targets:           one change per (field, weekday) per batch; `from` is re-read from ctx.plan (with the batch's
 *                      earlier accepted changes applied)
 *   macro energy:      on every weekday the change reaches, with the rails applied (kcal ≥ floor, protein ≥ min,
 *                      fat ≥ min): protein × 4 + fat × 9 ≤ kcal — carbs, the remainder, never go negative
 *   ai/mcp kcal moves: f = from, t = to, b = kcal_base's value (default f), the value a week ago. Now the move may end at
 *                        t > f: min(t, f + 150, max(f, b + 150));   t < f: max(t, f − 150, min(f, b − 150))
 *                      (≤ 150 per proposal, and ≤ 150 away from b over the rolling 7 days; back toward b is free).
 *                      The rest becomes steps of ≤ 150 from where the move ends now, a week apart (week_offset 1, 2, …;
 *                      when nothing applies now the first step is the whole change's first 150), or with
 *                      schedule_steps false it is dropped as `kcal_step`
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
    plan: { defaults: { ...ctx.plan.defaults }, overrides: { ...ctx.plan.overrides } },
  }

  for (const change of batch) {
    const verdict = check(change, ctx, state)
    if (!verdict.ok) {
      result.rejected.push({ change, rule: verdict.rule, reason: verdict.reason })
      continue
    }
    if (verdict.change) result.accepted.push({ change: verdict.change, auto_apply: mayAutoApply(change, ctx, state) })
    verdict.later?.forEach((step, i) => result.scheduled.push({ change: step, week_offset: i + 1 }))
    if (verdict.rest) result.rejected.push(verdict.rest)
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
  /** ctx.plan with the batch's accepted target changes applied so far. */
  plan: PlanTargetsLike
}

function check<C extends GuardChange>(change: C, ctx: GuardContext, state: BatchState): Verdict<C> {
  switch (change.kind) {
    case 'target':
      return checkTarget(change as C & TargetChange, ctx, state)
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

function checkExercise(id: string, state: BatchState): Rejection | null {
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

function checkTarget<C extends GuardChange>(change: C & TargetChange, ctx: GuardContext, state: BatchState): Verdict<C> {
  const { field, weekday, to } = change
  const { rails } = ctx
  const key = `${field}:${weekday ?? 'all'}`
  if (state.targets.has(key)) return reject('duplicate_target', `${label(change)} is already changed in this batch`)
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

  const from = targetValue(state.plan, field, weekday)
  const stepped = field === 'kcal' && ctx.actor !== 'user'
  const now = stepped ? kcalNow(from, to, ctx.kcal_base ? targetValue(ctx.kcal_base, 'kcal', weekday) : from) : to
  const moves = now !== from || to === from
  if (moves) {
    const over = macroOverflow(state.plan, { field, weekday, to: now }, rails)
    if (over) return reject('macro_energy', `${label(change)} ${now}: ${over}; carbs, the remainder, would go negative`)
  }
  state.targets.add(key)
  if (moves) setTarget(state.plan, field, weekday, now)
  const accepted = moves ? { ...change, from, to: now } : null
  if (now === to) return { ok: true, change: accepted }

  const steps: C[] = []
  for (let s = now; s !== to; ) {
    const next = to > s ? Math.min(to, s + KCAL_STEP) : Math.max(to, s - KCAL_STEP)
    steps.push({ ...change, from: s, to: next })
    s = next
  }
  if (ctx.schedule_steps === false)
    return {
      ok: true,
      change: accepted,
      rest: {
        change: { ...change, from: now, to },
        rule: 'kcal_step',
        reason: `${label(change)} ${now} → ${to} moves more than ${KCAL_STEP} kcal within 7 days; it can follow once the week has passed`,
      },
    }
  return { ok: true, change: accepted, later: steps }
}

/**
 * Where an ai/mcp kcal move from f toward t may end now, given b (the value a week ago):
 *   t > f: min(t, f + 150, max(f, b + 150));   t < f: max(t, f − 150, min(f, b − 150))
 */
function kcalNow(f: number, t: number, b: number): number {
  if (t > f) return Math.min(t, f + KCAL_STEP, Math.max(f, b + KCAL_STEP))
  if (t < f) return Math.max(t, f - KCAL_STEP, Math.min(f, b - KCAL_STEP))
  return t
}

function setTarget(plan: PlanTargetsLike, field: TargetField, weekday: Weekday | null, value: number): void {
  if (weekday === null) plan.defaults = { ...plan.defaults, [field]: value }
  else plan.overrides = { ...plan.overrides, [weekday]: { ...plan.overrides[weekday], [field]: value } }
}

/**
 * The first weekday the change reaches (weekday w, or every weekday without its own override of the field) whose
 * macros would overflow its energy with the rails applied: max(protein, min) × 4 + max(fat, min) × 9 > max(kcal, floor).
 * Null when every reached day fits.
 */
function macroOverflow(
  plan: PlanTargetsLike,
  change: { field: TargetField; weekday: Weekday | null; to: number },
  rails: GuardRails,
): string | null {
  if (change.field !== 'kcal' && change.field !== 'protein_g' && change.field !== 'fat_g') return null
  const next: PlanTargetsLike = { defaults: plan.defaults, overrides: plan.overrides }
  setTarget(next, change.field, change.weekday, change.to)
  const days = change.weekday ? [change.weekday] : WEEKDAYS.filter((w) => plan.overrides[w]?.[change.field] === undefined)
  for (const w of days) {
    const kcal = Math.max(targetValue(next, 'kcal', w), rails.calorie_floor)
    const protein = Math.max(targetValue(next, 'protein_g', w), rails.protein_min_g)
    const fat = Math.max(targetValue(next, 'fat_g', w), rails.fat_min_g)
    if (protein * 4 + fat * 9 > kcal) {
      const energy = Math.round(protein * 4 + fat * 9)
      return `protein ${protein} g × 4 + fat ${fat} g × 9 = ${energy} kcal is more than the ${kcal} kcal target on ${w}`
    }
  }
  return null
}

const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

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

function reject(rule: GuardRule, reason: string): Rejection {
  return { ok: false, rule, reason }
}
