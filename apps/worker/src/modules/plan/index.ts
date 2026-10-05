// Owns: the plan — append-only plan versions (exactly one active), proposals and their accept/reject, the materialised
// daily targets (the v_day spine), and the forecast. Every change is guarded (engine applyGuards) and written as ONE
// db.batch: deactivate old + insert new version + ai_events record + rebuilt daily_targets + a plan_reforecast job.
// Interface:
//   getActivePlan(deps) / listVersions(deps)            → PlanVersion / PlanVersion[] (newest first)
//   createVersion(deps, { changes, reason, created_by? }) → VersionResult   guards as created_by (default deps.actor);
//        rejected changes are recorded on the event (a 'note' when nothing passed); later ≤150 kcal steps become
//        pending proposals due a week apart
//   propose(deps, { changes, reason })                   → ProposalResult   guarded, stored as a pending proposal
//        (its body carries the guards' rejected and scheduled lists, as does a version's change event and the note
//        written when nothing passed; PlanVersion reads them back as `rejected` / `scheduled`)
//   acceptProposal(deps, id) / rejectProposal(deps, id) → ProposalDecision (idempotent replays; 409 on a reversal).
//        plan_change is handled here; every other kind by the handler its module registered:
//   registerProposalHandler(kind, { accept, reject? })   training (workout, template_swap), week-plans (week_plan),
//        reminders (reminder_time) register when they load, so plan never imports them
//   applySafeChange(deps, input)                        → SafeChangeResult  a safe-list change (reminder time,
//        exercise swap): guarded as deps.actor, then applied now or stored as a pending proposal (lib/proposals)
//   restoreVersion(deps, id)                            → PlanVersion      a new version copying an old one's targets
//   materialiseTargets(deps, { from, to? })             → DailyTargets[]   rebuild those dates from the active version,
//        settings, fasts and active week plans (call after any of them changes); `to` defaults to the materialised
//        horizon, max(last date with targets, today + 14)
//   ensureTargetsThrough(deps, date)                    → rows added       start_date … date all have targets
//   weekPlanVersion(deps, { week_start, week_plan, reason, summary, extra }) → statements (not run) making a week
//        plan the source of its week's targets (or, with null, handing the week back to the plan version) as one
//        new version: same targets, diff = the week's target moves from today on, rebuilt daily_targets
//   reforecast(deps, { as_of, reestimate? })            → Forecast         written into the active version
// Registers the 'plan_reforecast' job handler (engine only, no external fetches).
import { addDays, today } from '@fitness/shared/engine'
import type { Actor, DailyTargets, PlanChange, PlanVersion, Proposal, ProposalDecision, WeekPlanContent } from '@fitness/shared/schemas'
import { desc, eq } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { plan_versions } from '../../db'
import type { Deps } from '../../lib/deps'
import { HttpError, notFound } from '../../lib/http-error'
import { eventInsert, getProposalRow, proposalDecisionUpdate, toProposal } from '../events'
import { registerJobHandler, runSoon } from '../jobs'
import { loadPlanContext, loadVerdicts, toPlanVersion, type PlanVersionRow } from './lib/context'
import { reforecast } from './lib/forecast'
import { proposalHandler, safeChange, type HandledKind, type ProposalOf, type SafeChangeInput, type SafeChangeResult } from './lib/proposals'
import { ensureThrough, materialise, newRowTargets, runStatements, targetHorizon } from './lib/targets'
import { applyChanges, guardChanges, versionStatements, type RejectedChange, type ScheduledChange } from './lib/versions'

export type { RejectedChange, ScheduledChange } from './lib/versions'
export {
  registerProposalHandler,
  type ProposalHandler,
  type ProposalOf,
  type ProposalOutcome,
  type SafeChangeInput,
  type SafeChangeResult,
} from './lib/proposals'
export { reforecast }

export interface VersionResult {
  /** The new active version; null when every change broke a rail. */
  plan_version: PlanVersion | null
  rejected: RejectedChange[]
  /** Later steps of a >150 kcal move, stored as pending proposals due `week_offset` weeks from today. */
  scheduled: ScheduledChange[]
}

export interface ProposalResult {
  proposal: Proposal | null
  rejected: RejectedChange[]
  scheduled: ScheduledChange[]
}

export async function getActivePlan(deps: Deps): Promise<PlanVersion> {
  const { active } = await loadPlanContext(deps)
  return toPlanVersion(active, (await loadVerdicts(deps, [active.id])).get(active.id))
}

export async function listVersions(deps: Deps): Promise<PlanVersion[]> {
  const rows = await deps.db.select().from(plan_versions).orderBy(desc(plan_versions.version))
  const verdicts = await loadVerdicts(
    deps,
    rows.map((r) => r.id),
  )
  return rows.map((r) => toPlanVersion(r, verdicts.get(r.id)))
}

const rejectionText = (rejected: readonly RejectedChange[]) => rejected.map((r) => r.reason).join('; ')

