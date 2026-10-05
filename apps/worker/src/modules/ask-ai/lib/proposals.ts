// Owns: what an Ask AI turn created that waits for Aaron's tap — read off each proposing tool's output (a plan-change,
// workout, reminder-time or template-swap proposal in ai_events, a proposed week plan) — and those refs resolved to
// ChatProposals with their status now, through the events and week-plans modules.
import type { ChatProposal } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { getProposalRow, toProposal } from '../../events'
import { listWeekPlans } from '../../week-plans'
import type { ProposalRef } from './store'

type Out = Record<string, unknown> | null | undefined

const obj = (v: unknown): Out => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)

/** A proposed week plan in a WeekPlanProposal ({ week_plan }) as a ref. */
function weekPlanRef(proposal: Out): ProposalRef[] {
  const plan = obj(proposal?.week_plan)
  const id = str(plan?.id)
  const week_start = str(plan?.week_start)
  return id && week_start && plan?.status === 'proposed' ? [{ type: 'week_plan', id, week_start }] : []
}

/** A proposal event in a tool output as a ref. */
function proposalRef(proposal: unknown): ProposalRef[] {
  const id = str(obj(proposal)?.id)
  return id ? [{ type: 'proposal', id }] : []
}

const READERS: Readonly<Record<string, (out: Out) => ProposalRef[]>> = {
  propose_plan_change: (out) => proposalRef(out?.proposal),
  generate_workout: (out) => {
    const id = str(obj(out?.draft)?.proposal_id)
    return id ? [{ type: 'proposal', id }] : []
  },
  propose_week_plan: (out) => weekPlanRef(out),
  replace_week_plan: (out) => weekPlanRef(obj(out?.proposal)),
  // Safe-list tools: a pending proposal when auto_apply_safe is off (an auto_applied record otherwise, shown as done).
  set_reminder_time: (out) => proposalRef(out?.proposal),
  swap_template_exercise: (out) => proposalRef(out?.proposal),
}

/** What a successful call of `tool` created that waits for a tap. */
export function createdBy(tool: string, output: unknown): ProposalRef[] {
  return READERS[tool]?.(obj(output)) ?? []
}

/** Refs → ChatProposals with their status now, in ref order; refs that no longer resolve are left out. */
export async function resolveProposals(deps: Deps, refs: readonly ProposalRef[]): Promise<Map<string, ChatProposal>> {
  const out = new Map<string, ChatProposal>()
  const weeks = [...new Set(refs.flatMap((r) => (r.type === 'week_plan' ? [r.week_start] : [])))]
  const [events, plans] = await Promise.all([
    Promise.all(refs.flatMap((r) => (r.type === 'proposal' ? [getProposalRow(deps, r.id)] : []))),
    Promise.all(weeks.map((week_start) => listWeekPlans(deps, { week_start }))),
  ])
  for (const row of events) {
    const p = row && toProposal(row)
    if (p) out.set(p.id, { type: 'proposal', id: p.id, summary: p.summary, status: p.proposal_status, body: p.body })
  }
  for (const plan of plans.flat())
    out.set(plan.id, {
      type: 'week_plan',
      id: plan.id,
      week_start: plan.week_start,
      status: plan.status,
      focus_note: plan.plan.focus_note,
    })
  return new Map(refs.flatMap((r) => (out.has(r.id) ? [[r.id, out.get(r.id)!] as const] : [])))
}
