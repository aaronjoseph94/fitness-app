// Owns: targets (plan-version defaults + per-weekday overrides, and the materialised daily targets), the forecast,
// plan versions with their diff, plan changes (field/from/to/reason) and what a proposal proposes.
import * as z from 'zod'
import { Actor, byWeekday, Count, Id, Kcal, LocalDate, Ml, Row, Weekday } from './common'
import { Nutrients } from './nutrition'
import { MuscleScores, WorkoutDraft } from './training'

/** One day's targets: energy and macros, water and steps. */
export const TargetValues = Nutrients.extend({ water_ml: Ml, steps: Count })
export type TargetValues = z.infer<typeof TargetValues>

/** A target a plan change can move. */
export const TargetField = TargetValues.keyof()
export type TargetField = z.infer<typeof TargetField>

/** `plan_versions.targets`: defaults for every day, and per-weekday overrides of any field. */
export const PlanTargets = z.object({
  defaults: TargetValues,
  overrides: byWeekday(TargetValues.partial()).partial(),
})
export type PlanTargets = z.infer<typeof PlanTargets>

/** `daily_targets`: one local date's targets, materialised from the active plan version and the active week plan. */
export const DailyTargets = TargetValues.extend({
  date: LocalDate,
  plan_version_id: Id.nullable(),
  week_plan_id: Id.nullable(),
  is_fast_day: z.boolean(),
  training_planned: z.boolean(),
})
export type DailyTargets = z.infer<typeof DailyTargets>

/**
 * Forecast (SPEC §9): weekly_rate_kg = (tdee_est − target_kcal) × 7 / 7,700; band = weekly_rate_kg × (1 ∓ 0.20);
 * finish_date = when the trend reaches the goal weight at that rate (null when the rate is not a loss).
 */
export const Forecast = z.object({
  finish_date: LocalDate.nullable(),
  weekly_rate_kg: z.number(),
  band: z.object({ low: z.number(), high: z.number() }),
  tdee_est: Kcal,
})
export type Forecast = z.infer<typeof Forecast>

/** A proposed move of one target, for every day (`weekday: null`) or one weekday's override. */
export const PlanChange = z.object({
  field: TargetField,
  weekday: Weekday.nullable(),
  from: z.number(),
  to: z.number(),
  reason: z.string().min(1).max(500),
})
export type PlanChange = z.infer<typeof PlanChange>

/** One line of a plan version's diff; null = the value or override was absent. */
export const PlanDiffEntry = z.object({
  field: TargetField,
  weekday: Weekday.nullable(),
  from: z.number().nullable(),
  to: z.number().nullable(),
})
export const PlanDiff = z.array(PlanDiffEntry)
export type PlanDiff = z.infer<typeof PlanDiff>

/** Append-only snapshot of the targets. Exactly one is active; revert = a new version copying an older one. */
export const PlanVersion = Row.extend({
  version: z.number().int().positive(),
  active: z.boolean(),
  created_by: Actor,
  reason: z.string(),
  diff: PlanDiff,
  targets: PlanTargets,
  forecast: Forecast.nullable(),
})
export type PlanVersion = z.infer<typeof PlanVersion>

export const ProposalStatus = z.enum(['pending', 'accepted', 'rejected', 'auto_applied'])
export type ProposalStatus = z.infer<typeof ProposalStatus>

/** What a proposal proposes. Accepting a plan change creates a plan version; a workout becomes a template/session. */
export const ProposalBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan_change'), changes: z.array(PlanChange).min(1) }),
  z.object({
    kind: z.literal('workout'),
    mode: z.enum(['generate', 'fill']),
    date: LocalDate.nullable(),
    workout: WorkoutDraft,
    /** Computed by the engine from the draft. */
    muscle_scores: MuscleScores,
  }),
  z.object({ kind: z.literal('week_plan'), week_plan_id: Id }),
])
export type ProposalBody = z.infer<typeof ProposalBody>
