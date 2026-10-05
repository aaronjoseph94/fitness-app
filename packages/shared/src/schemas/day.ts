// Owns: the day — DayView (GET /api/day/:date, what Today and get_today show), DaySummary (one v_day row, the
// series behind the Progress charts) and the dashboard note.
import * as z from 'zod'
import { Actor, Count, DateRange, Instant, Kcal, Kg, LocalDate, MealSlot, Minutes, Ml, Row } from './common'
import { Proposal } from './events'
import { Fast, FastState } from './fasting'
import { SleepLog } from './health'
import { Nutrients, Remaining } from './nutrition'
import { DailyTargets, Forecast, TargetValues } from './plan'
import { SessionBrief, VolumeKg } from './training'
import { WeekPlanSession } from './week-plan'

/** A coach note pinned to the top of Today until `until` (or until replaced). */
export const DashboardNote = Row.extend({
  text: z.string().min(1).max(1000),
  until: Instant.nullable(),
  actor: Actor,
})
export type DashboardNote = z.infer<typeof DashboardNote>

/** Response of GET /api/notes: the note showing now, if any. */
export const NoteResponse = z.object({ note: DashboardNote.nullable() })
export type NoteResponse = z.infer<typeof NoteResponse>

/**
 * Everything for one local date. `sleep` is last night (the sleep log whose wake date is this date); `remaining` is
 * targets − intake (null without targets); `planned_session` comes from the active week plan.
 */
export const DayView = z.object({
  date: LocalDate,
  targets: DailyTargets.nullable(),
  intake: z.object({ total: Nutrients, by_slot: z.partialRecord(MealSlot, Nutrients), meals_logged: Count }),
  remaining: Remaining.nullable(),
  water_ml: Ml,
  steps: Count.nullable(),
  sleep: SleepLog.nullable(),
  fast: z.object({ state: FastState, fast: Fast.nullable(), is_fast_day: z.boolean() }),
  weight: z.object({ raw_kg: Kg.nullable(), trend_kg: Kg.nullable(), change_7d_kg: z.number().nullable() }),
  forecast: Forecast.nullable(),
  session: SessionBrief.nullable(),
  planned_session: WeekPlanSession.nullable(),
  proposals: z.object({ pending_count: Count, latest: Proposal.nullable() }),
  note: DashboardNote.nullable(),
})
export type DayView = z.infer<typeof DayView>

/**
 * One `v_day` row plus the trend: the per-day series the Progress charts and the weekly review read.
 * Logging adherence for a day = weight_kg ≠ null ∧ (meals_logged ≥ 2 ∨ is_fast_day) ∧ water_ml > 0.
 */
export const DaySummary = z.object({
  date: LocalDate,
  weight_kg: Kg.nullable(),
  trend_kg: Kg.nullable(),
  intake: Nutrients,
  kcal_by_slot: z.partialRecord(MealSlot, Kcal),
  meals_logged: Count,
  water_ml: Ml,
  steps: Count.nullable(),
  active_kcal: Kcal.nullable(),
  sleep_min: Minutes.nullable(),
  in_bed_at: Instant.nullable(),
  is_fast_day: z.boolean(),
  sessions_done: Count,
  volume_kg: VolumeKg,
  targets: TargetValues.nullable(),
})
export type DaySummary = z.infer<typeof DaySummary>

const DAY_MS = 86_400_000
const MAX_DAYS = 400

/** Query of GET /api/days: at most 400 days (to − from < 400 × 86,400,000 ms). */
export const DaysQuery = DateRange.refine((r) => Date.parse(r.to) - Date.parse(r.from) < MAX_DAYS * DAY_MS, {
  message: `At most ${MAX_DAYS} days`,
  path: ['to'],
})
export type DaysQuery = z.infer<typeof DaysQuery>
