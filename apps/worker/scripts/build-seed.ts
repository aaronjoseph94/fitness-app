// Owns: building apps/worker/seed.generated.sql (gitignored) — Aaron's baseline: profile, rails, baseline scan, milestones, equipment, exercise library + exclusions, plan v1, daily targets, first weigh-in, Canadian Nutrient File foods.
// Run: pnpm --filter @fitness/worker seed:local (builds, then `wrangler d1 execute DB --local --file seed.generated.sql`).
// Idempotent: deterministic ids + INSERT OR IGNORE (Aaron's later edits win: an exclusion he un-hid is a soft-deleted row
// the re-seed leaves alone); library exercises upsert by slug so a new pinned commit syncs.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import * as z from 'zod'
import { exercises as library, type LibraryExercise } from '@fitness/exercises'
import { forecast, localDate, materialiseTargets, TIMEZONE } from '@fitness/shared/engine'
import { ReminderKind, ScanRecord, type ReminderPrefs, type Weekday } from '@fitness/shared/schemas'
import {
  daily_targets,
  equipment_profile,
  exercise_exclusions,
  exercises,
  foods,
  milestones,
  plan_versions,
  profile,
  scan_segments,
  scans,
  settings,
  weight_logs,
  type NewRow,
} from '../src/db'
import { insertSql, seedId } from './lib/seed-sql'

const ROOT = path.resolve(import.meta.dirname, '..')
const SEED_DIR = path.resolve(ROOT, '..', '..', 'seed')
const OUT = path.join(ROOT, 'seed.generated.sql')

// ── Inputs ────────────────────────────────────────────────────────────────────────────────────────────────────

const EquipmentSeed = z.object({
  equipment: z.array(
    z.object({
      equipment: z.string().min(1),
      kind: z.enum(equipment_profile.kind.enumValues),
      status: z.enum(equipment_profile.status.enumValues),
      note: z.string().nullable(),
    }),
  ),
  exclusions: z.object({
    name_patterns: z.array(
      z.object({ pattern: z.string(), reason: z.string(), except_equipment: z.array(z.string()) }),
    ),
    categories: z.array(z.object({ category: z.string(), reason: z.string() })),
    equipment: z.array(z.object({ equipment: z.string(), reason: z.string() })),
  }),
})
type ExclusionRules = z.infer<typeof EquipmentSeed>['exclusions']

const readJson = (rel: string) => JSON.parse(readFileSync(path.join(SEED_DIR, rel), 'utf8')) as unknown
/** SPEC §2 seed record; ScanRecord normalises scanned_at to UTC and fills conditions.hydration with null. */
const scan = ScanRecord.parse(readJson('scans/2026-09-26.json'))
const equipment = EquipmentSeed.parse(readJson('equipment/anytime-fitness.json'))

// ── Aaron's baseline (SPEC §2, §3, §6) ────────────────────────────────────────────────────────────────────────

const START_DATE = '2026-09-26'
const START_KG = 95.1
const GOAL_KG = 65.0
const GOAL_DATE = '2027-08-04'
const TARGETS_THROUGH = '2026-12-31'
const TRAINING_DAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu']
const RAILS = {
  floor: 1400,
  ceiling: 1700,
  protein_min_g: 130,
  fat_min_g: 45,
  fibre_target_g: 30,
  water_target_ml: 3000,
}
const round3 = (n: number) => Math.round(n * 1000) / 1000

// ── Plan v1: the rails as the first targets ───────────────────────────────────────────────────────────────────

/** carbs_g = round((kcal − protein_g × 4 − fat_g × 9) / 4) = round((1,400 − 130 × 4 − 45 × 9) / 4) = 119 g, as the engine's
 *  materialiseTargets rounds the remainder. */
const baselineTargets = {
  kcal: RAILS.floor,
  protein_g: RAILS.protein_min_g,
  carbs_g: Math.round((RAILS.floor - RAILS.protein_min_g * 4 - RAILS.fat_min_g * 9) / 4),
  fat_g: RAILS.fat_min_g,
  fibre_g: RAILS.fibre_target_g,
  water_ml: RAILS.water_target_ml,
  steps: 8000,
}
const planTargets: NewRow<typeof plan_versions>['targets'] = { defaults: baselineTargets, overrides: {} }

/**
 * Baseline forecast (SPEC §3, §9): the engine's forecast from the scan TEE as the first expenditure estimate, stored
 * the way the nightly reforecast stores it (rates to 0.001 kg, whole kcal):
 *   weekly_rate_kg = (2,551 − 1,400) × 7 / 7,700 ≈ 1.046 kg/week;  band ≈ 0.837 … 1.256 kg/week
 *   finish_date    = start_date + ⌈(95.1 − 65.0) / weekly_rate_kg × 7⌉ days
 * The nightly plan_reforecast replaces this once weigh-ins and intake accumulate.
 */
function baselineForecast(): NonNullable<NewRow<typeof plan_versions>['forecast']> {
  const f = forecast({ as_of: START_DATE, tdee_est: scan.tee_kcal, intake_kcal: baselineTargets.kcal, trend_kg: START_KG, goal_kg: GOAL_KG })
  return {
    finish_date: f.finish_date,
    weekly_rate_kg: round3(f.weekly_rate_kg),
    band: { low: round3(f.band.low), high: round3(f.band.high) },
    tdee_est: Math.round(f.tdee_est),
  }
}

