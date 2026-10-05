// Owns: AI jobs — the `ai_jobs` row, each job type's payload, and every job output schema from SPEC §9.
// LLM output schemas avoid transforms so they convert to JSON Schema for the providers; the router validates
// every response with JobOutputs[type] before anything is written.
import * as z from 'zod'
import { Count, Fraction, Grams, Id, Instant, JobStatus, LocalDate, Row } from './common'
import { ChatMessage } from './chat'
import { MilestoneKind } from './body'
import { FoodSource, Nutrients, Remaining } from './nutrition'
import { Forecast, PlanChange } from './plan'
import { ScanExtractOutput, ScanFlag } from './scans'
import { TemplateExerciseInput, WorkoutDraft } from './training'
import { WeekPlanContentInput } from './week-plan'

export const JobType = z.enum([
  'meal_analysis',
  'day_adjustment',
  'workout_generate',
  'workout_fill',
  'scan_extract',
  'scan_analysis',
  'weekly_review',
  'ask_ai',
  'plan_reforecast',
])
export type JobType = z.infer<typeof JobType>

// ── Outputs ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * meal_analysis: the foods in a text/photo meal. `name` carries the cooking state ("white rice, cooked") and a brand as
 * printed ("Oikos Pro greek yogurt"); `grams` is the edible weight as eaten; `confidence` covers the food and the grams;
 * `candidates` are database foods the model is sure of (USDA fdcId, OFF barcode); `estimate` is nutrition PER 100 g,
 * used only when no database food matches (the item is then `estimated`).
 */
export const MealAnalysisOutput = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        grams: Grams.positive(),
        confidence: Fraction,
        candidates: z.array(z.object({ source: FoodSource, source_id: z.string().min(1) })).max(5),
        estimate: Nutrients.nullable(),
      }),
    )
    .max(30),
  notes: z.string().max(500),
})
export type MealAnalysisOutput = z.infer<typeof MealAnalysisOutput>

/** day_adjustment: what is left, protein status, and two or three next-meal suggestions (a favourite or a description). */
export const DayAdjustmentOutput = z.object({
  remaining: Remaining,
  status: z.enum(['ok', 'over', 'protein_short']),
  suggestions: z
    .array(
      z
        .object({
          favorite_id: Id.nullable(),
          description: z.string().max(200).nullable(),
          grams: Grams.positive(),
          why: z.string().max(200),
        })
        .refine((s) => s.favorite_id !== null || s.description !== null, {
          message: 'A suggestion needs favorite_id or description',
        }),
    )
    .max(3),
  note: z.string().max(300),
})
export type DayAdjustmentOutput = z.infer<typeof DayAdjustmentOutput>

/**
 * What the LLM writes for a day_adjustment card: one short reason per suggestion (in order) and the one-line note. The
 * numbers (remaining, status) and the suggestions themselves are computed in code; the card is written without this
 * text when no provider answers.
 */
export const DayAdjustmentWording = z.object({
  why: z.array(z.string().max(200)).max(3),
  note: z.string().max(300),
})
export type DayAdjustmentWording = z.infer<typeof DayAdjustmentWording>

/** scan_analysis: narrative over the engine's comparison with the previous scan and the baseline. Signed kg changes. */
export const ScanAnalysisOutput = z.object({
  narrative: z.string().max(3000),
  fat_vs_lean: z.object({ fat_kg: z.number(), lean_kg: z.number(), water_kg: z.number() }),
  flags: z.array(ScanFlag),
  milestone_updates: z.array(z.object({ milestone_id: Id, kind: MilestoneKind, reached_on: LocalDate })),
  proposals: z.array(PlanChange).max(5),
})
export type ScanAnalysisOutput = z.infer<typeof ScanAnalysisOutput>

/**
 * weekly_review (Gemini draft when no Claude review ran): narrative, highlights, concerns, proposals, next week's plan.
 * The plan is the proposer's shape (WeekPlanContentInput): muscle scores are the engine's, never asked of the LLM.
 */
