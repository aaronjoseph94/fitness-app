// Owns: the Drizzle schema for every D1 table (SPEC §5 + docs/PROGRESS.md adjustments) and the v_day view binding.
//
// Conventions (CLAUDE.md "Engineering rules"):
// - Keys are the SQL column names (snake_case), so a row has the same shape in SQL, TypeScript, the SPEC and the API JSON.
// - `id` is UUID text. `created_at`/`updated_at` are UTC instants 'YYYY-MM-DDTHH:MM:SS.sssZ'.
// - Instants are UTC text; a row that belongs to a day also stores its Edmonton local `date` ('YYYY-MM-DD'), computed in code.
// - Enums are TypeScript-only (`text({ enum })` emits no CHECK). JSON columns are `text({ mode: 'json' }).$type<T>()`.
//   LLM- or MCP-fed JSON is typed `unknown`: parse it with its Zod schema on read.
// - No ON DELETE CASCADE: delete child rows explicitly in the same db.batch().
// - Invariants enforced by indexes: one weigh-in/steps/sleep/targets row per date, one active plan version,
//   one active week plan per week_start, one cron run per (kind, period_key).
import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, sqliteView, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import {
  Actor,
  EquipmentStatus,
  Exercise,
  ExerciseCategory,
  FoodSource,
  Force,
  HealthSource,
  InputMethod,
  Level,
  MassUnit,
  MealSlot,
  MealStatus,
  MeasurementSite,
  Mechanic,
  ScanSegment,
  ScanSource,
  SessionOrigin,
  Sex,
  TemplateOrigin,
  Weekday,
  type Muscle,
  type MuscleScores,
  type RecipeItem,
  type ReminderPrefs,
  type ScanConditions,
} from '@fitness/shared/schemas'

// ---------------------------------------------------------------------------
// Stand-ins for shared schemas that exist but are not yet re-exported from @fitness/shared/schemas (plan.ts,
// week-plan.ts, body.ts, chat.ts), or that no shared schema defines. Values and shapes match the shared files.
// TODO(schemas): import WeekPlanAuthor, WeekPlanStatus, MilestoneKind, ProposalStatus, ChatRole, PlanTargets,
// Forecast and PlanDiff once the schemas index re-exports them, and delete these.
// ---------------------------------------------------------------------------
const WEEK_PLAN_AUTHOR = ['claude_mcp', 'gemini', 'user'] as const
const WEEK_PLAN_STATUS = ['proposed', 'active', 'superseded'] as const
const MILESTONE_KIND = ['weight', 'body_fat_pct', 'visceral_level', 'whr', 'segment'] as const
const PROPOSAL_STATUS = ['pending', 'accepted', 'rejected', 'auto_applied'] as const
const CHAT_ROLE = ['user', 'assistant', 'tool'] as const
// Not in any shared schema yet (SPEC §5 values):
const EQUIPMENT_KIND = ['library', 'machine'] as const
const PHOTO_POSE = ['front', 'side', 'back'] as const
const JOB_STATUS = ['queued', 'running', 'done', 'failed'] as const
const EVENT_KIND = ['adjustment', 'proposal', 'review', 'note', 'change'] as const
const REVIEW_AUTHOR = ['claude_mcp', 'gemini'] as const

