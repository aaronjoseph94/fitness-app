// Owns: the coach module's contract as Zod schemas (SPEC §8 "Coach reviews through MCP", §10 review tools): the
// review bundle, the batch of review changes apply_review takes and its result, revert_review's result, the
// dashboard note and scheduled-scan inputs, and query_metric's series. The tools layer reuses them as tool
// input/output schemas, so every name here is written for a model to read.
import {
  Count,
  DashboardNote,
  EquipmentName,
  EquipmentStatus,
  FastOutcome,
  Forecast,
  Id,
  Instant,
  IsoWeek,
  Kg,
  LocalDate,
  LocalTime,
  MeasurementSite,
  MilestoneKind,
  MuscleScores,
  Nutrients,
  PlanChange,
  PlanDiff,
  PlanTargets,
  ReminderKind,
  ReviewFlag,
  ScanSegment,
  TargetField,
  TemplateExerciseInput,
  Weekday,
} from '@fitness/shared/schemas'
import * as z from 'zod'

const Reason = z.string().trim().min(1).max(500)

// ── query_metric ───────────────────────────────────────────────────────────────────────────────────────────────

export const MetricName = z.enum([
  'weight',
  'trend',
  'kcal',
  'protein',
  'carbs',
  'fat',
  'fibre',
  'water',
  'steps',
  'sleep',
  'volume',
  'sessions',
])
export type MetricName = z.infer<typeof MetricName>

export const MetricAgg = z.enum(['day', 'week'])
export type MetricAgg = z.infer<typeof MetricAgg>

/** At most 400 days (the day series' limit). */
export const MetricQuery = z
  .object({
    metric: MetricName.describe(
      'weight = raw weigh-in kg; trend = trend weight kg (EWMA); kcal/protein/carbs/fat/fibre = intake on logged days (a fast day counts as 0); water ml; steps; sleep = minutes asleep; volume = training kg (Σ reps × load); sessions = sessions done',
    ),
    from: LocalDate,
    to: LocalDate,
    agg: MetricAgg.default('day').describe(
      'day = one point per date; week = one point per Monday–Sunday week',
    ),
  })
  .refine((q) => q.from <= q.to, { message: '`from` must be on or before `to`', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) < 400 * 86_400_000, {
    message: 'At most 400 days',
    path: ['to'],
  })
export type MetricQuery = z.infer<typeof MetricQuery>

export const MetricPoint = z.object({
  /** The date (agg day) or the week's Monday (agg week). */
  date: LocalDate,
  value: z.number().nullable(),
  /** The day's target (mean over the week) for kcal, macros, water and steps; null otherwise. */
  target: z.number().nullable(),
  /** Days with data behind the value. */
  n: Count,
})
export type MetricPoint = z.infer<typeof MetricPoint>

