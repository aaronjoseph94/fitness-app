// Owns: the exercise library, equipment profile and exclusions, templates, sessions and sets, muscle scores, PRs,
// readiness, progression suggestions, and the workout_generate / workout_fill output (WorkoutDraft).
import * as z from 'zod'
import { Count, Id, Instant, Kg, LocalDate, Muscle, Row } from './common'

// ── Library ────────────────────────────────────────────────────────────────────────────────────────────────────

/** free-exercise-db categories. */
export const ExerciseCategory = z.enum([
  'strength',
  'powerlifting',
  'olympic weightlifting',
  'strongman',
  'plyometrics',
  'stretching',
  'cardio',
])
export type ExerciseCategory = z.infer<typeof ExerciseCategory>

/** free-exercise-db equipment values. Aaron's named machines ("leg press", "pec deck") are plain strings beside these. */
export const LibraryEquipment = z.enum([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebells',
  'bands',
  'e-z curl bar',
  'medicine ball',
  'exercise ball',
  'foam roll',
  'body only',
  'other',
])
export type LibraryEquipment = z.infer<typeof LibraryEquipment>

/** A library equipment value or a named machine. */
export const EquipmentName = z.string().trim().min(1).max(100)

export const Mechanic = z.enum(['compound', 'isolation'])
export const Force = z.enum(['push', 'pull', 'static'])
export const Level = z.enum(['beginner', 'intermediate', 'expert'])

export const Exercise = Row.extend({
  slug: z.string().min(1),
  name: z.string().min(1),
  category: ExerciseCategory,
  equipment: EquipmentName.nullable(),
  mechanic: Mechanic.nullable(),
  force: Force.nullable(),
  level: Level,
  primary_muscles: z.array(Muscle),
  secondary_muscles: z.array(Muscle),
  instructions: z.array(z.string()),
  /** Static asset paths of the step images. */
  image_paths: z.array(z.string()),
  video_search_url: z.url(),
  /** Static asset path or URL of an animated demo, when one was matched. */
  gif_url: z.string().nullable(),
  source: z.enum(['free-exercise-db', 'user']),
  /** In the allowed exercise set (not excluded by equipment status or exclusions). Computed per request. */
  allowed: z.boolean(),
  /** Why it is not allowed (an exclusion's reason, the body-only rail, or an equipment status); null when allowed. */
  excluded_reason: z.string().nullable().optional(),
})
export type Exercise = z.infer<typeof Exercise>

/** Query of GET /api/exercises. `scope` defaults to the allowed set; `muscle` matches a primary muscle. */
export const ExerciseQuery = z.object({
  muscle: Muscle.optional(),
  equipment: EquipmentName.optional(),
  category: ExerciseCategory.optional(),
  level: Level.optional(),
  q: z.string().trim().max(100).optional(),
  scope: z.enum(['allowed', 'all']).optional(),
})
export type ExerciseQuery = z.infer<typeof ExerciseQuery>

/** Body of POST /api/exercises — one of Aaron's own (e.g. a gym-specific machine). */
export const ExerciseCreate = z.object({
  id: Id,
  name: z.string().trim().min(1).max(200),
  category: ExerciseCategory.default('strength'),
  equipment: EquipmentName,
  mechanic: Mechanic.optional(),
  force: Force.optional(),
  level: Level.default('beginner'),
  primary_muscles: z.array(Muscle).min(1),
  secondary_muscles: z.array(Muscle).default([]),
  instructions: z.array(z.string().max(1000)).default([]),
})
export type ExerciseCreate = z.infer<typeof ExerciseCreate>

// ── Equipment profile and exclusions ───────────────────────────────────────────────────────────────────────────

export const EquipmentStatus = z.enum(['have', 'dont_have', 'dislike', 'cant_use'])
export type EquipmentStatus = z.infer<typeof EquipmentStatus>

/** A library equipment value, or a named machine Aaron added ("leg press"). */
export const EquipmentKind = z.enum(['library', 'machine'])
export type EquipmentKind = z.infer<typeof EquipmentKind>

export const EquipmentItem = Row.extend({
  equipment: EquipmentName,
  status: EquipmentStatus,
  note: z.string().nullable(),
  kind: EquipmentKind.optional(),
})
export type EquipmentItem = z.infer<typeof EquipmentItem>