/** Statements for one guarded change (a new version, or a rejection note when nothing passed). Not yet executed. */
async function buildChange(
  deps: Deps,
  input: { changes: readonly PlanChange[]; reason: string; created_by?: Actor },
): Promise<{ statements: BatchItem<'sqlite'>[]; result: VersionResult; row: PlanVersionRow | null; job_id: string | null }> {
  const created_by = input.created_by ?? deps.actor
  const ctx = await loadPlanContext(deps)
  const guarded = guardChanges(deps, ctx, input.changes, created_by)
  const { rejected, scheduled } = guarded
  if (guarded.accepted.length === 0) {
    const text = `Plan change rejected: ${rejectionText(rejected) || 'no changes given'}`
    const note = eventInsert(deps, { kind: 'note', summary: text, body: { text, reason: input.reason, rejected, scheduled }, date: today(deps.now()) })
    return { statements: [note.statement], result: { plan_version: null, rejected, scheduled }, row: null, job_id: null }
  }
  const v = await versionStatements(deps, ctx, {
    targets: applyChanges(ctx.active.targets, guarded.accepted),
    reason: input.reason,
    created_by,
    extra: { rejected, scheduled },
  })
  return {
    statements: [...v.statements, ...guarded.statements],
    result: { plan_version: toPlanVersion(v.row, { rejected, scheduled }), rejected, scheduled },
    row: v.row,
    job_id: v.job_id,
  }
}

/** Apply plan changes now as a new active version (Aaron's edits, MCP writes, accepted proposals). */
export async function createVersion(
  deps: Deps,
  input: { changes: readonly PlanChange[]; reason: string; created_by?: Actor },
): Promise<VersionResult> {
  const built = await buildChange(deps, input)
  await runStatements(deps, built.statements)
  if (built.job_id) runSoon(deps, built.job_id)
  return built.result
}

/** Store guarded plan changes as a pending proposal (actor deps.actor); nothing applies until it is accepted. */
export async function propose(deps: Deps, input: { changes: readonly PlanChange[]; reason: string }): Promise<ProposalResult> {
  const ctx = await loadPlanContext(deps)
  const g = guardChanges(deps, ctx, input.changes, deps.actor)
  if (g.accepted.length === 0) {
    const text = `Proposal dropped: ${rejectionText(g.rejected) || 'no changes given'}`
    await eventInsert(deps, {
      kind: 'note',
      summary: text,
      body: { text, reason: input.reason, rejected: g.rejected, scheduled: [] },
      date: today(deps.now()),
    }).statement
    return { proposal: null, rejected: g.rejected, scheduled: [] }
  }
  const p = eventInsert(deps, {
    kind: 'proposal',
    summary: input.reason,
    body: { kind: 'plan_change', changes: g.accepted, rejected: g.rejected, scheduled: g.scheduled },
    proposal_status: 'pending',
  })
  await runStatements(deps, [p.statement, ...g.statements])
  const row = await getProposalRow(deps, p.id)
  return { proposal: row ? toProposal(row) : null, rejected: g.rejected, scheduled: g.scheduled }
}

async function versionById(deps: Deps, id: string | null): Promise<PlanVersion | null> {
  if (!id) return null
  const [row] = await deps.db.select().from(plan_versions).where(eq(plan_versions.id, id))
  return row ? toPlanVersion(row, (await loadVerdicts(deps, [id])).get(id)) : null
}

async function loadProposal(deps: Deps, id: string) {
  const row = await getProposalRow(deps, id)
  if (!row) throw notFound('Proposal')
  const proposal = toProposal(row)
  if (!proposal) throw new HttpError(422, 'invalid_proposal', 'The stored proposal does not match its schema')
  return { row, proposal }
}

async function decided(deps: Deps, id: string, fallback: Proposal) {
  const after = await getProposalRow(deps, id)
  return (after && toProposal(after)) ?? fallback
}

/**
 * Accept: a plan_change proposal becomes a new version (guards re-run as the proposal's author, since rails may have
 * moved) and the proposal is marked accepted in the same batch; any other kind goes to its registered handler (which
 * re-checks what it applies), then is marked accepted. Replaying an accepted proposal returns it again.
 */
export async function acceptProposal(deps: Deps, id: string): Promise<ProposalDecision> {
  const { row, proposal } = await loadProposal(deps, id)
  if (row.proposal_status === 'accepted' || row.proposal_status === 'auto_applied')
    return { proposal, plan_version: await versionById(deps, row.plan_version_id), applied: null }
  if (row.proposal_status === 'rejected') throw new HttpError(409, 'proposal_rejected', 'This proposal was already rejected')
  if (proposal.body.kind !== 'plan_change') {
    const kind: HandledKind = proposal.body.kind
    const handler = proposalHandler(kind)
    if (!handler) throw new HttpError(422, 'unsupported_proposal', `Accepting a ${kind} proposal is not available`)
    const outcome = await handler.accept(deps, proposal as ProposalOf<HandledKind>)
    await proposalDecisionUpdate(deps, id, { status: 'accepted', plan_version_id: outcome.plan_version_id })
    return { proposal: await decided(deps, id, proposal), plan_version: await versionById(deps, outcome.plan_version_id), applied: outcome.applied }
  }

  const built = await buildChange(deps, { changes: proposal.body.changes, reason: `Accepted proposal: ${row.summary}`, created_by: row.actor })
  const status = built.row ? 'accepted' : 'rejected'
  try {
    await runStatements(deps, [...built.statements, proposalDecisionUpdate(deps, id, { status, plan_version_id: built.row?.id ?? null })])
  } catch (e) {
    const again = await getProposalRow(deps, id) // a concurrent accept won the version number
    const replay = again && toProposal(again)
    if (replay && replay.proposal_status === 'accepted')
      return { proposal: replay, plan_version: await versionById(deps, again.plan_version_id), applied: null }
    throw e
  }
  if (built.job_id) runSoon(deps, built.job_id)
  return { proposal: await decided(deps, id, proposal), plan_version: built.result.plan_version, applied: null }
}