export const MetricSeries = z.object({
  metric: MetricName,
  unit: z.string(),
  agg: MetricAgg,
  from: LocalDate,
  to: LocalDate,
  /** How a week's value is formed: mean of days with data, sum (volume, sessions), or last (trend). */
  week_value: z.enum(['mean', 'sum', 'last']),
  points: z.array(MetricPoint),
  summary: z.object({
    mean: z.number().nullable(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    total: z.number().nullable(),
    days_with_data: Count,
  }),
})
export type MetricSeries = z.infer<typeof MetricSeries>

// ── Dashboard note and scan date ───────────────────────────────────────────────────────────────────────────────

export const DashboardNoteInput = z.object({
  text: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe('The note, shown at the top of Today. Plain text, one or two sentences.'),
  until: LocalDate.optional().describe(
    'Last Edmonton date to show it (inclusive). Omit to show it until a newer note replaces it.',
  ),
})
export type DashboardNoteInput = z.infer<typeof DashboardNoteInput>
export { DashboardNote }

export const ScanDateInput = z.object({
  date: LocalDate.describe('The Edmonton date of the next Evolt scan (today or later).'),
})
export type ScanDateInput = z.infer<typeof ScanDateInput>

/** The next scan: a date set by schedule_scan (or a week plan), else last confirmed scan + scan_interval_days. */
export const NextScan = z.object({
  date: LocalDate.nullable(),
  source: z.enum(['scheduled', 'interval', 'none']),
  last_scan_date: LocalDate.nullable(),
  interval_days: Count,
  /** last scan + interval (`date` when no scan is scheduled; the scan-due reminder and note follow `date`). */
  interval_due: LocalDate.nullable(),
})
export type NextScan = z.infer<typeof NextScan>

export const ScanScheduled = NextScan.extend({ previous_scheduled: LocalDate.nullable() })
export type ScanScheduled = z.infer<typeof ScanScheduled>

// ── apply_review changes ───────────────────────────────────────────────────────────────────────────────────────

/** Every change kind apply_review understands. Settings rails (floor, ceiling, protein/fat minimums, fasting pattern) are not among them. */
export const ReviewChange = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('target'),
      field: TargetField,
      weekday: Weekday.nullable()
        .default(null)
        .describe('null = every day (the default); a weekday = that weekday only'),
      to: z.number().nonnegative(),
      reason: Reason.optional(),
    })
    .describe(
      'Move one daily target (kcal, protein_g, carbs_g, fat_g, fibre_g, water_ml, steps). Water target = field water_ml.',
    ),
  z
    .object({
      kind: z.literal('template'),
      template_id: Id.optional().describe('Update this template; omit to create a new one'),
      name: z.string().trim().min(1).max(100),
      notes: z.string().max(1000).optional(),
      exercises: z.array(TemplateExerciseInput).min(1).max(20),
      reason: Reason.optional(),
    })
    .describe('Create or rewrite a workout template (allowed exercises only, 12–28 sets in total).'),
  z
    .object({
      kind: z.literal('exercise_swap'),
      template_id: Id,
      from_exercise_id: Id,
      to_exercise_id: Id,
      reason: Reason.optional(),
    })
    .describe(
      'Swap one exercise in a template for another from the allowed set (sets and reps kept, target load cleared).',
    ),
  z
    .object({
      kind: z.literal('week_split'),
      training_days: z.array(Weekday).min(1).max(7),
      reason: Reason.optional(),
    })
    .describe('Which weekdays are training days (default mon–thu).'),
  z
    .object({
      kind: z.literal('equipment'),
      items: z
        .array(
          z.object({
            equipment: EquipmentName,
            status: EquipmentStatus,
            note: z.string().max(200).nullable().optional(),
          }),
        )
        .min(1)
        .max(40),
      reason: Reason.optional(),
    })
    .describe('Set equipment statuses (have, dont_have, dislike, cant_use).'),
  z
    .object({
      kind: z.literal('reminder_time'),
      reminder: ReminderKind,
      time: LocalTime.nullable()
        .optional()
        .describe('HH:MM Edmonton time (clock reminders: weigh_in, workout, scan_due)'),
      enabled: z.boolean().optional(),
      reason: Reason.optional(),
    })
    .describe('Change one reminder: its time and/or on/off.'),
  z
    .object({
      kind: z.literal('milestone'),
      milestone_kind: MilestoneKind,
      label: z.string().trim().min(1).max(100).describe('e.g. "Waist-to-hip under 0.95"'),
      target_value: z.number(),
      segment: ScanSegment.optional().describe("Only for milestone_kind 'segment'"),
      reason: Reason.optional(),
    })
    .describe('Add a milestone (a target value reached at or below it).'),
  z
    .object({
      kind: z.literal('fast'),
      date: LocalDate,
      time: LocalTime.optional().describe('Start time, HH:MM Edmonton (default 19:00, dinner to dinner)'),
      fast_id: Id.optional().describe('Move this planned fast instead of planning a new one'),
      note: z.string().max(500).optional(),
      reason: Reason.optional(),
    })
    .describe('Plan a 24 h fast (or move a planned one). At most settings.fasts_per_month per month.'),
  z
    .object({ kind: z.literal('fast_cancel'), fast_id: Id, reason: Reason.optional() })
    .describe('Cancel a planned fast that has not started.'),
  z
    .object({ kind: z.literal('scan_date'), date: LocalDate, reason: Reason.optional() })
    .describe('Set the next Evolt scan date.'),
  z
    .object({
      kind: z.literal('dashboard_note'),
      text: z.string().trim().min(1).max(1000),
      until: LocalDate.optional(),
      reason: Reason.optional(),
    })
    .describe('Pin a coach note to the top of Today (until the given date, inclusive).'),
])
export type ReviewChange = z.infer<typeof ReviewChange>
export type ReviewChangeKind = ReviewChange['kind']