/** Body of PUT /api/equipment: statuses to set, upserted by equipment name. */
export const EquipmentUpdate = z.object({
  items: z
    .array(z.object({ equipment: EquipmentName, status: EquipmentStatus, note: z.string().max(200).nullable().optional() }))
    .min(1),
})
export type EquipmentUpdate = z.infer<typeof EquipmentUpdate>

/** A hard exclusion of one exercise, or of a category such as "body only" or "floor". */
export const ExerciseExclusion = Row.extend({
  exercise_id: Id.nullable(),
  category: z.string().nullable(),
  reason: z.string(),
})
export type ExerciseExclusion = z.infer<typeof ExerciseExclusion>

/** Body of POST /api/exclusions: exactly one of exercise_id or category. */
export const ExclusionCreate = z
  .object({
    id: Id,
    exercise_id: Id.optional(),
    category: z.string().trim().min(1).max(100).optional(),
    reason: z.string().trim().min(1).max(200),
  })
  .refine((e) => (e.exercise_id === undefined) !== (e.category === undefined), {
    message: 'Give exactly one of exercise_id or category',
  })
export type ExclusionCreate = z.infer<typeof ExclusionCreate>

/** Training volume in kg: Σ reps × load over completed sets. */
export const VolumeKg = z.number().nonnegative()

// ── Muscle scores, PRs, readiness ──────────────────────────────────────────────────────────────────────────────

/** A value per muscle (muscle score = Σ sets × (1.0 primary, 0.5 secondary); also volume in kg). Absent = 0. */
export const MuscleScores = z.partialRecord(Muscle, z.number().nonnegative())
export type MuscleScores = z.infer<typeof MuscleScores>

/** A personal record: best load at a rep count, or best Epley e1RM = load × (1 + reps / 30). */
export const PersonalRecord = z.object({
  exercise_id: Id,
  kind: z.enum(['best_load_at_reps', 'best_e1rm']),
  reps: Count,
  load_kg: Kg,
  e1rm_kg: Kg,
  previous_best_kg: Kg.nullable(),
  date: LocalDate,
})
export type PersonalRecord = z.infer<typeof PersonalRecord>

/** Readiness 0–100 from last night's sleep vs 7.5 h, yesterday's steps vs the 14-day median, days since the last session. */
export const Readiness = z.object({
  score: z.number().int().min(0).max(100),
  sleep_h: z.number().nonnegative().nullable(),
  steps_vs_median: z.number().nonnegative().nullable(),
  days_since_last_session: Count.nullable(),
  /** score < 40. */
  reduced_volume: z.boolean(),
})
export type Readiness = z.infer<typeof Readiness>

/** The engine's next-session suggestion for one exercise (double progression, deload, or hold). */
export const ProgressionSuggestion = z.object({
  kind: z.enum(['increase', 'hold', 'deload']),
  load_kg: Kg.nullable(),
  sets: Count.nullable(),
  reason: z.string(),
})
export type ProgressionSuggestion = z.infer<typeof ProgressionSuggestion>

// ── Templates and workout drafts ───────────────────────────────────────────────────────────────────────────────

/** One exercise of a template, week-plan session or workout draft. Order is the array position. */
export const TemplateExerciseInput = z.object({
  exercise_id: Id,
  sets: z.number().int().min(1).max(10),
  rep_min: z.number().int().min(1).max(50),
  rep_max: z.number().int().min(1).max(50),
  target_load_kg: Kg.nullable(),
  rest_sec: z.number().int().min(0).max(600),
  note: z.string().max(200).nullable(),
}).refine((e) => e.rep_min <= e.rep_max, { message: 'rep_min must not exceed rep_max', path: ['rep_max'] })
export type TemplateExerciseInput = z.infer<typeof TemplateExerciseInput>

export const TemplateExercise = TemplateExerciseInput.extend({ id: Id })
export type TemplateExercise = z.infer<typeof TemplateExercise>

export const TemplateOrigin = z.enum(['custom', 'ai'])
export type TemplateOrigin = z.infer<typeof TemplateOrigin>

export const Template = Row.extend({
  name: z.string().min(1),
  origin: TemplateOrigin,
  notes: z.string().nullable(),
  exercises: z.array(TemplateExercise),
  /** Snapshot computed by the engine when the template is saved. */
  muscle_scores: MuscleScores,
})
export type Template = z.infer<typeof Template>

const TemplateName = z.string().trim().min(1).max(100)

