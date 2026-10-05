// Owns: the engine's own small input shapes. They are structurally compatible with the domain schemas (plan, training,
// day, scans), so callers pass schema-typed rows straight in, but the engine never imports those schemas.
import type { LocalDate, Muscle, Weekday } from '../../schemas/common'

/** One day's target values (structurally `TargetValues` in schemas/plan). */
export type TargetValuesLike = {
  kcal: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fibre_g: number
  water_ml: number
  steps: number
}

/** A target a change can move. */
export type TargetField = keyof TargetValuesLike

/** `plan_versions.targets`: defaults for every day plus per-weekday overrides (structurally `PlanTargets`). */
export type PlanTargetsLike = {
  defaults: TargetValuesLike
  overrides: Partial<Record<Weekday, Partial<TargetValuesLike> | undefined>>
}

/** What the engine needs to know about a library exercise (structurally a subset of `Exercise`). */
export type ExerciseInfo = {
  id: string
  /** free-exercise-db category ("strength", …). */
  category: string
  /** free-exercise-db equipment ("dumbbell", "machine", "body only", …) or a named machine. */
  equipment: string | null
  primary_muscles: readonly Muscle[]
  secondary_muscles: readonly Muscle[]
  /** In the allowed exercise set (not excluded by equipment status or exclusions). */
  allowed: boolean
}

/** Macro and energy totals (structurally `Nutrients`). */
export type NutrientsLike = { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fibre_g: number }

/**
 * One day as `v_day` gives it, with the trend merged in (structurally a subset of `DaySummary`).
 * `meals_logged` counts confirmed meals; `intake` is their total (0 on a fast day with nothing logged).
 */
export type DayRow = {
  date: LocalDate
  weight_kg: number | null
  trend_kg: number | null
  intake: NutrientsLike
  meals_logged: number
  water_ml: number
  steps: number | null
  sleep_min: number | null
  is_fast_day: boolean
  sessions_done: number
  targets: { protein_g: number; steps: number } | null
}
