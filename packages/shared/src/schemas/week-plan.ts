// Owns: the week plan (one Monday–Sunday: per-day targets, sessions as template snapshots, water, steps, fasts,
// scan date, focus note — SPEC §5 `week_plans.plan` and §8 "Next-week plan") and its create body.
import * as z from 'zod'
import { byWeekday, Count, Id, LocalDate, Ml, Row } from './common'
import { Nutrients } from './nutrition'
import { TemplateExerciseInput } from './training'

export const WeekPlanAuthor = z.enum(['claude_mcp', 'gemini', 'user'])
export type WeekPlanAuthor = z.infer<typeof WeekPlanAuthor>

export const WeekPlanStatus = z.enum(['proposed', 'active', 'superseded'])
export type WeekPlanStatus = z.infer<typeof WeekPlanStatus>

/** A planned session: a snapshot of a template (template_id null when built for this week only). */
export const WeekPlanSession = z.object({
  template_id: Id.nullable(),
  name: z.string().min(1).max(100),
  exercises: z.array(TemplateExerciseInput).min(1).max(20),
})
export type WeekPlanSession = z.infer<typeof WeekPlanSession>

/** `week_plans.plan`. Every weekday has targets; a rest day's session is null. */
export const WeekPlanContent = z.object({
  targets: byWeekday(Nutrients),
  sessions: byWeekday(WeekPlanSession.nullable()),
  water_ml: Ml,
  steps: Count,
  fast_dates: z.array(LocalDate).max(7),
  scan_date: LocalDate.nullable(),
  focus_note: z.string().max(500),
})
export type WeekPlanContent = z.infer<typeof WeekPlanContent>

export const WeekPlan = Row.extend({
  /** The Monday the week starts on. */
  week_start: LocalDate,
  author: WeekPlanAuthor,
  status: WeekPlanStatus,
  plan: WeekPlanContent,
  plan_version_id: Id.nullable(),
  review_id: Id.nullable(),
})
export type WeekPlan = z.infer<typeof WeekPlan>

/** Body of POST /api/week-plans: Aaron's own plan for a week, stored as proposed (author "user"). */
export const WeekPlanCreate = z.object({ id: Id, week_start: LocalDate, plan: WeekPlanContent })
export type WeekPlanCreate = z.infer<typeof WeekPlanCreate>

/** Query of GET /api/week-plans. */
export const WeekPlanQuery = z.object({ week_start: LocalDate.optional(), status: WeekPlanStatus.optional() })
export type WeekPlanQuery = z.infer<typeof WeekPlanQuery>