/** One day's targets (shared TargetValues). */
type TargetValues = {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number
  water_ml: number
  steps: number
}
/** plan_versions.targets (shared PlanTargets): defaults plus per-weekday overrides. */
type PlanTargets = { defaults: TargetValues; overrides: Partial<Record<Weekday, Partial<TargetValues>>> }
/** plan_versions.forecast (shared Forecast): weekly_rate_kg = (tdee_est − target_kcal) × 7 / 7,700; band = rate × (1 ∓ 0.20). */
type Forecast = {
  finish_date: string | null
  weekly_rate_kg: number
  band: { low: number; high: number }
  tdee_est: number
}
/** plan_versions.diff (shared PlanDiff): one line per changed target; null = absent. */
type PlanDiff = {
  field: keyof TargetValues
  weekday: Weekday | null
  from: number | null
  to: number | null
}[]
/** Extra exercise media beyond the step images (e.g. ExerciseDB GIFs). */
type ExerciseMedia = { kind: 'gif' | 'image' | 'video'; url: string; source: string }[]

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------
const NOW_UTC = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`
const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
const timestamps = () => ({
  created_at: text().notNull().default(NOW_UTC),
  updated_at: text()
    .notNull()
    .default(NOW_UTC)
    .$onUpdateFn(() => new Date().toISOString()),
})
const bool = () => integer({ mode: 'boolean' })
/** A shared Zod enum's values as the non-empty tuple `text({ enum })` wants (types only; no CHECK is emitted). */
const values = <T extends string>(e: { options: T[] }) => e.options as [T, ...T[]]
const actor = () =>
  text({ enum: values(Actor) })
    .notNull()
    .default('user')

// ---------------------------------------------------------------------------
// Profile and rails
// ---------------------------------------------------------------------------
/** One row. */
export const profile = sqliteTable('profile', {
  id: id(),
  height_cm: real().notNull(),
  birth_date: text(), // unknown; Aaron was 31 at the 2026-09-26 baseline scan
  sex: text({ enum: values(Sex) }).notNull(),
  timezone: text().notNull().default('America/Edmonton'),
  goal_weight_kg: real().notNull(),
  goal_date: text().notNull(),
  start_weight_kg: real().notNull(),
  start_date: text().notNull(),
  ...timestamps(),
})

/** One row: the rails. Only Aaron changes these (changes logged in ai_events with actor 'user'). */
export const settings = sqliteTable('settings', {
  id: id(),
  calorie_floor: integer().notNull().default(1400),
  calorie_ceiling: integer().notNull().default(1700),
  protein_min_g: integer().notNull(),
  fat_min_g: integer().notNull(),
  fasts_per_month: integer().notNull().default(2),
  fast_hours: integer().notNull().default(24),
  fibre_target_g: integer().notNull(),
  water_target_ml: integer().notNull(),
  training_days: text({ mode: 'json' }).$type<Weekday[]>().notNull(),
  breakfast_enabled: bool().notNull().default(false),
  auto_apply_safe: bool().notNull().default(false),
  scan_interval_days: integer().notNull().default(28),
  reminders: text({ mode: 'json' }).$type<ReminderPrefs>().notNull(),
  ...timestamps(),
})

// ---------------------------------------------------------------------------
// Body logs
// ---------------------------------------------------------------------------
export const weight_logs = sqliteTable(
  'weight_logs',
  {
    id: id(),
    date: text().notNull(),
    weight_kg: real().notNull(),
    note: text(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('weight_logs_date_uq').on(t.date)],
)

export const measurements = sqliteTable(
  'measurements',
  {
    id: id(),
    date: text().notNull(),
    site: text({ enum: values(MeasurementSite) }).notNull(),
    value_cm: real().notNull(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('measurements_date_site_uq').on(t.date, t.site)],
)

export const water_logs = sqliteTable(
  'water_logs',
  {
    id: id(),
    logged_at: text().notNull(),
    date: text().notNull(),
    amount_ml: integer().notNull(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [index('water_logs_date_idx').on(t.date)],
)

/** One row per night; date = the wake date. */
export const sleep_logs = sqliteTable(
  'sleep_logs',
  {
    id: id(),
    date: text().notNull(),
    in_bed_at: text(),
    woke_at: text(),
    asleep_min: integer(),
    source: text({ enum: values(HealthSource) })
      .notNull()
      .default('manual'),
    stages: text({ mode: 'json' }).$type<unknown>(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('sleep_logs_date_uq').on(t.date)],
)

export const step_logs = sqliteTable(
  'step_logs',
  {
    id: id(),
    date: text().notNull(),
    steps: integer().notNull(),
    active_kcal: integer(),
    source: text({ enum: values(HealthSource) })
      .notNull()
      .default('manual'),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('step_logs_date_uq').on(t.date)],
)

/**
 * A 24 h fast. A planned fast (planned = true) is a row whose started_at is the planned start; it begins at that time.
 * So a fast has happened once started_at <= now; ended_at/end_date stay null while it runs. Cancel = delete the row.
 */
export const fast_logs = sqliteTable(
  'fast_logs',
  {
    id: id(),
    started_at: text().notNull(),
    ended_at: text(),
    start_date: text().notNull(),
    end_date: text(),
    planned: bool().notNull().default(false),
    note: text(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [index('fast_logs_start_date_idx').on(t.start_date), index('fast_logs_end_date_idx').on(t.end_date)],
)

// ---------------------------------------------------------------------------
// Food
// ---------------------------------------------------------------------------
/** Nutrition cache (per 100 g) and Aaron's own foods. */
export const foods = sqliteTable(
  'foods',
  {
    id: id(),
    source: text({ enum: values(FoodSource) }).notNull(),
    source_id: text(),
    barcode: text(),
    name: text().notNull(),
    brand: text(),
    serving_g: real(),
    kcal_per_100g: real().notNull(),
    protein_g: real().notNull().default(0),
    carbs_g: real().notNull().default(0),
    fat_g: real().notNull().default(0),
    fibre_g: real().notNull().default(0),
    sugar_g: real(),
    sodium_mg: real(),
    raw: text({ mode: 'json' }).$type<unknown>(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('foods_source_uq').on(t.source, t.source_id), index('foods_barcode_idx').on(t.barcode)],
)

/** One-tap repeat: a food with default grams, or a recipe. */
export const favorites = sqliteTable('favorites', {
  id: id(),
  food_id: text().references(() => foods.id),
  recipe: text({ mode: 'json' }).$type<RecipeItem[]>(),
  label: text().notNull(),
  default_grams: real(),
  sort_order: integer().notNull().default(0),
  ...timestamps(),
})

export const meals = sqliteTable(
  'meals',
  {
    id: id(),
    date: text().notNull(),
    slot: text({ enum: values(MealSlot) }).notNull(),
    eaten_at: text(),
    input_method: text({ enum: values(InputMethod) }).notNull(),
    raw_text: text(),
    status: text({ enum: values(MealStatus) })
      .notNull()
      .default('parsing'),
    /** The newest meal_analysis job queued for this meal (its status is the meal's analysis state); null = never analysed. */
    analysis_job_id: text(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [index('meals_date_idx').on(t.date)],
)

export const meal_items = sqliteTable(
  'meal_items',
  {
    id: id(),
    meal_id: text()
      .notNull()
      .references(() => meals.id),
    food_id: text().references(() => foods.id),
    description: text().notNull(),
    grams: real().notNull(),
    kcal: real().notNull().default(0),
    protein_g: real().notNull().default(0),
    carbs_g: real().notNull().default(0),
    fat_g: real().notNull().default(0),
    fibre_g: real().notNull().default(0),
    confidence: real(),
    estimated: bool().notNull().default(false),
    sort_order: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [index('meal_items_meal_id_idx').on(t.meal_id)],
)

export const meal_photos = sqliteTable(
  'meal_photos',
  {
    id: id(),
    meal_id: text()
      .notNull()
      .references(() => meals.id),
    storage_path: text().notNull(),
    width: integer(),
    height: integer(),
    exif_stripped: bool().notNull().default(true),
    ...timestamps(),
  },
  (t) => [index('meal_photos_meal_id_idx').on(t.meal_id)],
)

// ---------------------------------------------------------------------------
// Plans and targets
// ---------------------------------------------------------------------------
/** Append-only. Exactly one row has active = true (partial unique index): deactivate the old row before activating the new one in the same batch. */
export const plan_versions = sqliteTable(
  'plan_versions',
  {
    id: id(),
    version: integer().notNull(),
    active: bool().notNull().default(false),
    created_by: text({ enum: values(Actor) }).notNull(),
    reason: text().notNull(),
    diff: text({ mode: 'json' }).$type<PlanDiff>().notNull(),
    targets: text({ mode: 'json' }).$type<PlanTargets>().notNull(),
    forecast: text({ mode: 'json' }).$type<Forecast>(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('plan_versions_version_uq').on(t.version),
    uniqueIndex('plan_versions_one_active_uq')
      .on(t.active)
      .where(sql`active = 1`),
  ],
)

export const weekly_reviews = sqliteTable(
  'weekly_reviews',
  {
    id: id(),
    week_start: text().notNull(),
    metrics: text({ mode: 'json' }).$type<unknown>(),
    narrative: text(),
    author: text({ enum: REVIEW_AUTHOR }).notNull(),
    proposals: text({ mode: 'json' }).$type<unknown>(),
    highlights: text({ mode: 'json' }).$type<string[]>(),
    concerns: text({ mode: 'json' }).$type<string[]>(),
    pdf_path: text(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('weekly_reviews_week_start_uq').on(t.week_start)],
)

/** One Monday–Sunday plan. At most one active row per week_start. `plan` is MCP/LLM-fed: parse with the WeekPlan schema. */
export const week_plans = sqliteTable(
  'week_plans',
  {
    id: id(),
    week_start: text().notNull(),
    author: text({ enum: WEEK_PLAN_AUTHOR }).notNull(),
    status: text({ enum: WEEK_PLAN_STATUS }).notNull().default('proposed'),
    plan: text({ mode: 'json' }).$type<unknown>().notNull(),
    plan_version_id: text().references(() => plan_versions.id),
    review_id: text().references(() => weekly_reviews.id),
    ...timestamps(),
  },
  (t) => [
    index('week_plans_week_start_idx').on(t.week_start),
    uniqueIndex('week_plans_active_week_uq')
      .on(t.week_start)
      .where(sql`status = 'active'`),
  ],
)

/** Materialised per local date from the active plan version and the active week plan. The spine of v_day. */
export const daily_targets = sqliteTable(
  'daily_targets',
  {
    id: id(),
    date: text().notNull(),
    plan_version_id: text()
      .notNull()
      .references(() => plan_versions.id),
    week_plan_id: text().references(() => week_plans.id),
    kcal: integer().notNull(),
    protein_g: real().notNull(),
    carbs_g: real().notNull(),
    fat_g: real().notNull(),
    fibre_g: real().notNull(),
    water_ml: integer().notNull(),
    steps: integer().notNull(),
    is_fast_day: bool().notNull().default(false),
    training_planned: bool().notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('daily_targets_date_uq').on(t.date)],
)

// ---------------------------------------------------------------------------
// Scans and milestones
// ---------------------------------------------------------------------------
/** One Evolt scan. Metric columns mirror the seed record (seed/scans/2026-09-26.json), in kg/cm/kcal; null until confirmed. */
export const scans = sqliteTable(
  'scans',
  {
    id: id(),
    scanned_at: text().notNull(),
    date: text().notNull(),
    source: text({ enum: values(ScanSource) })
      .notNull()
      .default('evolt360'),
    source_units: text({ enum: values(MassUnit) })
      .notNull()
      .default('lb'),
    storage_path: text(),
    extracted: text({ mode: 'json' }).$type<unknown>(),
    confirmed: bool().notNull().default(false),
    conditions: text({ mode: 'json' }).$type<ScanConditions>(),
    notes: text(),
    height_cm: real(),
    age: integer(),
    sex: text({ enum: values(Sex) }),
    weight_kg: real(),
    lean_body_mass_kg: real(),
    skeletal_muscle_mass_kg: real(),
    protein_kg: real(),
    mineral_kg: real(),
    total_body_water_kg: real(),
    icf_kg: real(),
    ecf_kg: real(),
    body_fat_mass_kg: real(),
    body_fat_pct: real(),
    subcutaneous_fat_kg: real(),
    visceral_fat_kg: real(),
    visceral_fat_area_cm2: real(),
    visceral_fat_level: real(),
    bmr_kcal: integer(),
    tee_kcal: integer(),
    waist_hip_ratio: real(),
    bio_age: integer(),
    bwi_score: real(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [index('scans_date_idx').on(t.date)],
)

export const scan_segments = sqliteTable(
  'scan_segments',
  {
    id: id(),
    scan_id: text()
      .notNull()
      .references(() => scans.id),
    segment: text({ enum: values(ScanSegment) }).notNull(),
    lean_kg: real().notNull(),
    fat_kg: real().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('scan_segments_scan_segment_uq').on(t.scan_id, t.segment)],
)

/** A target value reached at or below `target_value` (all SPEC §3 milestones point down). `segment` is set when kind = 'segment' (torso fat). */
export const milestones = sqliteTable(
  'milestones',
  {
    id: id(),
    kind: text({ enum: MILESTONE_KIND }).notNull(),
    segment: text({ enum: values(ScanSegment) }),
    target_value: real().notNull(),
    label: text().notNull(),
    reached_on: text(),
    scan_id: text().references(() => scans.id),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [index('milestones_reached_on_idx').on(t.reached_on)],
)

export const progress_photos = sqliteTable(
  'progress_photos',
  {
    id: id(),
    taken_at: text().notNull(),
    date: text().notNull(),
    pose: text({ enum: PHOTO_POSE }).notNull(),
    storage_path: text().notNull(),
    /** Pixel size as uploaded (the browser downscaled it); null on photos stored before the columns existed. */
    width: integer(),
    height: integer(),
    weight_kg: real(),
    nearest_scan_id: text().references(() => scans.id),
    note: text(),
    ...timestamps(),
  },
  (t) => [index('progress_photos_date_idx').on(t.date)],
)

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------
/** The library: free-exercise-db (deterministic ids from the slug) plus Aaron's own (`custom`). */
export const exercises = sqliteTable(
  'exercises',
  {
    id: id(),
    slug: text().notNull(),
    name: text().notNull(),
    category: text({ enum: values(ExerciseCategory) }).notNull(),
    equipment: text(),
    mechanic: text({ enum: values(Mechanic) }),
    force: text({ enum: values(Force) }),
    level: text({ enum: values(Level) }).notNull(),
    primary_muscles: text({ mode: 'json' }).$type<Muscle[]>().notNull(),
    secondary_muscles: text({ mode: 'json' }).$type<Muscle[]>().notNull(),
    instructions: text({ mode: 'json' }).$type<string[]>().notNull(),
    image_paths: text({ mode: 'json' }).$type<string[]>().notNull(),
    video_search_url: text(),
    gif_url: text(),
    media: text({ mode: 'json' }).$type<ExerciseMedia>(),
    source: text({ enum: values(Exercise.shape.source) }).notNull(),
    source_id: text(),
    custom: bool().notNull().default(false),
    ...timestamps(),
  },
  (t) => [uniqueIndex('exercises_slug_uq').on(t.slug), index('exercises_equipment_idx').on(t.equipment)],
)

/** Status per library equipment value and per named machine. */
export const equipment_profile = sqliteTable(
  'equipment_profile',
  {
    id: id(),
    equipment: text().notNull(),
    kind: text({ enum: EQUIPMENT_KIND }).notNull().default('library'),
    status: text({ enum: values(EquipmentStatus) }).notNull(),
    note: text(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('equipment_profile_equipment_uq').on(t.equipment)],
)

/** Hard excludes: one exercise (exercise_id) or a whole category, each with a reason. */
export const exercise_exclusions = sqliteTable(
  'exercise_exclusions',
  {
    id: id(),
    exercise_id: text().references(() => exercises.id),
    category: text(),
    reason: text().notNull(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('exercise_exclusions_exercise_uq').on(t.exercise_id),
    uniqueIndex('exercise_exclusions_category_uq').on(t.category),
  ],
)

export const workout_templates = sqliteTable('workout_templates', {
  id: id(),
  name: text().notNull(),
  origin: text({ enum: values(TemplateOrigin) })
    .notNull()
    .default('custom'),
  notes: text(),
  muscle_scores: text({ mode: 'json' }).$type<MuscleScores>(),
  ...timestamps(),
})

export const template_exercises = sqliteTable(
  'template_exercises',
  {
    id: id(),
    template_id: text()
      .notNull()
      .references(() => workout_templates.id),
    exercise_id: text()
      .notNull()
      .references(() => exercises.id),
    sort_order: integer().notNull(),
    sets: integer().notNull(),
    rep_min: integer().notNull(),
    rep_max: integer().notNull(),
    target_load_kg: real(),
    rest_sec: integer(),
    note: text(),
    ...timestamps(),
  },
  (t) => [index('template_exercises_template_id_idx').on(t.template_id)],
)

/**
 * One gym visit. Done = ended_at set. `readiness` is the score at start; `plan` is the start snapshot (the planned
 * exercises, the recovery rule and the deload check), parsed with its schema on read (training module).
 */
export const workout_sessions = sqliteTable(
  'workout_sessions',
  {
    id: id(),
    date: text().notNull(),
    template_id: text().references(() => workout_templates.id),
    started_at: text().notNull(),
    ended_at: text(),
    origin: text({ enum: values(SessionOrigin) })
      .notNull()
      .default('blank'),
    readiness: text({ mode: 'json' }).$type<unknown>(),
    plan: text({ mode: 'json' }).$type<unknown>(),
    notes: text(),
    muscle_scores: text({ mode: 'json' }).$type<MuscleScores>(),
    prs: text({ mode: 'json' }).$type<unknown>(),
    actor: actor(),
    ...timestamps(),
  },
  (t) => [index('workout_sessions_date_idx').on(t.date)],
)

export const session_sets = sqliteTable(
  'session_sets',
  {
    id: id(),
    session_id: text()
      .notNull()
      .references(() => workout_sessions.id),
    exercise_id: text()
      .notNull()
      .references(() => exercises.id),
    set_index: integer().notNull(),
    reps: integer(),
    load_kg: real(),
    rpe: real(),
    completed: bool().notNull().default(false),
    note: text(),
    ...timestamps(),
  },
  (t) => [
    index('session_sets_session_id_idx').on(t.session_id),
    index('session_sets_exercise_id_idx').on(t.exercise_id),
  ],
)

// ---------------------------------------------------------------------------
// AI, events and system
// ---------------------------------------------------------------------------
/** The job queue and audit trail. Sweep: status='queued' AND run_after <= now ORDER BY priority DESC; requeue 'running' rows past lease_until. */
export const ai_jobs = sqliteTable(
  'ai_jobs',
  {
    id: id(),
    type: text().notNull(),
    status: text({ enum: JOB_STATUS }).notNull().default('queued'),
    priority: integer().notNull().default(0),
    payload: text({ mode: 'json' }).$type<unknown>(),
    result: text({ mode: 'json' }).$type<unknown>(),
    provider: text(),
    model: text(),
    attempts: integer().notNull().default(0),
    error: text(),
    latency_ms: integer(),
    tokens_in: integer(),
    tokens_out: integer(),
    run_after: text().notNull().default(NOW_UTC),
    lease_until: text(),
    ...timestamps(),
  },
  (t) => [index('ai_jobs_status_run_after_idx').on(t.status, t.run_after)],
)

/** Per-provider daily LLM usage (UTC day, matching provider quota resets) for the router's budget guard. */
export const provider_usage = sqliteTable(
  'provider_usage',
  {
    id: id(),
    provider: text().notNull(),
    day: text().notNull(),
    requests: integer().notNull().default(0),
    tokens_in: integer().notNull().default(0),
    tokens_out: integer().notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex('provider_usage_provider_day_uq').on(t.provider, t.day)],
)

/** What the dashboard shows and MCP reads. `body` is LLM/MCP-fed: parse with its Zod schema. */
export const ai_events = sqliteTable(
  'ai_events',
  {
    id: id(),
    kind: text({ enum: EVENT_KIND }).notNull(),
    actor: text({ enum: values(Actor) }).notNull(),
    date: text(),
    summary: text().notNull(),
    body: text({ mode: 'json' }).$type<unknown>(),
    proposal_status: text({ enum: PROPOSAL_STATUS }),
    plan_version_id: text().references(() => plan_versions.id),
    job_id: text().references(() => ai_jobs.id),
    read_at: text(),
    ...timestamps(),
  },
  (t) => [
    index('ai_events_created_at_idx').on(t.created_at),
    index('ai_events_date_idx').on(t.date),
    // A plan version's 'change' event (its guard verdicts, the week-plan switch it records) and the proposals it accepted.
    index('ai_events_plan_version_idx').on(t.plan_version_id),
  ],
)

export const chat_messages = sqliteTable(
  'chat_messages',
  {
    id: id(),
    thread_id: text().notNull(),
    role: text({ enum: CHAT_ROLE }).notNull(),
    content: text().notNull(),
    tool_calls: text({ mode: 'json' }).$type<unknown>(),
    ...timestamps(),
  },
  (t) => [index('chat_messages_thread_idx').on(t.thread_id, t.created_at)],
)

export const push_subscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: id(),
    endpoint: text().notNull(),
    keys: text({ mode: 'json' }).$type<{ p256dh: string; auth: string }>().notNull(),
    kinds: text({ mode: 'json' }).$type<string[]>().notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('push_subscriptions_endpoint_uq').on(t.endpoint)],
)

/** Idempotency for the 5-minute cron's nightly/weekly/monthly work: one row per (kind, Edmonton-local period_key, e.g. '2026-10-05', '2026-W41', '2026-10'). */
export const cron_runs = sqliteTable(
  'cron_runs',
  {
    id: id(),
    kind: text().notNull(),
    period_key: text().notNull(),
    ran_at: text().notNull().default(NOW_UTC),
    ...timestamps(),
  },
  (t) => [uniqueIndex('cron_runs_kind_period_uq').on(t.kind, t.period_key)],
)

/** The dashboard note (set by Aaron or by a review); shown until `until` (local date, inclusive) when set. */
export const app_notes = sqliteTable(
  'app_notes',
  {
    id: id(),
    text: text().notNull(),
    until: text(),
    actor: text({ enum: values(Actor) }).notNull(),
    ...timestamps(),
  },
  (t) => [index('app_notes_until_idx').on(t.until)],
)

// ---------------------------------------------------------------------------
// v_day — hand-written SQL in ./v_day.sql, created by migration 0001_v_day. One row per daily_targets date.
// Intake sums confirmed meals; water sums the day's entries (0 when none); weight/steps/sleep are null when not logged.
// ---------------------------------------------------------------------------
export const v_day = sqliteView('v_day', {
  date: text().notNull(),
  plan_version_id: text().notNull(),
  target_kcal: integer().notNull(),
  target_protein_g: real().notNull(),
  target_carbs_g: real().notNull(),
  target_fat_g: real().notNull(),
  target_fibre_g: real().notNull(),
  target_water_ml: integer().notNull(),
  target_steps: integer().notNull(),
  is_fast_day: bool().notNull(),
  training_planned: bool().notNull(),
  weight_kg: real(),
  intake_kcal: real().notNull(),
  intake_protein_g: real().notNull(),
  intake_carbs_g: real().notNull(),
  intake_fat_g: real().notNull(),
  intake_fibre_g: real().notNull(),
  meals_logged: integer().notNull(),
  water_ml: integer().notNull(),
  steps: integer(),
  active_kcal: integer(),
  asleep_min: integer(),
  fasted: bool().notNull(),
  sessions_done: integer().notNull(),
}).existing()
