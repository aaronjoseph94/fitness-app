// Owns: proposals of kinds other than plan_change — the small registry of handlers that apply (accept) or withdraw
// (reject) them, registered by the module that owns the kind when it loads (training: workout, template_swap;
// week-plans: week_plan; reminders: reminder_time), like registerJobHandler, so the plan module never imports them —
// and safe-list changes (SPEC §9 auto_apply_safe): guarded, then applied at once or stored as a pending proposal.
import { applyGuards, type ExerciseInfo, type ExerciseSwapChange, type OpenChange } from '@fitness/shared/engine'
import type { Proposal, ProposalApplied, ProposalBody, SafeChangeStatus } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { eventInsert, getProposalRow, toProposal } from '../../events'
import type { PlanContext } from './context'

export type HandledKind = Exclude<ProposalBody['kind'], 'plan_change'>
export type ProposalOf<K extends ProposalBody['kind']> = Proposal & { body: Extract<ProposalBody, { kind: K }> }

export interface ProposalOutcome {
  /** The plan version accepting created (a week plan), else null. */
  plan_version_id: string | null
  /** What else it changed. */
  applied: ProposalApplied | null
}

export interface ProposalHandler<K extends HandledKind> {
  /**
   * Apply the pending proposal as `deps` (who accepts; the proposal's author is `proposal.actor`). It may resolve the
   * proposal itself inside its own batch; acceptProposal marks it accepted afterwards either way (a no-op then).
   * Throws an HttpError when it can no longer apply (a rail moved, the template is gone).
   */
  accept: (deps: Deps, proposal: ProposalOf<K>) => Promise<ProposalOutcome>
  /** Withdraw what proposing stored (a proposed week plan is superseded). Optional. */
  reject?: (deps: Deps, proposal: ProposalOf<K>) => Promise<void>
}

const handlers = new Map<HandledKind, ProposalHandler<HandledKind>>()

/** One handler per kind; registering again replaces it (tests). */
export function registerProposalHandler<K extends HandledKind>(kind: K, handler: ProposalHandler<K>): void {
  handlers.set(kind, handler as unknown as ProposalHandler<HandledKind>)
}

export function proposalHandler(kind: HandledKind): ProposalHandler<HandledKind> | undefined {
  return handlers.get(kind)
}

// ── Safe-list changes ──────────────────────────────────────────────────────────────────────────────────────────

/** A change kind on the auto-apply safe list (meal suggestions apply through the day card, not here). */
export type SafeGuardChange = ExerciseSwapChange | (OpenChange & { kind: 'reminder_time' })

export interface SafeChangeInput<T> {
  change: SafeGuardChange
  /** The proposal stored when it may not apply without a tap (its handler applies it on accept). */
  body: ProposalBody
  summary: string
  /** The library with `allowed` flags and the excluded categories (exercise swaps). */
  exercises?: readonly ExerciseInfo[]
  excluded_categories?: readonly string[]
  apply: () => Promise<T>
}

export interface SafeChangeResult<T> {
  status: SafeChangeStatus
  /** What `apply` returned, when it applied now. */
  applied: T | null
  /** The pending proposal (status proposed), or the auto_applied record of an ai change. */
  proposal: Proposal | null
  /** Why the guards dropped it (status rejected). */
  rejected: { rule: string; reason: string }[]
}

/**
 * Guard a safe-list change as deps.actor (engine applyGuards): rejected → nothing happens; allowed without a tap
 * (user, mcp; ai only when settings.auto_apply_safe is on — and an exercise swap only within a primary muscle) →
 * `apply` runs now, and an ai change is recorded as an auto_applied proposal; otherwise it is stored as a pending
 * proposal that waits for Aaron's tap.
 */
export async function safeChange<T>(deps: Deps, ctx: PlanContext, input: SafeChangeInput<T>): Promise<SafeChangeResult<T>> {
  const verdict = applyGuards<SafeGuardChange>([input.change], {
    actor: deps.actor,
    rails: ctx.settings,
    plan: ctx.active.targets,
    exercises: input.exercises ?? [],
    excluded_categories: input.excluded_categories ?? [],
    planned_fast_dates: [],
    auto_apply_safe: ctx.settings.auto_apply_safe,
  })
  const rejected = verdict.rejected.map((r) => ({ rule: r.rule, reason: r.reason }))
  const accepted = verdict.accepted[0]
  if (!accepted) return { status: 'rejected', applied: null, proposal: null, rejected }

  const applied = accepted.auto_apply ? await input.apply() : null
  if (accepted.auto_apply && deps.actor !== 'ai') return { status: 'applied', applied, proposal: null, rejected }
  const p = eventInsert(deps, {
    kind: 'proposal',
    summary: input.summary,
    body: input.body,
    proposal_status: accepted.auto_apply ? 'auto_applied' : 'pending',
  })
  await p.statement
  const row = await getProposalRow(deps, p.id)
  return { status: accepted.auto_apply ? 'applied' : 'proposed', applied, proposal: row && toProposal(row), rejected }
}