/** Body of POST /api/templates. The exercise list replaces as a whole, so a retried create is idempotent. */
export const TemplateCreate = z.object({
  id: Id,
  name: TemplateName,
  origin: TemplateOrigin.default('custom'),
  notes: z.string().max(1000).optional(),
  exercises: z.array(TemplateExerciseInput).min(1).max(20),
  /** Saving an AI workout proposal as this template accepts the proposal. */
  proposal_id: Id.optional(),
})
export type TemplateCreate = z.infer<typeof TemplateCreate>

/** Body of PATCH /api/templates/:id; `exercises` replaces the whole list. */
export const TemplatePatch = z.object({
  name: TemplateName.optional(),
  notes: z.string().max(1000).nullable().optional(),
  exercises: z.array(TemplateExerciseInput).min(1).max(20).optional(),
})
export type TemplatePatch = z.infer<typeof TemplatePatch>

/**
 * workout_generate / workout_fill output (LLM): a session in the template format plus a two-line rationale.
 * Muscle scores are not asked of the LLM; the engine computes them.
 */
export const WorkoutDraft = z.object({
  exercises: z.array(TemplateExerciseInput).min(1).max(20),
  rationale: z.string().max(400),
  /** Engine muscle scores of `exercises` (set by the job, never by the LLM). */
  muscle_scores: MuscleScores.optional(),
  /** What the guards dropped or repaired (an excluded pick, sets trimmed to 28, …), for the preview. */
  guard_notes: z.array(z.string()).optional(),
  /** The pending `workout` proposal the job wrote; pass it to POST /api/templates or /api/sessions to accept it. */
  proposal_id: Id.optional(),
})
export type WorkoutDraft = z.infer<typeof WorkoutDraft>

/** Body of POST /api/ai/workout: generate a session, or fill a partial list into a balanced one. */
export const AiWorkoutRequest = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('generate'), date: LocalDate.optional(), focus: z.string().max(200).optional() }),
  z.object({ mode: z.literal('fill'), date: LocalDate.optional(), exercises: z.array(TemplateExerciseInput).min(1).max(20) }),
])
export type AiWorkoutRequest = z.infer<typeof AiWorkoutRequest>

// ── Sessions and sets ──────────────────────────────────────────────────────────────────────────────────────────

export const SessionOrigin = z.enum(['template', 'ai', 'blank', 'week_plan'])
export type SessionOrigin = z.infer<typeof SessionOrigin>

/** RPE 6–10 in half steps. */
const Rpe = z.number().min(6).max(10).multipleOf(0.5)

export const SessionSet = z.object({
  id: Id,
  session_id: Id,
  exercise_id: Id,
  set_index: Count,
  reps: Count.nullable(),
  load_kg: Kg.nullable(),
  rpe: Rpe.nullable(),
  completed: z.boolean(),
  note: z.string().nullable(),
})
export type SessionSet = z.infer<typeof SessionSet>

/** One logged set as the greyed default of the next session (reps × kg). */
const PastSet = z.object({ set_index: Count, reps: Count.nullable(), load_kg: Kg.nullable(), rpe: Rpe.nullable() })

/**
 * One exercise of a session's plan (the template / week-plan / AI snapshot it started from, plus exercises added
 * mid-session), with last session's sets and the engine's progression suggestion for this session.
 */
export const SessionPlanExercise = z.object({
  exercise_id: Id,
  sets: z.number().int().min(1).max(50),
  rep_min: z.number().int().min(1).max(50),
  rep_max: z.number().int().min(1).max(50),
  target_load_kg: Kg.nullable(),
  rest_sec: z.number().int().min(0).max(600),
  note: z.string().nullable(),
  /** The default load to show: suggestion.load_kg, else target_load_kg, else last session's top load. */
  default_load_kg: Kg.nullable(),
  /** This exercise's sets in the latest earlier session that logged it. */
  last: z.object({ session_id: Id, date: LocalDate, sets: z.array(PastSet) }).nullable(),
  suggestion: ProgressionSuggestion.nullable(),
})
export type SessionPlanExercise = z.infer<typeof SessionPlanExercise>

/** Recovery rule at session start: primary muscles also trained as a primary target on the day before or after. */
export const SessionRecovery = z.object({
  conflicts: z.array(Muscle),
  /** Readiness under 40, or under 5 h sleep last night. */
  reduced_volume: z.boolean(),
  notes: z.array(z.string()),
})
export type SessionRecovery = z.infer<typeof SessionRecovery>

