// Owns: a goal change as an AI proposal (plan partitioned-discovering-salamander, "Goal proposals") — the checks a new
// goal weight / goal date must pass against the profile, and the pending `goal_change` proposal it becomes (the new
// goals, the goals it replaces as `before`, the AI's `reason`). One pending goal change at a time: proposing the same
// goals again returns the waiting proposal, and other goals withdraw it (rejected) in the batch that writes the new
// one. Saving the goals is the settings edit (index.ts).
import { GOAL_WEIGHT_KG, ProposalBody, type Profile } from '@fitness/shared/schemas'
import { and, eq, ne, sql } from 'drizzle-orm'
import { ai_events } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError } from '../../../lib/http-error'
import { eventInsert } from '../../events'

/** The goals a change asks for: null = that goal stays as it is. */
export interface GoalChangeInput {
  goal_weight_kg: number | null
  goal_date: string | null
  reason?: string
}

/** The goals as the profile holds them. */
export type Goals = Pick<Profile, 'goal_weight_kg' | 'goal_date'>

/** The body's `reason` (shared ProposalBody: ≤ 300 chars). */
const REASON_MAX = 300

const refused = (message: string) => new HttpError(422, 'goal_refused', message)

/**
 * The checks a goal change passes, against the profile now and today (Edmonton):
 *   at least one of goal_weight_kg / goal_date is given and differs from the profile's
 *   40 ≤ goal_weight_kg ≤ 200 and goal_weight_kg < start_weight_kg
 *   goal_date > today
 * 422 goal_refused, saying which, when one fails. Returns the change with an unchanged goal as null.
 */
export function checkGoalChange(p: Profile, input: GoalChangeInput, today: string): GoalChangeInput {
  const weight =
    input.goal_weight_kg !== null && input.goal_weight_kg !== p.goal_weight_kg ? input.goal_weight_kg : null
  const date = input.goal_date !== null && input.goal_date !== p.goal_date ? input.goal_date : null
  if (weight === null && date === null)
    throw refused(
      `That is already the goal (${p.goal_weight_kg} kg by ${p.goal_date}): name a new goal weight or goal date`,
    )
  if (weight !== null && (weight < GOAL_WEIGHT_KG.min || weight > GOAL_WEIGHT_KG.max))
    throw refused(`A goal weight must be ${GOAL_WEIGHT_KG.min}–${GOAL_WEIGHT_KG.max} kg (not ${weight} kg)`)
  if (weight !== null && weight >= p.start_weight_kg)
    throw refused(`The goal weight (${weight} kg) must be below the start weight (${p.start_weight_kg} kg)`)
  if (date !== null && date <= today) throw refused(`The goal date (${date}) must be after today (${today})`)
  return { goal_weight_kg: weight, goal_date: date, ...(input.reason ? { reason: input.reason } : {}) }
}

const pendingGoals = and(
  eq(ai_events.kind, 'proposal'),
  eq(ai_events.proposal_status, 'pending'),
  sql`json_extract(${ai_events.body}, '$.kind') = 'goal_change'`,
)

const label = (weight: number | null, date: string | null, before: Goals) =>
  [
    weight !== null ? `goal ${weight} kg (now ${before.goal_weight_kg} kg)` : null,
    date !== null ? `goal date ${date} (now ${before.goal_date})` : null,
  ]
    .filter(Boolean)
    .join(', ')

/**
 * Store a checked change as a pending goal_change proposal by deps.actor, `before` = the profile's goals now. Returns
 * the proposal id: the waiting one when it already proposes these goals, else a new one written in one db.batch with
 * the rejection of every other pending goal_change proposal.
 */
export async function proposeGoals(deps: Deps, change: GoalChangeInput, before: Goals): Promise<string> {
  const waiting = await deps.db
    .select({ id: ai_events.id, body: ai_events.body })
    .from(ai_events)
    .where(pendingGoals)
  const same = waiting.find((w) => {
    const body = ProposalBody.safeParse(w.body)
    return (
      body.success &&
      body.data.kind === 'goal_change' &&
      body.data.goal_weight_kg === change.goal_weight_kg &&
      body.data.goal_date === change.goal_date
    )
  })
  if (same) return same.id

  const now = deps.now().toISOString()
  const reason = change.reason?.trim().slice(0, REASON_MAX)
  const insert = eventInsert(deps, {
    kind: 'proposal',
    summary: `Goal change: ${label(change.goal_weight_kg, change.goal_date, before)}`,
    body: {
      kind: 'goal_change',
      goal_weight_kg: change.goal_weight_kg,
      goal_date: change.goal_date,
      before: { goal_weight_kg: before.goal_weight_kg, goal_date: before.goal_date },
      ...(reason ? { reason } : {}),
    },
    proposal_status: 'pending',
  })
  await deps.db.batch([
    deps.db
      .update(ai_events)
      .set({ proposal_status: 'rejected', read_at: now, updated_at: now })
      .where(and(pendingGoals, ne(ai_events.id, insert.id))),
    insert.statement,
  ])
  return insert.id
}
