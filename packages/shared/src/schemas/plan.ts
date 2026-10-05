// Owns: targets (plan-version defaults + per-weekday overrides, and the materialised daily targets), the forecast,
// plan versions with their diff, plan changes (field/from/to/reason), the guards' verdicts on them (rejected,
// scheduled later steps) and what a proposal proposes.
import * as z from 'zod'
import { Actor, byWeekday, Count, Id, Kcal, LocalDate, LocalTime, Ml, Row, Weekday } from './common'
import { Nutrients } from './nutrition'
import { ClockReminder } from './push'
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

/** A plan change the guards dropped: the rail it broke (the engine's GuardRule, e.g. "calorie_floor") and why. */
export const RejectedPlanChange = z.object({ change: PlanChange, rule: z.string(), reason: z.string() })
export type RejectedPlanChange = z.infer<typeof RejectedPlanChange>

/**
 * A later step of a kcal move larger than 150 (ai/mcp): stored as its own pending proposal (`proposal_id`) that becomes
 * due on `due`, `week_offset` weeks after the first step.
 */
export const ScheduledPlanChange = z.object({
  change: PlanChange,
  week_offset: z.number().int().positive(),
  due: LocalDate,
  proposal_id: Id,
})
export type ScheduledPlanChange = z.infer<typeof ScheduledPlanChange>

/** The guards' verdicts on a batch of plan changes beside what applied (absent on older records: empty). */
const Verdicts = {
  rejected: z.array(RejectedPlanChange).default([]),
  scheduled: z.array(ScheduledPlanChange).default([]),
}

/**
 * Append-only snapshot of the targets. Exactly one is active; revert = a new version copying an older one.
 * `rejected` / `scheduled`: what the guards dropped or split off when the changes behind this version were applied.
 */
export const PlanVersion = Row.extend({
  version: z.number().int().positive(),
  active: z.boolean(),
  created_by: Actor,
  reason: z.string(),
  diff: PlanDiff,
  targets: PlanTargets,
  forecast: Forecast.nullable(),
  ...Verdicts,
})
export type PlanVersion = z.infer<typeof PlanVersion>

export const ProposalStatus = z.enum(['pending', 'accepted', 'rejected', 'auto_applied'])
export type ProposalStatus = z.infer<typeof ProposalStatus>

/**
 * What a proposal proposes. Accepting a plan change creates a plan version (its `rejected` / `scheduled` are the guards'
 * verdicts when it was proposed); a workout becomes a template/session; a week plan becomes the week's active plan.
 */
export const ProposalBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan_change'), changes: z.array(PlanChange).min(1), ...Verdicts }),
  z.object({
    kind: z.literal('workout'),
    mode: z.enum(['generate', 'fill']),
    date: LocalDate.nullable(),
    workout: WorkoutDraft,
    /** Computed by the engine from the draft. */
    muscle_scores: MuscleScores,
  }),
  z.object({ kind: z.literal('week_plan'), week_plan_id: Id }),
  /** Safe list (SPEC §9): move a clock reminder (weigh-in, workout, scan due) to a new Edmonton time. */
  z.object({ kind: z.literal('reminder_time'), reminder: ClockReminder, time: LocalTime }),
  /** Safe list (SPEC §9): swap one exercise of a template for another with the same primary muscle (allowed set only). */
  z.object({
    kind: z.literal('template_swap'),
    template_id: Id,
    template_name: z.string(),
    from_exercise_id: Id,
    from_name: z.string(),
    to_exercise_id: Id,
    to_name: z.string(),
  }),
])
export type ProposalBody = z.infer<typeof ProposalBody>

/** What a safe-list change did: applied now, stored as a proposal waiting for a tap, or dropped by a guard. */
export const SafeChangeStatus = z.enum(['applied', 'proposed', 'rejected'])
export type SafeChangeStatus = z.infer<typeof SafeChangeStatus>