/** Deload check at session start (engine deloadCheck); `active` = this session is in a deload week (60 % of sets). */
export const DeloadStatus = z.object({
  due: z.boolean(),
  reason: z.enum(['scheduled', 'missed_reps']).nullable(),
  weeks_since: Count,
  sets_factor: z.number().positive().max(1),
  active: z.boolean(),
})
export type DeloadStatus = z.infer<typeof DeloadStatus>

export const WorkoutSession = Row.extend({
  date: LocalDate,
  template_id: Id.nullable(),
  started_at: Instant,
  ended_at: Instant.nullable(),
  origin: SessionOrigin,
  readiness: Readiness.nullable(),
  notes: z.string().nullable(),
  /** Planned scores at start (from the plan), the trained scores once finished (completed sets). */
  muscle_scores: MuscleScores.nullable(),
  prs: z.array(PersonalRecord).nullable(),
  sets: z.array(SessionSet),
  /** POST /api/sessions and GET /api/sessions/:id only: the plan with greyed defaults, recovery and deload. */
  plan: z.array(SessionPlanExercise).optional(),
  recovery: SessionRecovery.optional(),
  deload: DeloadStatus.optional(),
})
export type WorkoutSession = z.infer<typeof WorkoutSession>

/**
 * Body of POST /api/sessions. The local `date` is computed from `started_at`. The plan is `exercises` when given (a
 * week-plan session, an edited AI draft), else the template's, else the proposal's draft, else the active week plan's
 * session for that day when origin is week_plan; a blank session has none. `proposal_id` accepts an AI workout proposal.
 */
export const SessionCreate = z.object({
  id: Id,
  template_id: Id.nullable(),
  origin: SessionOrigin,
  started_at: Instant,
  exercises: z.array(TemplateExerciseInput).min(1).max(20).optional(),
  proposal_id: Id.optional(),
})
export type SessionCreate = z.infer<typeof SessionCreate>

/** Body of POST /api/sessions/:id/sets. */
export const SetCreate = z.object({
  id: Id,
  exercise_id: Id,
  set_index: Count.max(50),
  reps: Count.max(100).optional(),
  load_kg: Kg.optional(),
  rpe: Rpe.optional(),
  completed: z.boolean().default(false),
  note: z.string().max(200).optional(),
})
export type SetCreate = z.infer<typeof SetCreate>

/** Body of PATCH /api/sets/:id; null clears a value. */
export const SetPatch = z.object({
  reps: Count.max(100).nullable().optional(),
  load_kg: Kg.nullable().optional(),
  rpe: Rpe.nullable().optional(),
  completed: z.boolean().optional(),
  note: z.string().max(200).nullable().optional(),
})
export type SetPatch = z.infer<typeof SetPatch>

/** Body of POST /api/sessions/:id/finish. */
export const SessionFinish = z.object({ ended_at: Instant, notes: z.string().max(2000).optional() })
export type SessionFinish = z.infer<typeof SessionFinish>

/** The finish screen: duration, total volume (Σ reps × kg over completed sets), volume per muscle, PRs, muscle map. */
export const SessionSummary = z.object({
  duration_min: Count,
  total_volume_kg: VolumeKg,
  volume_by_muscle: MuscleScores,
  muscle_scores: MuscleScores,
  prs: z.array(PersonalRecord),
})
export type SessionSummary = z.infer<typeof SessionSummary>

export const SessionFinishResult = z.object({ session: WorkoutSession, summary: SessionSummary })
export type SessionFinishResult = z.infer<typeof SessionFinishResult>

/** A session in one line, for Today. */
export const SessionBrief = z.object({
  id: Id,
  origin: SessionOrigin,
  template_name: z.string().nullable(),
  started_at: Instant,
  ended_at: Instant.nullable(),
  sets_done: Count,
  volume_kg: VolumeKg,
  muscle_scores: MuscleScores.nullable(),
})
export type SessionBrief = z.infer<typeof SessionBrief>

/** Response of GET /api/history/exercises/:id: past sessions (newest first), PRs, and next session's suggestion. */
export const ExerciseHistory = z.object({
  exercise_id: Id,
  entries: z.array(
    z.object({
      session_id: Id,
      date: LocalDate,
      sets: z.array(SessionSet),
      top_load_kg: Kg.nullable(),
      best_e1rm_kg: Kg.nullable(),
    }),
  ),
  prs: z.array(PersonalRecord),
  next: ProgressionSuggestion.nullable(),
})
export type ExerciseHistory = z.infer<typeof ExerciseHistory>
