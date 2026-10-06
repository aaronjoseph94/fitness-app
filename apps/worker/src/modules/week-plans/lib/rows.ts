// Owns: week_plans rows ↔ the WeekPlan contract (the plan JSON parsed with its schema on read, since MCP and the LLM
// feed it), the reads every operation starts from, and the author ↔ actor mapping.
import { addDays, today } from '@fitness/shared/engine'
import { WeekPlanContent, type Actor, type DailyTargets, type WeekPlan, type WeekPlanAuthor, type WeekPlanQuery } from '@fitness/shared/schemas'
import { and, asc, between, desc, eq, type SQL } from 'drizzle-orm'
import { daily_targets, week_plans, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { notFound } from '../../../lib/http-error'

export type WeekPlanRow = Row<typeof week_plans>

/**
 * Who wrote a plan, from who is acting: Claude via MCP, the AI (the weekly-review job and Ask AI), or Aaron in the app.
 * `'gemini'` is the shared author *id* for anything an AI wrote — which provider answered is the router's business and
 * changes with the chain (OpenRouter leads it), so it must never surface as a label.
 */
export const AUTHOR_OF: Record<Actor, WeekPlanAuthor> = { mcp: 'claude_mcp', ai: 'gemini', user: 'user' }
/** The actor whose guards a plan passes (the ±150 kcal step binds ai and mcp, not Aaron). */
export const ACTOR_OF: Record<WeekPlanAuthor, Actor> = { claude_mcp: 'mcp', gemini: 'ai', user: 'user' }
/** In event summaries and tool output, which an LLM may read: never Aaron's name, and never a provider's either. */
export const AUTHOR_LABEL: Record<WeekPlanAuthor, string> = { claude_mcp: 'Claude', gemini: 'the AI', user: 'you' }

/** Row → contract, or null when the stored plan no longer matches its schema (skipped, logged). */
export function toWeekPlan(row: WeekPlanRow): WeekPlan | null {
  const plan = WeekPlanContent.safeParse(row.plan)
  if (!plan.success) {
    console.warn(`week_plans ${row.id} does not match its schema; skipped`)
    return null
  }
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    week_start: row.week_start,
    author: row.author,
    status: row.status,
    plan: plan.data,
    plan_version_id: row.plan_version_id,
    review_id: row.review_id,
  }
}

const valid = (rows: readonly WeekPlanRow[]) => rows.flatMap((r) => toWeekPlan(r) ?? [])

export async function weekPlanById(deps: Deps, id: string): Promise<WeekPlan | null> {
  const [row] = await deps.db.select().from(week_plans).where(eq(week_plans.id, id))
  return row ? toWeekPlan(row) : null
}

export async function requireWeekPlan(deps: Deps, id: string): Promise<WeekPlan> {
  const plan = await weekPlanById(deps, id)
  if (!plan) throw notFound('Week plan')
  return plan
}

/** Newest week first, newest change first within a week. */
export async function listPlans(deps: Deps, query: WeekPlanQuery): Promise<WeekPlan[]> {
  const where: SQL[] = []
  if (query.week_start) where.push(eq(week_plans.week_start, query.week_start))
  if (query.status) where.push(eq(week_plans.status, query.status))
  const rows = await deps.db
    .select()
    .from(week_plans)
    .where(and(...where))
    .orderBy(desc(week_plans.week_start), desc(week_plans.updated_at))
    .limit(query.week_start ? 100 : 60)
  return valid(rows)
}

/** The week's active plan and its plans still proposed (newest first). */
export async function weekState(deps: Deps, week_start: string): Promise<{ active: WeekPlan | null; proposed: WeekPlan[] }> {
  const plans = await listPlans(deps, { week_start })
  return { active: plans.find((p) => p.status === 'active') ?? null, proposed: plans.filter((p) => p.status === 'proposed') }
}

/** The week's stored daily targets from today on (past days are history). */
export async function weekTargets(deps: Deps, week_start: string): Promise<DailyTargets[]> {
  const now = today(deps.now())
  const rows = await deps.db
    .select()
    .from(daily_targets)
    .where(between(daily_targets.date, week_start > now ? week_start : now, addDays(week_start, 6)))
    .orderBy(asc(daily_targets.date))
  return rows.map(({ id: _id, created_at: _c, updated_at: _u, ...t }) => t)
}
