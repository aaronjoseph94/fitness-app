// Owns: week plans (SPEC §8 "Next-week plan", GLOSSARY "Week plan") — one Monday–Sunday each: per-day targets, the
// sessions as template snapshots, water, steps, fasts, scan date and focus note; status proposed → active → superseded.
// The active plan of a week is the source of that week's daily_targets and the Train tab's planned session.
// Interface (REST routes and the tools layer call these; every write records deps.actor):
//   getWeekPlan(deps, date?)          → WeekPlanView     the week holding `date` (default today): active and newest
//        proposed plan, the week's days and last week's (v_day), and what each plan changes from last week
//   listWeekPlans(deps, query)        → WeekPlan[]       newest week first
//   proposeWeekPlan(deps, { id?, week_start, plan, author?, review_id? }) → WeekPlanProposal
//        week_start must be a Monday of a week not over (400 / 422). The guards (lib/check) run as the author
//        (default from deps.actor); any rejected issue stores nothing. Stored as proposed, superseding the week's
//        earlier proposed plans — except that a Gemini draft is not stored when the week already has an active plan
//        or a proposed one by Claude or Aaron. Replaying an id returns the stored plan.
//   applyWeekPlan(deps, id)           → WeekPlanApplied  guards re-run as the author (422 on a rejected issue); the
//        previous active plan superseded, daily_targets of that week rebuilt from today on, one plan version and one
//        'change' event — ONE batch. Applying the active plan again returns it. 403 for actor 'ai' (Aaron taps Accept)
//   revertWeekPlan(deps, id)          → WeekPlanApplied  only the active plan (409 otherwise): the plan it replaced is
//        active again (or the week follows the plan version), as one plan version. 403 for actor 'ai'
//   replaceWeekPlan(deps, { week_start?, templates_by_weekday, focus_note? }) → WeekPlanReplaced   program design:
//        the week's active plan (or one built from the plan version) with those weekdays' sessions set from
//        templates (null = rest), proposed, then applied at once unless the actor is 'ai'
//   todaysPlannedSession(deps, date)  → WeekPlanSession | null   the active plan's session for that date
// MCP writes (actor 'mcp') apply immediately because Aaron approves them in the Claude chat; they are still guarded
// and versioned. Nothing here touches the settings rails.
import { today, weekdayOf, weekStart } from '@fitness/shared/engine'
import type {
  TemplatesByWeekday,
  WeekPlan,
  WeekPlanApplied,
  WeekPlanAuthor,
  WeekPlanContentInput,
  WeekPlanProposal,
  WeekPlanQuery,
  WeekPlanReplaced,
  WeekPlanSession,
  WeekPlanView,
  Weekday,
} from '@fitness/shared/schemas'
import { week_plans } from '../../db'
import type { Deps } from '../../lib/deps'
import { badRequest, HttpError } from '../../lib/http-error'
import { eventInsert } from '../events'
import { applyPlan, assertMayActivate, assertWeekOpen, revertPlan, supersedeStatement } from './lib/activate'
import { basePlan, templateSession } from './lib/base'
import { checkWeekPlan } from './lib/check'
import { ACTOR_OF, AUTHOR_LABEL, AUTHOR_OF, listPlans, requireWeekPlan, weekPlanById, weekState, weekTargets } from './lib/rows'
import { weekView } from './lib/view'

export { weekChanges } from './lib/view'

export function getWeekPlan(deps: Deps, date?: string): Promise<WeekPlanView> {
  return weekView(deps, weekStart(date ?? today(deps.now())))
}

export function listWeekPlans(deps: Deps, query: WeekPlanQuery): Promise<WeekPlan[]> {
  return listPlans(deps, query)
}

export interface ProposeInput {
  /** Client id (REST): replaying it returns the stored plan. */
  id?: string
  /** The Monday the week starts on. */
  week_start: string
  plan: WeekPlanContentInput
  /** Default from deps.actor (mcp → claude_mcp, ai → gemini, user → user). */
  author?: WeekPlanAuthor
  /** The weekly review that drafted it. */
  review_id?: string | null
}

const issues = (xs: readonly { reason: string }[]) => xs.map((x) => x.reason).join('; ')

