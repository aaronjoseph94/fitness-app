// Owns: the week plan (one Monday–Sunday: per-day targets, sessions as template snapshots, water, steps, fasts,
// scan date, focus note — SPEC §5 `week_plans.plan` and §8 "Next-week plan"), its create body, and what proposing,
// applying and reading a week plan return (the guards' issues, the rebuilt daily targets, last week's actuals).
import * as z from 'zod'
import { byWeekday, Count, Id, Kcal, LocalDate, Ml, Row, Weekday } from './common'
import { Nutrients } from './nutrition'
import { DailyTargets } from './plan'
import { MuscleScores, TemplateExerciseInput } from './training'

export const WeekPlanAuthor = z.enum(['claude_mcp', 'gemini', 'user'])
export type WeekPlanAuthor = z.infer<typeof WeekPlanAuthor>

export const WeekPlanStatus = z.enum(['proposed', 'active', 'superseded'])
export type WeekPlanStatus = z.infer<typeof WeekPlanStatus>

/** A planned session as a proposer writes it: a template snapshot (template_id null when built for this week only). */
export const WeekPlanSessionInput = z.object({
  template_id: Id.nullable().describe('The template this session copies, or null for a session built for this week only'),
  name: z.string().min(1).max(100).describe('Short name, e.g. "Upper A"'),
  exercises: z
    .array(TemplateExerciseInput)
    .min(1)
    .max(20)
    .describe('Exercise ids from the allowed exercise set only; 12–28 sets in total'),
})
export type WeekPlanSessionInput = z.infer<typeof WeekPlanSessionInput>

/** A stored planned session: the snapshot plus the engine's muscle scores (set by the Worker, never by a proposer). */
export const WeekPlanSession = WeekPlanSessionInput.extend({ muscle_scores: MuscleScores.optional() })
export type WeekPlanSession = z.infer<typeof WeekPlanSession>

function weekPlanContent<S extends z.ZodType>(session: S) {
  return z.object({
    targets: byWeekday(Nutrients).describe(
      'Calories and macros per weekday. kcal within the calorie floor and ceiling, protein and fat at or above their minimums; ' +
        'ignored on fast dates (a fast day targets 0 kcal)',
    ),
    sessions: byWeekday(session.nullable()).describe('The training session per weekday; null = rest day'),
    water_ml: Ml.describe('Daily water target in ml (a fast day adds 500 ml)'),
    steps: Count.describe('Daily steps target'),
    fast_dates: z.array(LocalDate).max(7).describe('Planned 24 h fasts inside this week (the fasting pattern allows two a month)'),
    scan_date: LocalDate.nullable().describe('The Evolt scan date when one falls in this week, else null'),
    focus_note: z.string().max(500).describe('One or two sentences on what matters this week'),
  })
}

/** `week_plans.plan` as a proposer writes it (propose_week_plan, POST /api/week-plans, the weekly_review job). */
export const WeekPlanContentInput = weekPlanContent(WeekPlanSessionInput)
export type WeekPlanContentInput = z.infer<typeof WeekPlanContentInput>

/** `week_plans.plan` as stored. Every weekday has targets; a rest day's session is null. */
export const WeekPlanContent = weekPlanContent(WeekPlanSession)
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
export const WeekPlanCreate = z.object({ id: Id, week_start: LocalDate, plan: WeekPlanContentInput })
export type WeekPlanCreate = z.infer<typeof WeekPlanCreate>

/** Query of GET /api/week-plans. */
export const WeekPlanQuery = z.object({ week_start: LocalDate.optional(), status: WeekPlanStatus.optional() })
export type WeekPlanQuery = z.infer<typeof WeekPlanQuery>

/** Query of GET /api/week-plans/view: any date in the week (default: this week). */
export const WeekPlanViewQuery = z.object({ week_start: LocalDate.optional() })
export type WeekPlanViewQuery = z.infer<typeof WeekPlanViewQuery>

