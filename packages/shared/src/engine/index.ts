// Owns: the engine's interface (SPEC §3, §7, §9) — pure, typed functions for every number in the app. Implementation
// lives in ./lib (private); guards.ts is the second entry point (SPEC §9 names it) and is re-exported here.
// Inputs are plain data structurally compatible with the schemas (v_day rows, plan targets, sessions, scans).

// Dates in America/Edmonton
export {
  TIMEZONE,
  localDate,
  localMidnight,
  today,
  localTime,
  addDays,
  daysBetween,
  weekdayOf,
  weekStart,
  isoWeek,
  isoWeekRange,
  eachDate,
} from './lib/dates'
export type { InstantInput } from './lib/dates'

// Units
export { KG_PER_LB, CM_PER_IN, lbToKg, kgToLb, inToCm, cmToIn } from './lib/units'

// Shared input shapes
export type { TargetValuesLike, PlanTargetsLike, ExerciseInfo, NutrientsLike, DayRow } from './lib/types'

// Trend weight, expenditure, forecast
export { trendWeights, trendChange, TREND_ALPHA } from './lib/trend'
export type { TrendDay, TrendSample } from './lib/trend'
export { estimateExpenditure, isLoggedIntakeDay, EXPENDITURE_WINDOW_DAYS, MIN_LOGGED_DAYS, TDEE_RANGE } from './lib/expenditure'
export type { ExpenditureDay, ExpenditureEstimate } from './lib/expenditure'
export { forecast, KCAL_PER_KG, FORECAST_BAND } from './lib/forecast'
export type { ForecastInput, ForecastResult } from './lib/forecast'

// Daily targets
export { materialiseTargets, meanPlannedIntake, fastDay, holdMacros, FAST_DAY_EXTRA_WATER_ML } from './lib/targets'
export type { TargetsInput, DayTargets, WeekPlanLike, FastWindowLike } from './lib/targets'

// Food maths: portions, scaling, meal totals
export { portion, scaleNutrients, sumNutrients } from './lib/nutrition'
export type { Per100gLike } from './lib/nutrition'

// Adherence, safety flags, milestones, weekly review metrics
export { dayAdherence, adherence } from './lib/adherence'
export type { AdherenceDay, DayAdherence, AdherenceWindow } from './lib/adherence'
export { safetyFlags } from './lib/flags'
export type { SafetyFlag } from './lib/flags'
export { milestones, WEIGHT_MILESTONES_KG } from './lib/milestones'
export type { MilestoneDefinition, MilestoneStatus, CompositionScan } from './lib/milestones'
export { weeklyMetrics } from './lib/review'
export type { WeekAggregate, FastLike, FastResult } from './lib/review'

// Scans
export { compareScans, LEAN_LOSS_SHARE } from './lib/scans'
export type { ScanLike, ScanComparison, ScanMetricKey } from './lib/scans'

// Training: readiness, progression, deload, recovery, muscle scores, volume, e1RM, PRs
export { readiness } from './lib/readiness'
export type { ReadinessScore } from './lib/readiness'
export { nextProgression, deloadCheck, recoveryConflicts, DELOAD_SETS_FACTOR } from './lib/progression'
export type { LoggedSet, ProgressionInput, Progression, DeloadInput, DeloadCheck } from './lib/progression'
export { muscleScores, muscleLevels, e1rm, sessionSummary } from './lib/muscles'
export type { MuscleValues, MuscleLevel, SessionSetLike, PrRecord, SessionSummaryInput, SessionTotals } from './lib/muscles'

// Training: the weekly upper / lower split, and swap candidates (same primary muscle, same kind of lift)
export { splitSlots, splitSlot } from './lib/split'
export type { SplitSlotLike } from './lib/split'
export { swapCandidates, swapScore } from './lib/swap'
export type { SwapInfo } from './lib/swap'

// Guards (SPEC §9: packages/shared/engine/guards.ts)
export { applyGuards, targetValue, KCAL_STEP, SESSION_SETS, LOCKED_SETTINGS } from './guards'
export type {
  GuardChange,
  TargetChange,
  WorkoutChange,
  ExerciseSwapChange,
  FastChange,
  OpenChange,
  GuardRails,
  GuardContext,
  GuardRule,
  GuardResult,
} from './guards'