/** Reject a pending proposal (its kind's handler withdraws what proposing stored); replaying a rejection returns it. */
export async function rejectProposal(deps: Deps, id: string): Promise<ProposalDecision> {
  const { row, proposal } = await loadProposal(deps, id)
  if (row.proposal_status === 'rejected') return { proposal, plan_version: null, applied: null }
  if (row.proposal_status !== 'pending') throw new HttpError(409, 'proposal_accepted', 'This proposal was already applied')
  if (proposal.body.kind !== 'plan_change') await proposalHandler(proposal.body.kind)?.reject?.(deps, proposal as ProposalOf<HandledKind>)
  await proposalDecisionUpdate(deps, id, { status: 'rejected' })
  return { proposal: await decided(deps, id, proposal), plan_version: null, applied: null }
}

/** A safe-list change (reminder time, exercise swap) guarded as deps.actor: applied now, proposed, or rejected. */
export async function applySafeChange<T>(deps: Deps, input: SafeChangeInput<T>): Promise<SafeChangeResult<T>> {
  return safeChange(deps, await loadPlanContext(deps), input)
}

/** Revert: a new active version with an older version's targets (append-only). Restoring the active one is a no-op. */
export async function restoreVersion(deps: Deps, id: string): Promise<PlanVersion> {
  const ctx = await loadPlanContext(deps)
  const [target] = await deps.db.select().from(plan_versions).where(eq(plan_versions.id, id))
  if (!target) throw notFound('Plan version')
  if (target.id === ctx.active.id) return toPlanVersion(ctx.active)
  const v = await versionStatements(deps, ctx, {
    targets: target.targets,
    reason: `Restored version ${target.version}`,
    created_by: deps.actor,
    extra: { restored_from: target.version },
  })
  await runStatements(deps, v.statements)
  runSoon(deps, v.job_id)
  return toPlanVersion(v.row)
}

export async function materialiseTargets(deps: Deps, range: { from: string; to?: string }): Promise<DailyTargets[]> {
  return materialise(deps, { from: range.from, to: range.to ?? (await targetHorizon(deps)) })
}

export function ensureTargetsThrough(deps: Deps, date: string): Promise<number> {
  return ensureThrough(deps, date)
}

export interface WeekPlanVersion {
  plan_version: PlanVersion
  /** The week's daily targets from max(week_start, today) to its Sunday, as the statements write them. */
  targets: DailyTargets[]
  /** Not yet run: the caller appends its own writes and runs everything as ONE db.batch, then runSoon(job_id). */
  statements: BatchItem<'sqlite'>[]
  job_id: string
}

/**
 * Applying or reverting a week plan as one plan version: the active targets carried over, `reason`, diff = the week's
 * materialised target moves from today on, the 'change' event (`summary`; `extra` merged into its body), daily_targets
 * from today through max(horizon, the week's Sunday) rebuilt with `week_plan` as that week's source (null: the plan
 * version's targets), and a plan_reforecast job. Past days keep their targets.
 */
export async function weekPlanVersion(
  deps: Deps,
  input: {
    week_start: string
    week_plan: { id: string; plan: WeekPlanContent } | null
    reason: string
    summary: string
    extra: Record<string, unknown>
  },
): Promise<WeekPlanVersion> {
  const ctx = await loadPlanContext(deps)
  const week_plan = input.week_plan && { id: input.week_plan.id, week_start: input.week_start, plan: input.week_plan.plan }
  const v = await versionStatements(deps, ctx, {
    targets: ctx.active.targets,
    reason: input.reason,
    created_by: deps.actor,
    extra: input.extra,
    summary: input.summary,
    week: { week_start: input.week_start, week_plan },
  })
  const end = addDays(input.week_start, 6)
  const targets = v.rows.filter((r) => r.date >= input.week_start && r.date <= end).map(newRowTargets)
  return { plan_version: toPlanVersion(v.row), targets, statements: v.statements, job_id: v.job_id }
}

// On-demand reforecast after a plan change: the forecast moves, the expenditure estimate keeps its weekly cadence.
registerJobHandler('plan_reforecast', {
  fetches: 0,
  run: async (deps, job) => ({ output: await reforecast(deps, { as_of: job.payload.date, reestimate: false }) }),
})