/** SPEC §8 reminder defaults: weigh-in 07:00, workout 16:30 on training days, the rest event-driven; all on. */
const DEFAULT_TIMES: Partial<Record<ReminderKind, string>> = { weigh_in: '07:00', workout: '16:30' }
const reminders = Object.fromEntries(
  ReminderKind.options.map((kind) => [kind, { enabled: true, time: DEFAULT_TIMES[kind] ?? null }]),
) as ReminderPrefs

// ── Exercise exclusions: first matching rule wins (name pattern, then category, then equipment) ─────────────

function exclusionReason(ex: LibraryExercise, rules: ExclusionRules): string | null {
  for (const r of rules.name_patterns) {
    if (new RegExp(r.pattern, 'i').test(ex.name) && !r.except_equipment.includes(ex.equipment))
      return r.reason
  }
  return (
    rules.categories.find((c) => c.category === ex.category)?.reason ??
    rules.equipment.find((e) => e.equipment === ex.equipment)?.reason ??
    null
  )
}

// ── Rows ──────────────────────────────────────────────────────────────────────────────────────────────────────

const scanId = seedId(`scan:${START_DATE}`)
const planId = seedId('plan_version:1')
const exerciseId = (slug: string) => seedId(`exercise:${slug}`)

const profileRows: NewRow<typeof profile>[] = [
  {
    id: seedId('profile'),
    height_cm: scan.height_cm,
    birth_date: null, // unknown; age 31 at the baseline scan
    sex: scan.sex,
    timezone: TIMEZONE,
    goal_weight_kg: GOAL_KG,
    goal_date: GOAL_DATE,
    start_weight_kg: START_KG,
    start_date: START_DATE,
  },
]

const settingsRows: NewRow<typeof settings>[] = [
  {
    id: seedId('settings'),
    calorie_floor: RAILS.floor,
    calorie_ceiling: RAILS.ceiling,
    protein_min_g: RAILS.protein_min_g,
    fat_min_g: RAILS.fat_min_g,
    fasts_per_month: 2,
    fast_hours: 24,
    fibre_target_g: RAILS.fibre_target_g,
    water_target_ml: RAILS.water_target_ml,
    training_days: TRAINING_DAYS,
    breakfast_enabled: true,
    auto_apply_safe: false,
    scan_interval_days: 28,
    reminders,
  },
]

const { segments, conditions, scanned_at, ...metrics } = scan
const scanRows: NewRow<typeof scans>[] = [
  {
    ...metrics,
    id: scanId,
    scanned_at,
    date: localDate(scanned_at),
    storage_path: null, // the original sheet image is attached later through the app
    extracted: null, // never LLM-extracted: the record came from SPEC §2
    confirmed: true,
    conditions,
    notes:
      "Sheet nutrition line (the scanner's generic suggestion, reference only; the 1,400 kcal rail wins): 1,857–1,957 kcal, 139–147 g protein. Abdominal circumference not measured.",
  },
]

const segmentRows: NewRow<typeof scan_segments>[] = scan_segments.segment.enumValues.flatMap((segment) => {
  const s = segments[segment]
  return s ? [{ id: seedId(`scan_segment:${START_DATE}:${segment}`), scan_id: scanId, segment, ...s }] : []
})

/** SPEC §3 milestones; all point down (reached when the value is at or below target). */
const milestoneRows: NewRow<typeof milestones>[] = [
  ...[90, 85, 80, 75, 70, 65].map((kg) => ({ kind: 'weight' as const, target_value: kg, label: `${kg} kg` })),
  ...[30, 25, 20].map((pct) => ({
    kind: 'body_fat_pct' as const,
    target_value: pct,
    label: `Body fat under ${pct} %`,
  })),
  { kind: 'visceral_level' as const, target_value: 9, label: 'Visceral fat level 9 or lower' },
  { kind: 'whr' as const, target_value: 0.9, label: 'Waist-to-hip ratio under 0.90' },
  {
    kind: 'segment' as const,
    segment: 'torso' as const,
    target_value: 10.4,
    label: 'Torso fat under 10.4 kg',
  },
].map((m) => ({ ...m, id: seedId(`milestone:${m.kind}:${m.target_value}`) }))

const equipmentRows: NewRow<typeof equipment_profile>[] = equipment.equipment.map((e) => ({
  ...e,
  id: seedId(`equipment:${e.equipment}`),
}))

/** gif_url ('/media/exercises/<id>.gif') and `media` (ExerciseDB provenance) come with the library when a GIF matched. */
const exerciseRows: NewRow<typeof exercises>[] = library.map((ex) => ({
  ...ex,
  id: exerciseId(ex.slug),
  custom: false,
}))

const exclusionRows: NewRow<typeof exercise_exclusions>[] = library.flatMap((ex) => {
  const reason = exclusionReason(ex, equipment.exclusions)
  return reason ? [{ id: seedId(`exclusion:${ex.slug}`), exercise_id: exerciseId(ex.slug), reason }] : []
})

