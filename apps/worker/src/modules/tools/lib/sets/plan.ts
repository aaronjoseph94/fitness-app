// Owns: the plan tools — get_plan, list_plan_versions, restore_plan_version, propose_plan_change, apply_proposal,
// reject_proposal (the plan module: guarded plan versions and proposals). Applying or resolving is for Aaron and the
// coach (MCP); for Ask AI (actor 'ai') those tools answer 403 needs_approval and it proposes instead.
import {
  Count,
  Id,
  LocalDate,
  PlanChange,
  PlanVersion,
  Proposal,
  ProposalDecision,
  Rails,
  TargetField,
  Weekday,
  type PlanTargets,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { assertCoach } from '../../../coach'
import {
  acceptProposal,
  getActivePlan,
  listVersions,
  propose,
  rejectProposal,
  restoreVersion,
} from '../../../plan'
import { getSettings } from '../../../settings'
import { defineTool, type ToolDefinition } from '../define'

const Rejected = z.object({ change: PlanChange, rule: z.string(), reason: z.string() })
const Scheduled = z.object({ change: PlanChange, week_offset: Count, due: LocalDate, proposal_id: Id })

const current = (t: PlanTargets, c: { field: TargetField; weekday: Weekday | null }) =>
  (c.weekday ? t.overrides[c.weekday]?.[c.field] : undefined) ?? t.defaults[c.field]

export const PLAN_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_plan',
    title: 'Get the active plan',
    area: 'plan',
    description:
      'The active plan version: target defaults for every day (kcal, protein_g, carbs_g, fat_g, fibre_g, water_ml, steps), per-weekday overrides, the forecast (weekly loss rate, finish date for 65 kg, ±20 % band, expenditure estimate tdee_est) and who made it and why — plus the rails every change must respect (calorie floor and ceiling, protein and fat minimums, fasting pattern). Read-only.',
    input: z.object({}),
    output: z.object({ plan: PlanVersion, rails: Rails }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps) => {
      const [plan, { settings }] = await Promise.all([getActivePlan(deps), getSettings(deps)])
      return {
        plan,
        rails: {
          calorie_floor: settings.calorie_floor,
          calorie_ceiling: settings.calorie_ceiling,
          protein_min_g: settings.protein_min_g,
          fat_min_g: settings.fat_min_g,
          fasts_per_month: settings.fasts_per_month,
          fast_hours: settings.fast_hours,
        },
      }
    },
  }),
  defineTool({
    name: 'list_plan_versions',
    title: 'List plan versions',
    area: 'plan',
    description:
      'The plan version history, newest first: each append-only version with its targets, diff, reason, forecast and author (user, ai, mcp). Use it to explain what changed when, or to find the id to restore. Read-only.',
    input: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    output: z.object({ versions: z.array(PlanVersion), total: Count }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: async (deps, { limit }) => {
      const versions = await listVersions(deps)
      return { versions: versions.slice(0, limit), total: versions.length }
    },
  }),
  defineTool({
    name: 'restore_plan_version',
    title: 'Restore a plan version',
    area: 'plan',
    description:
      "Revert the plan: creates a NEW active version copying an older version's targets (history is never deleted, so this can itself be reverted) and rebuilds the daily targets from today. Only after Aaron asks for it. Not available to Ask AI.",
    input: z.object({ id: Id.describe('The plan version id to copy (from list_plan_versions)') }),
    output: PlanVersion,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { id }) => {
      assertCoach(deps, 'restore_plan_version')
      return restoreVersion(deps, id)
    },
  }),
  defineTool({
    name: 'propose_plan_change',
    title: 'Propose a plan change',
    area: 'plan',
    description:
      'Store target changes as ONE pending proposal Aaron accepts or rejects in the app (nothing changes until then). Each change moves one target for every day (weekday null) or one weekday. The guards run first: kcal stays within the calorie floor and ceiling, protein and fat at or above their minimums, and a kcal move larger than 150 keeps a 150 step now with later steps scheduled as proposals a week apart. Returns the proposal, the changes the guards rejected (with the rail) and the scheduled steps. To apply at once during a coach review, use apply_review instead.',
    input: z.object({
      changes: z
        .array(
          z.object({
            field: TargetField,
            weekday: Weekday.nullable().default(null).describe('null = every day'),
            to: z.number().nonnegative(),
            reason: z.string().trim().min(1).max(500).optional(),
          }),
        )
        .min(1)
        .max(14),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe('Why, in one sentence Aaron will read on the proposal card'),
    }),
    output: z.object({
      proposal: Proposal.nullable(),
      rejected: z.array(Rejected),
      scheduled: z.array(Scheduled),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: async (deps, input) => {
      const { targets } = await getActivePlan(deps)
      const changes = input.changes.map((c) => ({
        field: c.field,
        weekday: c.weekday,
        from: current(targets, c),
        to: c.to,
        reason: c.reason ?? input.reason,
      }))
      return propose(deps, { changes, reason: input.reason })
    },
  }),
  defineTool({
    name: 'apply_proposal',
    title: 'Accept a proposal',
    area: 'plan',
    description:
      'Accept a pending proposal: a plan change re-runs the guards and becomes a new plan version (revertible); a workout becomes an AI template; a week plan becomes the week\'s active plan; a reminder time or template swap is applied. Only after Aaron says yes to that proposal. Not available to Ask AI.',
    input: z.object({
      id: Id.describe('The proposal id (get_today → proposals, or get_review_bundle → open_proposals)'),
    }),
    output: ProposalDecision,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { id }) => {
      assertCoach(deps, 'apply_proposal')
      return acceptProposal(deps, id)
    },
  }),
  defineTool({
    name: 'reject_proposal',
    title: 'Reject a proposal',
    area: 'plan',
    description:
      'Reject a pending proposal (it stays in the history as rejected; nothing changes, and a proposed week plan is set aside). Only after Aaron says no to it. Not available to Ask AI.',
    input: z.object({ id: Id }),
    output: ProposalDecision,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, { id }) => {
      assertCoach(deps, 'reject_proposal')
      return rejectProposal(deps, id)
    },
  }),
]
