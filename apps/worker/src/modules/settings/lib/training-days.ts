// Owns: training days as an AI proposal (plan 2026-10-14-ai-runs-train-three-day-week, Task 3) — the days in week order,
// and the pending `training_days` proposal Ask AI's change becomes (the new days, and the days it replaces as `before`).
// One pending days change at a time: proposing the same days again returns the waiting proposal, and other days
// withdraw it (rejected) in the batch that writes the new one. Saving the days is the settings edit (index.ts).
import { Weekday, type PlanWeekResult } from '@fitness/shared/schemas'
import { and, eq, ne, sql } from 'drizzle-orm'
import { ai_events } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'

/** What a days change did (PlanWeekResult.training_days), with the days in week order. */
export type TrainingDaysResult = PlanWeekResult['training_days'] & { training_days: Weekday[] }

/** Each day once, Mon → Sun. */
export function weekOrder(days: readonly Weekday[]): Weekday[] {
  return Weekday.options.filter((d) => days.includes(d))
}

const sameDays = (a: readonly Weekday[], b: readonly Weekday[]) => a.length === b.length && a.every((d, i) => d === b[i])
const label = (days: readonly Weekday[]) => (days.length ? days.map((d) => d[0]!.toUpperCase() + d.slice(1)).join(', ') : 'none')

const pendingDays = and(
  eq(ai_events.kind, 'proposal'),
  eq(ai_events.proposal_status, 'pending'),
  sql`json_extract(${ai_events.body}, '$.kind') = 'training_days'`,
)

/**
 * Store `training_days` (week order) as a pending proposal by deps.actor, `before` = the days the settings hold now.
 * Returns the proposal id: the waiting one when it already proposes these days, else a new one written in one db.batch
 * with the rejection of every other pending training_days proposal (decided as events.proposalDecisionUpdate decides).
 */
export async function proposeDays(deps: Deps, input: { training_days: Weekday[]; before: Weekday[] }): Promise<string> {
  const waiting = await deps.db.select({ id: ai_events.id, body: ai_events.body }).from(ai_events).where(pendingDays)
  const same = waiting.find((w) => {
    const days = (w.body as { training_days?: unknown } | null)?.training_days
    return Array.isArray(days) && sameDays(weekOrder(days as Weekday[]), input.training_days)
  })
  if (same) return same.id

  const now = deps.now().toISOString()
  const insert = eventInsert(deps, {
    kind: 'proposal',
    summary: `Training days: ${label(input.training_days)} (now ${label(input.before)})`,
    body: { kind: 'training_days', training_days: input.training_days, before: input.before },
    proposal_status: 'pending',
  })
  await deps.db.batch([
    deps.db
      .update(ai_events)
      .set({ proposal_status: 'rejected', read_at: now, updated_at: now })
      .where(and(pendingDays, ne(ai_events.id, insert.id))),
    insert.statement,
  ])
  return insert.id
}
