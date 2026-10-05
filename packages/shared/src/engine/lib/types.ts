// Owns: the engine's input shapes. Domain shapes are the schemas' inferred types (type-only imports, no runtime cost),
// so callers pass schema-typed rows straight in; ExerciseInfo is the engine's own view of an exercise.
import type { Muscle } from '../../schemas/common'
import type { DaySummary } from '../../schemas/day'
import type { Nutrients } from '../../schemas/nutrition'
import type { PlanTargets, TargetValues } from '../../schemas/plan'

/** One day's target values (`TargetValues` in schemas/plan). */
export type TargetValuesLike = TargetValues

/** A target a change can move. */
export type TargetField = keyof TargetValuesLike

/** `plan_versions.targets`: defaults for every day plus per-weekday overrides (`PlanTargets`). */
export type PlanTargetsLike = PlanTargets

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

/** Macro and energy totals (`Nutrients`). */
export type NutrientsLike = Nutrients

/**
 * One day as `v_day` gives it, with the trend merged in (a subset of `DaySummary`; targets only as far as read).
 * `meals_logged` counts confirmed meals; `intake` is their total (0 on a fast day with nothing logged).
 */
export type DayRow = Pick<
  DaySummary,
  'date' | 'weight_kg' | 'trend_kg' | 'intake' | 'meals_logged' | 'water_ml' | 'steps' | 'sleep_min' | 'is_fast_day' | 'sessions_done'
> & { targets: Pick<TargetValues, 'protein_g' | 'steps'> | null }
