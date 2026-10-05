// Owns: switching a week's active plan as ONE db.batch — applying a plan (the previous active one superseded) or
// reverting the active one (the plan it replaced restored, else the week handed back to the plan version). Each switch
// is one plan version through the plan module (reason, diff, the week's daily_targets rebuilt from today on, a
// reforecast job) and its 'change' event, whose body records the switch — week_plan: { action, id, week_start,
// replaced_id | restored_id } — so a later revert finds the plan an apply replaced. Applying a plan with a scan date
// (today or later, not already the due date) schedules the next scan in the same batch (scans.scanDateNote), so the
// reminder, the nightly due note and the Scans page follow it.
import { addDays, isoWeek, today } from '@fitness/shared/engine'
import type { WeekPlan, WeekPlanApplied, WeekPlanContent, WeekPlanIssue } from '@fitness/shared/schemas'
import { and, eq, gte, inArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import * as z from 'zod'
import { ai_events, plan_versions, week_plans } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { proposalDecisionUpdate } from '../../events'
import { runSoon } from '../../jobs'
import { weekPlanVersion } from '../../plan'
import { scanDateNote, scanSchedule } from '../../scans'
import { AUTHOR_LABEL, weekPlanById } from './rows'

/** The part of a plan version's 'change' event body a switch writes. */
const SwitchRecord = z.object({
  week_plan: z.object({ action: z.enum(['apply', 'revert']), id: z.string(), replaced_id: z.string().nullable().optional() }),
})

/** A week that has ended keeps its targets: they are history. */
export function assertWeekOpen(deps: Deps, week_start: string): void {
  if (addDays(week_start, 6) < today(deps.now()))
    throw new HttpError(422, 'past_week', `The week of ${week_start} is over; its targets are history and stay as they were`)
}

/** Week plans from the in-app assistant wait for a tap (SPEC §8: target changes never auto-apply for ai). */
export function assertMayActivate(deps: Deps): void {
  if (deps.actor === 'ai')
    throw new HttpError(403, 'needs_tap', 'A week plan from the in-app assistant waits for a tap on Accept in the app; it was left as proposed')
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** The plan that applying `plan` replaced, from the change event of the version that applied it (null: none). */
async function replacedBy(deps: Deps, plan: WeekPlan): Promise<string | null> {
  if (!plan.plan_version_id) return null
  const rows = await deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(
      and(
        gte(ai_events.created_at, sql`(select ${plan_versions.created_at} from ${plan_versions} where ${plan_versions.id} = ${plan.plan_version_id})`),
        eq(ai_events.plan_version_id, plan.plan_version_id),
        eq(ai_events.kind, 'change'),
      ),
    )
  for (const r of rows) {
    const record = SwitchRecord.safeParse(r.body)
    if (record.success && record.data.week_plan.action === 'apply' && record.data.week_plan.id === plan.id) return record.data.week_plan.replaced_id ?? null
  }
  return null
}

async function run(deps: Deps, statements: BatchItem<'sqlite'>[], job_id: string): Promise<void> {
  const [first, ...rest] = statements
  if (first) await deps.db.batch([first, ...rest])
  runSoon(deps, job_id)
}

async function reread(deps: Deps, id: string | null | undefined): Promise<WeekPlan | null> {
  return id ? weekPlanById(deps, id) : null
}

/**
 * Make `plan` (already checked; `content` is its plan after the guards' adjustments) the week's active plan. The
 * week's current active plan is superseded in the same batch. The caller has checked the plan and the actor.
 */
export async function applyPlan(
  deps: Deps,
  input: { plan: WeekPlan; content: WeekPlanContent; current: WeekPlan | null; adjusted: WeekPlanIssue[] },
): Promise<WeekPlanApplied> {
  const { plan, content, current } = input
  const week = isoWeek(plan.week_start)
  const who = AUTHOR_LABEL[plan.author]
  const v = await weekPlanVersion(deps, {
    week_start: plan.week_start,
    week_plan: { id: plan.id, plan: content },
    reason: clip(`Week plan ${week} (${who}) applied${content.focus_note ? `: ${content.focus_note}` : ''}`, 480),
    summary: `Week plan ${week} by ${who} is now active${current ? ` (replaces the one by ${AUTHOR_LABEL[current.author]})` : ''}`,
    extra: { week_plan: { action: 'apply', id: plan.id, week_start: plan.week_start, replaced_id: current?.id ?? null } },
  })
  const now = deps.now().toISOString()
  const scan = content.scan_date && content.scan_date >= today(deps.now()) ? content.scan_date : null
  const scheduleScan = scan !== null && (await scanSchedule(deps)).due !== scan
  await run(
    deps,
    [
      ...v.statements,
      ...(scheduleScan ? [scanDateNote(deps, scan)] : []),
      // Supersede first: at most one active row per week (week_plans_active_week_uq).
      ...(current ? [deps.db.update(week_plans).set({ status: 'superseded', updated_at: now }).where(eq(week_plans.id, current.id))] : []),
      deps.db
        .update(week_plans)
        .set({ status: 'active', plan: content, plan_version_id: v.plan_version.id, updated_at: now })
        .where(eq(week_plans.id, plan.id)),
      // An Ask AI plan's pending proposal shares the plan's id (no-op for plans proposed without one).
      proposalDecisionUpdate(deps, plan.id, { status: 'accepted', plan_version_id: v.plan_version.id }),
    ],
    v.job_id,
  )
  return {
    active: await reread(deps, plan.id),
    superseded: await reread(deps, current?.id),
    plan_version_id: v.plan_version.id,
    targets: v.targets,
    adjusted: input.adjusted,
  }
}

/**
 * Revert the week's active plan: the plan its apply replaced becomes active again (keeping the version that first
 * applied it, so reverting again walks further back), or, when it replaced none, the week goes back to the plan
 * version's targets and training days.
 */
export async function revertPlan(deps: Deps, plan: WeekPlan): Promise<WeekPlanApplied> {
  const previousId = await replacedBy(deps, plan)
  const previous = previousId ? await weekPlanById(deps, previousId) : null
  const restore = previous && previous.week_start === plan.week_start && previous.status === 'superseded' ? previous : null
  const week = isoWeek(plan.week_start)
  const v = await weekPlanVersion(deps, {
    week_start: plan.week_start,
    week_plan: restore && { id: restore.id, plan: restore.plan },
    reason: `Week plan ${week} (${AUTHOR_LABEL[plan.author]}) reverted${restore ? `; the plan by ${AUTHOR_LABEL[restore.author]} is back` : '; the week follows the plan version again'}`,
    summary: `Week plan ${week} reverted${restore ? ` to the one by ${AUTHOR_LABEL[restore.author]}` : ''}`,
    extra: { week_plan: { action: 'revert', id: plan.id, week_start: plan.week_start, restored_id: restore?.id ?? null } },
  })
  const now = deps.now().toISOString()
  await run(
    deps,
    [
      ...v.statements,
      deps.db.update(week_plans).set({ status: 'superseded', updated_at: now }).where(eq(week_plans.id, plan.id)),
      ...(restore ? [deps.db.update(week_plans).set({ status: 'active', updated_at: now }).where(eq(week_plans.id, restore.id))] : []),
    ],
    v.job_id,
  )
  return {
    active: await reread(deps, restore?.id),
    superseded: await reread(deps, plan.id),
    plan_version_id: v.plan_version.id,
    targets: v.targets,
    adjusted: [],
  }
}

/**
 * Mark proposed plans superseded and reject their pending proposals (an Ask AI plan's proposal shares its id), as
 * statements for the caller's batch.
 */
export const supersedeStatements = (deps: Deps, ids: readonly string[]): BatchItem<'sqlite'>[] =>
  ids.length === 0
    ? []
    : [
        deps.db.update(week_plans).set({ status: 'superseded', updated_at: deps.now().toISOString() }).where(inArray(week_plans.id, [...ids])),
        ...ids.map((id) => proposalDecisionUpdate(deps, id, { status: 'rejected' })),
      ]