export async function proposeWeekPlan(deps: Deps, input: ProposeInput): Promise<WeekPlanProposal> {
  if (input.id) {
    const existing = await weekPlanById(deps, input.id)
    if (existing) return { week_plan: existing, rejected: [], adjusted: [], superseded: [], note: null }
  }
  if (weekStart(input.week_start) !== input.week_start)
    throw badRequest(`week_start must be a Monday; the week holding ${input.week_start} starts on ${weekStart(input.week_start)}`)
  assertWeekOpen(deps, input.week_start)
  const author = input.author ?? AUTHOR_OF[deps.actor]
  const { active, proposed } = await weekState(deps, input.week_start)
  if (author === 'gemini') {
    const keep = active ?? proposed.find((p) => p.author !== 'gemini')
    if (keep)
      return {
        week_plan: null,
        rejected: [],
        adjusted: [],
        superseded: [],
        note: `The week of ${input.week_start} already has ${keep.status === 'active' ? 'an active' : 'a proposed'} plan by ${AUTHOR_LABEL[keep.author]}; the draft was not stored`,
      }
  }

  const checked = await checkWeekPlan(deps, { week_start: input.week_start, plan: input.plan, actor: ACTOR_OF[author] })
  if (checked.rejected.length) return { week_plan: null, rejected: checked.rejected, adjusted: checked.adjusted, superseded: [], note: null }

  const id = input.id ?? crypto.randomUUID()
  const now = deps.now().toISOString()
  const superseded = proposed.map((p) => p.id)
  const insert = deps.db.insert(week_plans).values({
    id,
    week_start: input.week_start,
    author,
    status: 'proposed',
    plan: checked.plan,
    plan_version_id: null,
    review_id: input.review_id ?? null,
    created_at: now,
    updated_at: now,
  })
  const text = `${AUTHOR_LABEL[author]} proposed a plan for the week of ${input.week_start}${checked.plan.focus_note ? `: ${checked.plan.focus_note}` : ''}`
  const note = author === 'user' ? [] : [eventInsert(deps, { kind: 'note', summary: text.slice(0, 300), body: { text, week_plan_id: id }, date: today(deps.now()) }).statement]
  await deps.db.batch([insert, ...(superseded.length ? [supersedeStatement(deps, superseded)] : []), ...note])
  return { week_plan: await requireWeekPlan(deps, id), rejected: [], adjusted: checked.adjusted, superseded, note: null }
}

export async function applyWeekPlan(deps: Deps, id: string): Promise<WeekPlanApplied> {
  assertMayActivate(deps)
  const plan = await requireWeekPlan(deps, id)
  if (plan.status === 'active' && plan.plan_version_id)
    return { active: plan, superseded: null, plan_version_id: plan.plan_version_id, targets: await weekTargets(deps, plan.week_start), adjusted: [] }
  assertWeekOpen(deps, plan.week_start)
  const checked = await checkWeekPlan(deps, { week_start: plan.week_start, plan: plan.plan, actor: ACTOR_OF[plan.author] })
  if (checked.rejected.length) throw new HttpError(422, checked.rejected[0]!.rule, `This week plan now breaks a rail: ${issues(checked.rejected)}`, checked.rejected)
  const { active } = await weekState(deps, plan.week_start)
  return applyPlan(deps, { plan, content: checked.plan, current: active, adjusted: checked.adjusted })
}

export async function revertWeekPlan(deps: Deps, id: string): Promise<WeekPlanApplied> {
  assertMayActivate(deps)
  const plan = await requireWeekPlan(deps, id)
  if (plan.status !== 'active')
    throw new HttpError(409, 'not_active', `Only the week's active plan can be reverted; this one is ${plan.status}`)
  assertWeekOpen(deps, plan.week_start)
  return revertPlan(deps, plan)
}

export async function replaceWeekPlan(
  deps: Deps,
  input: { week_start?: string; templates_by_weekday: TemplatesByWeekday; focus_note?: string },
): Promise<WeekPlanReplaced> {
  const week_start = weekStart(input.week_start ?? today(deps.now()))
  assertWeekOpen(deps, week_start)
  const { active } = await weekState(deps, week_start)
  const base = active?.plan ?? (await basePlan(deps, week_start))
  const sessions = { ...base.sessions }
  for (const [weekday, template_id] of Object.entries(input.templates_by_weekday) as [Weekday, string | null | undefined][]) {
    if (template_id === undefined) continue
    sessions[weekday] = template_id === null ? null : await templateSession(deps, template_id)
  }
  const proposal = await proposeWeekPlan(deps, { week_start, plan: { ...base, sessions, focus_note: input.focus_note ?? base.focus_note } })
  if (!proposal.week_plan || deps.actor === 'ai') return { proposal, applied: null }
  return { proposal, applied: await applyWeekPlan(deps, proposal.week_plan.id) }
}

export async function todaysPlannedSession(deps: Deps, date: string): Promise<WeekPlanSession | null> {
  const [active] = await listPlans(deps, { week_start: weekStart(date), status: 'active' })
  return active?.plan.sessions[weekdayOf(date)] ?? null
}