// ── Results ────────────────────────────────────────────────────────────────────────────────────────────────────

/** One thing the guards found: `where` is "mon.kcal", "thu.session", "fast_dates", "scan_date", … */
export const WeekPlanIssue = z.object({ where: z.string(), rule: z.string(), reason: z.string() })
export type WeekPlanIssue = z.infer<typeof WeekPlanIssue>

/**
 * Result of proposing a week plan. Any `rejected` issue means nothing was stored (fix and propose again);
 * `adjusted` lists what the guards changed in the stored plan (a kcal move cut to the 150 kcal step).
 */
export const WeekPlanProposal = z.object({
  week_plan: WeekPlan.nullable(),
  rejected: z.array(WeekPlanIssue),
  adjusted: z.array(WeekPlanIssue),
  /** Earlier proposed plans for the same week this one replaced. */
  superseded: z.array(Id),
  /** Why nothing was stored when nothing was rejected (a Gemini draft never replaces a plan by Claude or Aaron). */
  note: z.string().nullable(),
})
export type WeekPlanProposal = z.infer<typeof WeekPlanProposal>

/** Result of applying or reverting a week plan: one plan version, the week's rebuilt daily targets. */
export const WeekPlanApplied = z.object({
  /** The plan now active for the week (null after reverting the week's first plan: back to the plan version). */
  active: WeekPlan.nullable(),
  /** The plan this replaced (the previous active one, or the reverted one). */
  superseded: WeekPlan.nullable(),
  plan_version_id: Id,
  /** The week's daily targets from today on, as rebuilt (past days keep theirs). */
  targets: z.array(DailyTargets),
  adjusted: z.array(WeekPlanIssue),
})
export type WeekPlanApplied = z.infer<typeof WeekPlanApplied>

/** One day of a week as it went (v_day): targets, intake, water, steps, fasts and sessions. */
export const WeekDayActual = z.object({
  date: LocalDate,
  weekday: Weekday,
  target_kcal: Kcal.nullable(),
  intake_kcal: Kcal,
  intake_protein_g: z.number().nonnegative(),
  meals_logged: Count,
  water_ml: Ml,
  steps: Count.nullable(),
  /** A planned fast day (targets). */
  is_fast_day: z.boolean(),
  /** A fast that had begun overlapped the day. */
  fasted: z.boolean(),
  training_planned: z.boolean(),
  sessions_done: Count,
})
export type WeekDayActual = z.infer<typeof WeekDayActual>

/** GET /api/week-plans/view and get_week_plan: a week's plans with this week's and last week's actuals. */
export const WeekPlanView = z.object({
  week_start: LocalDate,
  /** The active plan for the week (the source of its daily targets and planned sessions). */
  active: WeekPlan.nullable(),
  /** The newest proposed plan for the week, awaiting apply. */
  proposed: WeekPlan.nullable(),
  /** The week's days so far (future days: targets, nothing eaten yet). */
  days: z.array(WeekDayActual),
  last_week: z.object({ week_start: LocalDate, plan: WeekPlan.nullable(), days: z.array(WeekDayActual) }),
  /** What each plan changes from last week, one line each. */
  changes: z.object({ active: z.array(z.string()), proposed: z.array(z.string()) }),
})
export type WeekPlanView = z.infer<typeof WeekPlanView>

/** Templates per weekday for replace_week_plan: a template id, null for a rest day; omitted days keep their session. */
export const TemplatesByWeekday = byWeekday(Id.nullable()).partial()
export type TemplatesByWeekday = z.infer<typeof TemplatesByWeekday>

/** Result of replacing a week's sessions: the proposal, and the activation when it applied at once (mcp, user). */
export const WeekPlanReplaced = z.object({ proposal: WeekPlanProposal, applied: WeekPlanApplied.nullable() })
export type WeekPlanReplaced = z.infer<typeof WeekPlanReplaced>
