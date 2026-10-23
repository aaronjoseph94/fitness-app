// Owns: the profile (goal and body facts), the settings row (the rails plus app preferences) and their edits.
// Only Aaron edits settings (PATCH /api/settings behind Access); no AI or MCP tool takes these schemas as input.
import * as z from 'zod'
import { Cm, Grams, Kg, LocalDate, Ml, Row, Weekday } from './common'
import { ReminderPrefs } from './push'

export const Sex = z.enum(['male', 'female'])
export type Sex = z.infer<typeof Sex>

export const Profile = Row.extend({
  height_cm: Cm,
  birth_date: LocalDate.nullable(),
  sex: Sex,
  /** IANA zone; always America/Edmonton for Aaron. */
  timezone: z.string().min(1),
  goal_weight_kg: Kg.positive(),
  goal_date: LocalDate,
  start_weight_kg: Kg.positive(),
  start_date: LocalDate,
})
export type Profile = z.infer<typeof Profile>

let zones: ReadonlySet<string> | undefined
/** The IANA zones this runtime knows (`Intl.supportedValuesOf('timeZone')`, plus UTC), built once on first use. */
export function timeZones(): ReadonlySet<string> {
  zones ??= new Set([...Intl.supportedValuesOf('timeZone'), 'UTC'])
  return zones
}

/** An IANA time zone the runtime knows (so `Intl` can compute its local day): "Mars/Base" is refused. */
export const TimeZone = z
  .string()
  .refine((tz) => timeZones().has(tz), { message: 'Pick a time zone from the list, e.g. America/Edmonton.' })

/** Bounds of a goal weight, kg (UX review 2026-10-23: a 200 kg goal read "0.0 kg to the summit"). */
export const GOAL_WEIGHT_KG = { min: 40, max: 200 } as const
const GoalWeightKg = z.number().min(GOAL_WEIGHT_KG.min).max(GOAL_WEIGHT_KG.max)

/** The calorie floor agreed with Aaron's doctor and dietitian. Aaron may set the rail lower; the app warns him first. */
export const AGREED_CALORIE_FLOOR = 1400

/**
 * Every editable profile field (SPEC §3). The whole profile is Aaron's to change: the goal and the start point are
 * facts about him, not derived numbers, so nothing here is read-only. `timezone` must be a zone the runtime knows,
 * and the goal weight is 40–200 kg and below the start weight (checked here when both are sent; the settings module
 * checks a lone one against the stored other).
 */
export const ProfilePatch = Profile.pick({
  height_cm: true,
  birth_date: true,
  sex: true,
  goal_date: true,
  start_weight_kg: true,
  start_date: true,
})
  .extend({ timezone: TimeZone, goal_weight_kg: GoalWeightKg })
  .partial()
  .refine(
    (p) =>
      p.goal_weight_kg === undefined ||
      p.start_weight_kg === undefined ||
      p.goal_weight_kg < p.start_weight_kg,
    { message: 'The goal weight must be below the start weight.', path: ['goal_weight_kg'] },
  )
export type ProfilePatch = z.infer<typeof ProfilePatch>

/** Whole kcal for a daily rail; bounds are sanity limits, the values themselves are Aaron's (1,400 / 1,700). */
const DailyKcal = z.number().int().min(800).max(5000)

export const Settings = Row.extend({
  /** Rail: nothing proposes below it (1,400 kcal, set with Aaron's doctor and dietitian). */
  calorie_floor: DailyKcal,
  /** Rail: review proposals stay at or under it (default 1,700). */
  calorie_ceiling: DailyKcal,
  /** Rail: protein never proposed below this. */
  protein_min_g: Grams.int(),
  /** Rail: fat never proposed below this. */
  fat_min_g: Grams.int(),
  /** Rail (fasting pattern): planned fasts per month (2). */
  fasts_per_month: z.number().int().min(0).max(8),
  /** Rail (fasting pattern): planned fast length in hours (24). */
  fast_hours: z.number().int().min(12).max(72),
  fibre_target_g: Grams.int(),
  water_target_ml: Ml,
  training_days: z.array(Weekday).max(7),
  breakfast_enabled: z.boolean(),
  auto_apply_safe: z.boolean(),
  scan_interval_days: z.number().int().min(7).max(120),
  reminders: ReminderPrefs,
})
export type Settings = z.infer<typeof Settings>

/** The hard limits the guards check every AI/MCP change against (GLOSSARY "Rails"; the allowed exercise set is separate). */
export const Rails = Settings.pick({
  calorie_floor: true,
  calorie_ceiling: true,
  protein_min_g: true,
  fat_min_g: true,
  fasts_per_month: true,
  fast_hours: true,
})
export type Rails = z.infer<typeof Rails>

/** Partial settings edit; when both kcal rails are given the floor must not exceed the ceiling. */
export const SettingsPatch = Settings.omit({ id: true, created_at: true, updated_at: true })
  .partial()
  .refine(
    (p) =>
      p.calorie_floor === undefined ||
      p.calorie_ceiling === undefined ||
      p.calorie_floor <= p.calorie_ceiling,
    {
      message: 'calorie_floor must not exceed calorie_ceiling',
      path: ['calorie_ceiling'],
    },
  )
export type SettingsPatch = z.infer<typeof SettingsPatch>

/** Body of PATCH /api/settings. */
export const SettingsUpdate = z.object({
  settings: SettingsPatch.optional(),
  profile: ProfilePatch.optional(),
})
export type SettingsUpdate = z.infer<typeof SettingsUpdate>

/** Response of GET/PATCH /api/settings. */
export const SettingsView = z.object({ profile: Profile, settings: Settings })
export type SettingsView = z.infer<typeof SettingsView>
