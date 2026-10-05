// Owns: the plan — append-only plan versions (exactly one active), proposals and their accept/reject, the materialised
// daily targets (the v_day spine), and the forecast. Every change is guarded (engine applyGuards) and written as ONE
// db.batch: deactivate old + insert new version + ai_events record + the change carried into the active week plans
// from today on (a day in an active week plan takes its targets from it) + rebuilt daily_targets + a plan_reforecast job.
// Interface:
//   getActivePlan(deps) / listVersions(deps)            → PlanVersion / PlanVersion[] (newest first)
//   createVersion(deps, { changes, reason, created_by? }) → VersionResult   guards as created_by (default deps.actor);
//        rejected changes are recorded on the event (a 'note' when nothing passed); later ≤150 kcal steps become
//        pending proposals due a week apart, one series (series_id = the new version's id)
//   propose(deps, { changes, reason })                   → ProposalResult   guarded, stored as a pending proposal
//        (its body carries the guards' rejected and scheduled lists, as does a version's change event and the note
//        written when nothing passed; PlanVersion reads them back as `rejected` / `scheduled`)
//   proposalStatements(deps, { changes, reason })        → the same, not yet run, for the caller's batch
//   ai/mcp kcal moves are held to 150 kcal over a rolling 7 days (lib/window: measured from the version active a week
//        ago, or Aaron's own newer kcal edit); what does not fit now is scheduled a week out
//   acceptProposal(deps, id) / rejectProposal(deps, id) → ProposalDecision (idempotent replays; 409 on a reversal,
//        and 409 not_due for a scheduled kcal step before its date or before the rolling week lets it apply — accepting
//        never schedules another step). Rejecting a step rejects its series' later pending steps.
//        plan_change is handled here; every other kind by the handler its module registered:
//   registerProposalHandler(kind, { accept, reject? })   training (workout, template_swap), week-plans (week_plan),
//        reminders (reminder_time) register when they load, so plan never imports them
//   applySafeChange(deps, input)                        → SafeChangeResult  a safe-list change (reminder time,
//        exercise swap): guarded as deps.actor, then applied now or stored as a pending proposal (lib/proposals)
//   restoreVersion(deps, id, { withdraw_series? })      → PlanVersion      a new version copying an old one's targets
//        (403 needs_approval for actor 'ai'); withdraw_series: those series' pending steps rejected in the same batch
//   materialiseTargets(deps, { from, to? })             → DailyTargets[]   rebuild those dates from the active version,
//        settings, fasts and active week plans (call after any of them changes); `to` defaults to the materialised
//        horizon, max(last date with targets, today + 14)
//   targetStatementsFor(deps, { from, to? }, pending)   → statements (not run) rebuilding those dates as they will be
//        once the caller's own write lands (pending fasts / deleted fasts / settings), for that write's batch; a past
//        date keeps the plan version it was built from
//   planChangeStatements(deps, { changes, reason, created_by? }, pending?) → { statements, job_id } (not run): a guarded
//        new version for the caller's batch, computed with `pending` settings (settings' water / fibre targets)
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
import { plan_versions, runBatch } from '../../db'
import type { Deps } from '../../lib/deps'
import { HttpError, notFound } from '../../lib/http-error'
import { eventInsert, getProposalRow, proposalDecisionUpdate, seriesRejectUpdate, toProposal } from '../events'
import { registerJobHandler, runSoon } from '../jobs'
import { loadPlanContext, loadVerdicts, toPlanVersion, type PlanVersionRow } from './lib/context'
import { reforecast } from './lib/forecast'
import { proposalHandler, safeChange, type HandledKind, type ProposalOf, type SafeChangeInput, type SafeChangeResult } from './lib/proposals'
import {
  ensureThrough,
  materialise,
  newRowTargets,
  pendingTargetStatements,
  targetHorizon,
  type PendingInputs,
} from './lib/targets'
import { applyChanges, guardChanges, versionStatements, type RejectedChange, type ScheduledChange } from './lib/versions'
import { kcalWindow, stepFitsOn } from './lib/window'

export type { RejectedChange, ScheduledChange } from './lib/versions'
export type { PendingFast, PendingInputs } from './lib/targets'
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

/** The note written when nothing applies now: what waits for a later week (150 kcal per week), then what was dropped. */
function nothingNowText(prefix: string, rejected: readonly RejectedChange[], scheduled: readonly ScheduledChange[]): string {
  const waits = scheduled.map((s) => `${s.change.weekday ?? 'daily'} ${s.change.field} ${s.change.from} → ${s.change.to} due ${s.due}`)
  const parts = [waits.length ? `scheduled at 150 kcal per week: ${waits.join('; ')}` : '', rejectionText(rejected)].filter(Boolean)
  return `${prefix}: ${parts.join('; ') || 'no changes given'}`
}