export const WeeklyReviewOutput = z.object({
  narrative: z.string().max(4000),
  highlights: z.array(z.string().max(300)).max(8),
  concerns: z.array(z.string().max(300)).max(8),
  proposals: z.array(PlanChange).max(5),
  week_plan: WeekPlanContentInput,
})
export type WeeklyReviewOutput = z.infer<typeof WeeklyReviewOutput>

/** ask_ai: the messages the function-calling loop appended to the thread (tool calls and the reply). */
export const AskAiOutput = z.object({ messages: z.array(ChatMessage) })
export type AskAiOutput = z.infer<typeof AskAiOutput>

/** Output schema per job type (the value stored in `ai_jobs.result`). plan_reforecast is engine-only. */
export const JobOutputs = {
  meal_analysis: MealAnalysisOutput,
  day_adjustment: DayAdjustmentOutput,
  workout_generate: WorkoutDraft,
  workout_fill: WorkoutDraft,
  scan_extract: ScanExtractOutput,
  scan_analysis: ScanAnalysisOutput,
  weekly_review: WeeklyReviewOutput,
  ask_ai: AskAiOutput,
  plan_reforecast: Forecast,
} as const satisfies Record<JobType, z.ZodType>
export type JobOutput<T extends JobType> = z.infer<(typeof JobOutputs)[T]>

// ── Payloads ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Payload schema per job type (`ai_jobs.payload`): ids and dates only; the job reads the rest at run time. */
export const JobPayloads = {
  meal_analysis: z.object({ meal_id: Id }),
  day_adjustment: z.object({
    date: LocalDate,
    trigger: z.enum(['meal_confirmed', 'fast_started']),
    meal_id: Id.nullable(),
    fast_id: Id.nullable(),
  }),
  workout_generate: z.object({ date: LocalDate, focus: z.string().max(200).nullable() }),
  workout_fill: z.object({ date: LocalDate, exercises: z.array(TemplateExerciseInput).min(1) }),
  scan_extract: z.object({ scan_id: Id }),
  scan_analysis: z.object({ scan_id: Id }),
  weekly_review: z.object({ week_start: LocalDate }),
  ask_ai: z.object({ thread_id: Id, message_id: Id }),
  plan_reforecast: z.object({ date: LocalDate }),
} as const satisfies Record<JobType, z.ZodType>
export type JobPayload<T extends JobType> = z.infer<(typeof JobPayloads)[T]>

// ── Row ────────────────────────────────────────────────────────────────────────────────────────────────────────

const JobFields = Row.extend({
  status: JobStatus,
  provider: z.string().nullable(),
  model: z.string().nullable(),
  attempts: Count,
  error: z.string().nullable(),
  latency_ms: Count.nullable(),
  tokens_in: Count.nullable(),
  tokens_out: Count.nullable(),
  run_after: Instant,
  /** A running job past its lease is requeued by the 5-minute sweep. */
  lease_until: Instant.nullable(),
})

function jobRow<T extends JobType>(type: T) {
  // z.nullable(…) rather than .nullable() keeps the result schema indexed by T, so `type` narrows `result`.
  return JobFields.extend({ type: z.literal(type), payload: JobPayloads[type], result: z.nullable(JobOutputs[type]) })
}

/** An `ai_jobs` row (the queue and the audit trail), typed by job type. GET /api/jobs/:id returns it. */
export const AiJob = z.discriminatedUnion('type', [
  jobRow('meal_analysis'),
  jobRow('day_adjustment'),
  jobRow('workout_generate'),
  jobRow('workout_fill'),
  jobRow('scan_extract'),
  jobRow('scan_analysis'),
  jobRow('weekly_review'),
  jobRow('ask_ai'),
  jobRow('plan_reforecast'),
])
export type AiJob = z.infer<typeof AiJob>

/** Response of an endpoint that starts a job. */
export const JobRef = z.object({ job_id: Id })
export type JobRef = z.infer<typeof JobRef>