export const ApplyReviewInput = z.object({
  summary: z.string().trim().min(1).max(300).describe('One line: what this review changes and why'),
  narrative: z
    .string()
    .trim()
    .min(1)
    .max(8000)
    .describe(
      'The review as Aaron reads it in the weekly report (replaces the Gemini draft for that week). No medical advice.',
    ),
  changes: z.array(ReviewChange).max(40),
  week_start: LocalDate.optional().describe(
    'Monday of the reviewed week. Default: this week on Sat/Sun, last week Mon–Fri.',
  ),
  highlights: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
  concerns: z.array(z.string().trim().min(1).max(300)).max(8).optional(),
})
export type ApplyReviewInput = z.infer<typeof ApplyReviewInput>

const VersionRef = z.object({ id: Id, version: z.number().int().positive() })

export const AppliedChange = z.object({ index: Count, kind: z.string(), summary: z.string() })
export type AppliedChange = z.infer<typeof AppliedChange>

export const DroppedChange = z.object({
  index: Count,
  kind: z.string(),
  /** The rail or check it failed (calorie_floor, protein_min, exercise_not_allowed, session_sets, fasting_pattern, not_found, …). */
  rule: z.string(),
  reason: z.string(),
})
export type DroppedChange = z.infer<typeof DroppedChange>

export const ScheduledStep = z.object({ change: PlanChange, due: LocalDate, proposal_id: Id })

export const ApplyReviewResult = z.object({
  review_id: Id,
  week: IsoWeek,
  week_start: LocalDate,
  /** The one plan version this review created (null when no target change passed the guards). */
  plan_version: VersionRef.nullable(),
  /** The version that was active before; revert_review restores it. */
  plan_version_before: VersionRef,
  /** Target lines the new version changed. */
  diff: PlanDiff,
  applied: z.array(AppliedChange),
  dropped: z.array(DroppedChange),
  /** Later ≤150 kcal steps of a bigger kcal move, stored as pending proposals due a week apart. */
  scheduled: z.array(ScheduledStep),
})
export type ApplyReviewResult = z.infer<typeof ApplyReviewResult>

export const RevertReviewResult = z.object({
  review_id: Id,
  already_reverted: z.boolean(),
  /** The new active version copying the one from before the review (null when the review changed no targets). */
  plan_version: VersionRef.nullable(),
  /** Plan versions created after the review that the restore also undid. */
  later_versions_undone: Count,
  undone: z.array(z.string()),
  kept: z.array(z.string()),
  failed: z.array(z.string()),
})
export type RevertReviewResult = z.infer<typeof RevertReviewResult>

// ── get_review_bundle ──────────────────────────────────────────────────────────────────────────────────────────

export const BundleQuery = z.object({
  from: LocalDate.optional().describe(
    'First day (default: Monday of the review week — this week on Sat/Sun, last week Mon–Fri)',
  ),
  to: LocalDate.optional().describe(
    'Last day (default: from + 6). At most 56 days; use query_metric for longer series.',
  ),
})
export type BundleQuery = z.infer<typeof BundleQuery>

const BundleWeek = z.object({
  week: IsoWeek,
  week_start: LocalDate,
  trend_start_kg: Kg.nullable(),
  trend_end_kg: Kg.nullable(),
  trend_change_kg: z.number().nullable(),
  intake_avg: Nutrients,
  target_kcal_avg: z.number().nullable(),
  target_protein_g: z.number().nullable(),
  days_logged: Count,
  protein_adherence: z.number(),
  water_avg_ml: z.number(),
  steps_avg: z.number().nullable(),
  sleep_avg_min: z.number().nullable(),
  sessions_done: Count,
  sessions_planned: Count,
  volume_kg: z.number(),
  logging_adherence: z.number(),
})

const TrainingBlock = z.object({
  weeks: Count,
  sessions_done: Count,
  sessions_planned: Count,
  volume_kg: z.number(),
  /** Muscle score per muscle (Σ sets × 1.0 primary / 0.5 secondary). */
  muscle_scores: MuscleScores,
  /** Volume per muscle, kg (Σ reps × load × 1.0 / 0.5). */
  volume_by_muscle: MuscleScores,
})

const ScanDelta = z.object({
  vs_date: LocalDate,
  days: z.number().int(),
  weight_kg: z.number(),
  fat_kg: z.number(),
  lean_kg: z.number(),
  water_kg: z.number(),
  lean_share_of_loss: z.number().nullable(),
  lean_loss: z.enum(['ok', 'lean_loss', 'hydration']),
  body_fat_pct: z.number().nullable(),
  visceral_fat_level: z.number().nullable(),
  segment_fat_kg: z.partialRecord(ScanSegment, z.number()),
})