/**
 * Statements for one guarded change (a new version, or a rejection note when nothing passed now — with the scheduled
 * steps either way). Not yet executed. With `accepting` (a stored proposal being accepted) nothing is scheduled again,
 * and `waiting` is the date a kcal change that cannot move at all yet fits the rolling week (the accept is then 409).
 */
async function buildChange(
  deps: Deps,
  input: { changes: readonly PlanChange[]; reason: string; created_by?: Actor; accepting?: boolean },
  pending: PendingInputs = {},
): Promise<{ statements: BatchItem<'sqlite'>[]; result: VersionResult; row: PlanVersionRow | null; job_id: string | null; waiting: string | null }> {
  const created_by = input.created_by ?? deps.actor
  const stored = await loadPlanContext(deps)
  const ctx = pending.settings ? { ...stored, settings: { ...stored.settings, ...pending.settings } } : stored
  const window = await kcalWindow(deps)
  const id = crypto.randomUUID()
  const guarded = guardChanges(deps, ctx, input.changes, created_by, {
    kcal_base: window.base,
    schedule_steps: !input.accepting,
    series_id: id,
  })
  const { rejected, scheduled } = guarded
  const waits = rejected.filter(
    (r) => r.rule === 'kcal_step' && !guarded.accepted.some((a) => a.field === r.change.field && a.weekday === r.change.weekday),
  )
  const waiting = waits.length ? waits.map((r) => stepFitsOn(deps, window, r.change)).sort().at(-1)! : null
  if (guarded.accepted.length === 0) {
    const text = nothingNowText(scheduled.length ? 'Plan change not applied yet' : 'Plan change rejected', rejected, scheduled)
    const note = eventInsert(deps, { kind: 'note', summary: text, body: { text, reason: input.reason, rejected, scheduled }, date: today(deps.now()) })
    return { statements: [note.statement, ...guarded.statements], result: { plan_version: null, rejected, scheduled }, row: null, job_id: null, waiting }
  }
  const v = await versionStatements(deps, ctx, {
    id,
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
    waiting,
  }
}

/** Apply plan changes now as a new active version (Aaron's edits, MCP writes, accepted proposals). */
export async function createVersion(
  deps: Deps,
  input: { changes: readonly PlanChange[]; reason: string; created_by?: Actor },
): Promise<VersionResult> {
  const built = await buildChange(deps, input)
  await runBatch(deps.db, built.statements)
  if (built.job_id) runSoon(deps, built.job_id)
  return built.result
}

/**
 * A guarded new version as statements for the caller's own batch (then runSoon(job_id) after it commits), computed with
 * `pending` settings as they will be once that batch lands. job_id is null when nothing passed (a note is written).
 */
export async function planChangeStatements(
  deps: Deps,
  input: { changes: readonly PlanChange[]; reason: string; created_by?: Actor },
  pending: PendingInputs = {},
): Promise<{ statements: BatchItem<'sqlite'>[]; result: VersionResult; job_id: string | null }> {
  const built = await buildChange(deps, input, pending)
  return { statements: built.statements, result: built.result, job_id: built.job_id }
}

export interface ProposalStatements {
  /** Not yet run: the proposal (or the note when nothing passed now) and its scheduled later steps. */
  statements: BatchItem<'sqlite'>[]
  /** The pending proposal's id; null when nothing passed now. */
  proposal_id: string | null
  /** The changes in the proposal (step 1 of a split kcal move). */
  accepted: PlanChange[]
  rejected: RejectedChange[]
  scheduled: ScheduledChange[]
}

/** Guarded plan changes as a pending proposal (actor deps.actor), as statements for the caller's batch. */
export async function proposalStatements(deps: Deps, input: { changes: readonly PlanChange[]; reason: string }): Promise<ProposalStatements> {
  const [ctx, window] = await Promise.all([loadPlanContext(deps), kcalWindow(deps)])
  const id = crypto.randomUUID()
  const g = guardChanges(deps, ctx, input.changes, deps.actor, { kcal_base: window.base, series_id: id })
  if (g.accepted.length === 0) {
    const text = nothingNowText(g.scheduled.length ? 'Proposal not due yet' : 'Proposal dropped', g.rejected, g.scheduled)
    const note = eventInsert(deps, {
      kind: 'note',
      summary: text,
      body: { text, reason: input.reason, rejected: g.rejected, scheduled: g.scheduled },
      date: today(deps.now()),
    })
    return { statements: [note.statement, ...g.statements], proposal_id: null, accepted: [], rejected: g.rejected, scheduled: g.scheduled }
  }
  const p = eventInsert(deps, {
    id,
    kind: 'proposal',
    summary: input.reason,
    body: { kind: 'plan_change', changes: g.accepted, rejected: g.rejected, scheduled: g.scheduled },
    proposal_status: 'pending',
  })
  return { statements: [p.statement, ...g.statements], proposal_id: id, accepted: g.accepted, rejected: g.rejected, scheduled: g.scheduled }
}

/** Store guarded plan changes as a pending proposal (actor deps.actor); nothing applies until it is accepted. */
export async function propose(deps: Deps, input: { changes: readonly PlanChange[]; reason: string }): Promise<ProposalResult> {
  const built = await proposalStatements(deps, input)
  await runBatch(deps.db, built.statements)
  const row = built.proposal_id ? await getProposalRow(deps, built.proposal_id) : null
  return { proposal: row ? toProposal(row) : null, rejected: built.rejected, scheduled: built.scheduled }
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

  // A scheduled later step of a >150 kcal move waits for its week (SPEC §9: larger moves are split across weeks), and
  // for the rolling week to let it apply (a step 1 accepted late moves it on); accepting never schedules another step.
  if (row.date && row.date > today(deps.now())) throw new HttpError(409, 'not_due', `This step is due ${row.date}`)
  const built = await buildChange(deps, {
    changes: proposal.body.changes,
    reason: `Accepted proposal: ${row.summary}`,
    created_by: row.actor,
    accepting: true,
  })
  if (built.waiting) throw new HttpError(409, 'not_due', `This step is due ${built.waiting} (150 kcal per week)`)
  const status = built.row ? 'accepted' : 'rejected'
  try {
    await runBatch(deps.db, [...built.statements, proposalDecisionUpdate(deps, id, { status, plan_version_id: built.row?.id ?? null })])
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

/**
 * Reject a pending proposal (its kind's handler withdraws what proposing stored); replaying a rejection returns it.
 * A plan change that starts or continues a split kcal move takes its series' later pending steps with it (one batch).
 */
export async function rejectProposal(deps: Deps, id: string): Promise<ProposalDecision> {
  const { row, proposal } = await loadProposal(deps, id)
  if (row.proposal_status === 'rejected') return { proposal, plan_version: null, applied: null }
  if (row.proposal_status !== 'pending') throw new HttpError(409, 'proposal_accepted', 'This proposal was already applied')
  if (proposal.body.kind !== 'plan_change') {
    await proposalHandler(proposal.body.kind)?.reject?.(deps, proposal as ProposalOf<HandledKind>)
    await proposalDecisionUpdate(deps, id, { status: 'rejected' })
  } else {
    const series = proposal.body.series_id ?? id
    await runBatch(deps.db, [proposalDecisionUpdate(deps, id, { status: 'rejected' }), seriesRejectUpdate(deps, series, row.date)])
  }
  return { proposal: await decided(deps, id, proposal), plan_version: null, applied: null }
}

/** A safe-list change (reminder time, exercise swap) guarded as deps.actor: applied now, proposed, or rejected. */
export async function applySafeChange<T>(deps: Deps, input: SafeChangeInput<T>): Promise<SafeChangeResult<T>> {
  return safeChange(deps, await loadPlanContext(deps), input)
}

/**
 * Revert: a new active version with an older version's targets (append-only). Restoring the active one is a no-op.
 * 403 needs_approval for actor 'ai' (Ask AI proposes; Aaron or the coach restores). `withdraw_series`: kcal series
 * whose pending later steps are rejected in the same batch (revert_review: the review's split kcal move).
 */
export async function restoreVersion(deps: Deps, id: string, opts: { withdraw_series?: readonly string[] } = {}): Promise<PlanVersion> {
  if (deps.actor === 'ai') throw new HttpError(403, 'needs_approval', 'Restoring a plan version is for Aaron or the coach; Ask AI proposes changes instead')
  const ctx = await loadPlanContext(deps)
  const [target] = await deps.db.select().from(plan_versions).where(eq(plan_versions.id, id))
  if (!target) throw notFound('Plan version')
  const withdraw = (opts.withdraw_series ?? []).map((series) => seriesRejectUpdate(deps, series))
  if (target.id === ctx.active.id) {
    const [first, ...rest] = withdraw
    if (first) await deps.db.batch([first, ...rest])
    return toPlanVersion(ctx.active)
  }
  const v = await versionStatements(deps, ctx, {
    targets: target.targets,
    reason: `Restored version ${target.version}`,
    created_by: deps.actor,
    extra: { restored_from: target.version },
    also: withdraw,
  })
  await runBatch(deps.db, v.statements)
  runSoon(deps, v.job_id)
  return toPlanVersion(v.row)
}

export async function materialiseTargets(deps: Deps, range: { from: string; to?: string }): Promise<DailyTargets[]> {
  return materialise(deps, { from: range.from, to: range.to ?? (await targetHorizon(deps)) })
}

/** Daily-target statements for the caller's batch, computed as if `pending` were already written. */
export function targetStatementsFor(deps: Deps, range: { from: string; to?: string }, pending: PendingInputs): Promise<BatchItem<'sqlite'>[]> {
  return pendingTargetStatements(deps, range, pending)
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