const planRows: NewRow<typeof plan_versions>[] = [
  {
    id: planId,
    version: 1,
    active: true,
    created_by: 'user',
    reason: 'Baseline rails from doctor and dietitian',
    diff: [],
    targets: planTargets,
    forecast: baselineForecast(),
  },
]

/** The engine's materialiseTargets, as every rebuild writes them (no fasts planned yet, no week plan). */
const targetRows: NewRow<typeof daily_targets>[] = materialiseTargets({
  from: START_DATE,
  to: TARGETS_THROUGH,
  plan_version: { id: planId, targets: planTargets },
  rails: { calorie_floor: RAILS.floor, protein_min_g: RAILS.protein_min_g, fat_min_g: RAILS.fat_min_g },
  training_days: TRAINING_DAYS,
  fast_dates: [],
}).map(({ training_load: _load, ...t }) => ({ ...t, id: seedId(`daily_targets:${t.date}`) }))

// ── Canadian Nutrient File foods (seed/foods/cnf.json, built by scripts/build-cnf.ts) ──────────────────────────
// Generic foods for food matching without an API call: source 'cnf', source_id = CNF food code, nutrients per 100 g.

const n = z.number().nullable()
const CnfSeed = z.object({
  columns: z.tuple([
    z.literal('code'),
    z.literal('name'),
    z.literal('group'),
    z.literal('kcal'),
    z.literal('protein_g'),
    z.literal('carbs_g'),
    z.literal('fat_g'),
    z.literal('fibre_g'),
    z.literal('sugar_g'),
    z.literal('sodium_mg'),
    z.literal('serving_g'),
  ]),
  foods: z.array(z.tuple([z.number().int(), z.string().min(1), z.number().int(), z.number(), n, n, n, n, n, n, n])),
})
const cnf = CnfSeed.parse(readJson('foods/cnf.json'))
const cnfRows: NewRow<typeof foods>[] = cnf.foods.map(
  ([code, name, group, kcal, protein_g, carbs_g, fat_g, fibre_g, sugar_g, sodium_mg, serving_g]) => ({
    id: seedId(`food:cnf:${code}`),
    source: 'cnf',
    source_id: String(code),
    barcode: null,
    name,
    brand: null,
    serving_g,
    kcal_per_100g: kcal,
    protein_g: protein_g ?? 0,
    carbs_g: carbs_g ?? 0,
    fat_g: fat_g ?? 0,
    fibre_g: fibre_g ?? 0,
    sugar_g,
    sodium_mg,
    raw: { cnf_food_group: group },
  }),
)

const weightRows: NewRow<typeof weight_logs>[] = [
  {
    id: seedId(`weight_log:${START_DATE}`),
    date: START_DATE,
    weight_kg: START_KG,
    note: 'Baseline weigh-in (Evolt scan day)',
  },
]

// ── Emit (parents before children: D1 enforces foreign keys) ─────────────────────────────────────────────────

const sections: [string, string[]][] = [
  ['profile', insertSql(profile, profileRows, 'ignore')],
  ['settings (the rails)', insertSql(settings, settingsRows, 'ignore')],
  ['baseline scan', insertSql(scans, scanRows, 'ignore')],
  ['scan segments', insertSql(scan_segments, segmentRows, 'ignore')],
  ['milestones', insertSql(milestones, milestoneRows, 'ignore')],
  ['equipment profile', insertSql(equipment_profile, equipmentRows, 'ignore')],
  [
    `exercise library (free-exercise-db, ${library.length})`,
    insertSql(exercises, exerciseRows, {
      target: exercises.slug,
      update: [
        'name',
        'category',
        'equipment',
        'mechanic',
        'force',
        'level',
        'primary_muscles',
        'secondary_muscles',
        'instructions',
        'image_paths',
        'video_search_url',
        'gif_url',
        'media',
        'source_id',
      ],
    }),
  ],
  [`exercise exclusions (${exclusionRows.length})`, insertSql(exercise_exclusions, exclusionRows, 'ignore')],
  ['plan version 1', insertSql(plan_versions, planRows, 'ignore')],
  [`daily targets ${START_DATE} … ${TARGETS_THROUGH}`, insertSql(daily_targets, targetRows, 'ignore')],
  ['first weigh-in', insertSql(weight_logs, weightRows, 'ignore')],
  [`Canadian Nutrient File foods (${cnfRows.length})`, insertSql(foods, cnfRows, 'ignore')],
]

const body = sections.map(([title, statements]) => `-- ${title}\n${statements.join('\n')}`).join('\n\n')
writeFileSync(
  OUT,
  `-- Owns: nothing — GENERATED by apps/worker/scripts/build-seed.ts. Do not edit; do not commit.\n\n${body}\n`,
)
const count = sections.reduce((n, [, s]) => n + s.length, 0)
console.log(
  `seed: ${count} statements → ${path.relative(process.cwd(), OUT)} (${library.length} exercises, ${exclusionRows.length} excluded, ${targetRows.length} target days, ${cnfRows.length} CNF foods)`,
)