export const ReviewBundle = z.object({
  generated_at: Instant,
  period: z.object({
    from: LocalDate,
    to: LocalDate,
    weeks: z.array(IsoWeek),
    previous_weeks: z.array(IsoWeek),
  }),
  profile: z.object({
    sex: z.string(),
    age: z.number().nullable(),
    height_cm: z.number(),
    start: z.object({ date: LocalDate, weight_kg: Kg }),
    goal: z.object({ date: LocalDate, weight_kg: Kg, body_fat_pct_target: z.number() }),
  }),
  rails: z.object({
    calorie_floor: z.number(),
    calorie_ceiling: z.number(),
    protein_min_g: z.number(),
    fat_min_g: z.number(),
    fasts_per_month: z.number(),
    fast_hours: z.number(),
    kcal_step_max: z.number(),
    sets_per_session: z.object({ min: z.number(), max: z.number() }),
  }),
  preferences: z.object({
    training_days: z.array(Weekday),
    water_target_ml: z.number(),
    fibre_target_g: z.number(),
    scan_interval_days: z.number(),
    auto_apply_safe: z.boolean(),
  }),
  plan: z.object({
    id: Id,
    version: z.number(),
    created_by: z.string(),
    created_at: Instant,
    reason: z.string(),
    targets: PlanTargets,
    forecast: Forecast.nullable(),
    recent_versions: z.array(
      z.object({
        version: z.number(),
        created_by: z.string(),
        created_at: Instant,
        reason: z.string(),
        diff: z.string(),
      }),
    ),
  }),
  weight: z.object({
    latest_raw: z.object({ date: LocalDate, kg: Kg }).nullable(),
    trend_kg: Kg.nullable(),
    change_7d_kg: z.number().nullable(),
    period_change_kg: z.number().nullable(),
    to_goal_kg: z.number().nullable(),
  }),
  weeks: z.array(BundleWeek),
  totals: z.object({
    days_logged: Count,
    intake_avg: Nutrients,
    protein_adherence: z.number(),
    water_avg_ml: z.number(),
    steps_avg: z.number().nullable(),
    sleep_avg_min: z.number().nullable(),
    logging_adherence: z.number(),
  }),
  training: z.object({
    period: TrainingBlock,
    previous: TrainingBlock.nullable(),
    prs: z.array(
      z.object({
        exercise: z.string(),
        kind: z.string(),
        reps: Count,
        load_kg: Kg,
        e1rm_kg: Kg,
        date: LocalDate,
      }),
    ),
  }),
  fasts: z.array(FastOutcome),
  measurements: z.array(
    z.object({
      site: MeasurementSite,
      first: z.object({ date: LocalDate, cm: z.number() }),
      last: z.object({ date: LocalDate, cm: z.number() }),
    }),
  ),
  scan: z
    .object({
      latest: z.object({
        id: Id,
        date: LocalDate,
        weight_kg: z.number(),
        body_fat_pct: z.number(),
        body_fat_mass_kg: z.number(),
        lean_body_mass_kg: z.number(),
        skeletal_muscle_mass_kg: z.number(),
        visceral_fat_level: z.number(),
        waist_hip_ratio: z.number(),
      }),
      vs_previous: ScanDelta.nullable(),
      vs_baseline: ScanDelta.nullable(),
      flags: z.array(z.object({ code: z.string(), message: z.string() })),
    })
    .nullable(),
  milestones: z.array(z.object({ label: z.string(), reached_on: LocalDate.nullable() })),
  open_proposals: z.array(
    z.object({
      id: Id,
      kind: z.string(),
      summary: z.string(),
      actor: z.string(),
      created_at: Instant,
      due: LocalDate.nullable(),
    }),
  ),
  upcoming: z.object({
    fasts: z.array(z.object({ id: Id, date: LocalDate, starts_at: Instant, note: z.string().nullable() })),
    scan: NextScan,
    week_plans: z.array(z.object({ id: Id, week_start: LocalDate, status: z.string(), author: z.string() })),
  }),
  dashboard_note: z.object({ text: z.string(), until: Instant.nullable(), actor: z.string() }).nullable(),
  flags: z.array(ReviewFlag),
  equipment_limits: z.array(
    z.object({ equipment: z.string(), status: EquipmentStatus, note: z.string().nullable() }),
  ),
  templates: z.array(
    z.object({ id: Id, name: z.string(), exercises: Count, sets: Count, muscle_scores: MuscleScores }),
  ),
})
export type ReviewBundle = z.infer<typeof ReviewBundle>

export type ScanDelta = z.infer<typeof ScanDelta>
