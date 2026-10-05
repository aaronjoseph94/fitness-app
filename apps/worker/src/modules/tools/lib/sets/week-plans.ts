// Owns: the week-plan tools (SPEC §10 "Review and week-plan tools") — read a week's plan with last week's actuals,
// propose, apply, revert, and replace the week's sessions from templates. Each calls the week-plans module, which runs
// the guards and versions every change; deps.actor ('mcp' for Claude, 'ai' for Ask AI) is recorded on every write.
import {
  LocalDate,
  TemplatesByWeekday,
  WeekPlanApplied,
  WeekPlanContentInput,
  WeekPlanProposal,
  WeekPlanReplaced,
  WeekPlanView,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { applyWeekPlan, getWeekPlan, proposeWeekPlan, replaceWeekPlan, revertWeekPlan } from '../../../week-plans'
import { defineTool, type ToolDefinition } from '../define'

const WeekPlanId = z.uuid().describe('The week plan id (from get_week_plan or propose_week_plan)')

export const WEEK_PLAN_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_week_plan',
    title: 'Get the week plan',
    description:
      'Read the week plan for one Monday–Sunday week: the active plan (the source of that week\'s daily targets and ' +
      'planned sessions) and the newest proposed one awaiting apply_week_plan, each day\'s targets and actuals so far ' +
      '(kcal eaten, protein, water, steps, fasts, sessions done), last week\'s plan and actuals beside it, and a short ' +
      'list of what each plan changes from last week. Call it before proposing next week\'s plan, and to answer ' +
      '"what is my plan this week". Read-only.',
    area: 'week_plans',
    input: z.object({
      week_start: LocalDate.optional().describe('Any date in the week (its Monday is used); default this week'),
    }),
    output: WeekPlanView,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, input) => getWeekPlan(deps, input.week_start),
  }),

  defineTool({
    name: 'propose_week_plan',
    title: 'Propose a week plan',
    description:
      'Store a plan for one Monday–Sunday week as proposed: per-weekday calories and macros, a session per weekday ' +
      '(exercise ids from the allowed exercise set, 12–28 sets each; null for rest), water, steps, the fast days of ' +
      'the fasts already planned that week (each fast\'s fast_day: a fast from 19:00 makes the next day the fast day; ' +
      'plan a new fast with plan_fast first — a fast date with no planned fast is rejected, and planned ones left out ' +
      'are added), the scan date if one is due, and a focus note. The rails are checked first: kcal between the ' +
      'calorie floor and ceiling, protein and fat at or above their minimums. If anything breaks a rail ' +
      'nothing is stored and `rejected` says what to fix; a kcal move of more than 150 from last week\'s target for ' +
      'that weekday is cut to the 150 kcal step and listed in `adjusted`. Fast dates get 0 kcal targets automatically, ' +
      'so their weekday targets are ignored. A new proposal replaces the week\'s earlier proposed plan. Nothing changes ' +
      'in the app until apply_week_plan; call that once the plan is agreed in chat.',
    area: 'week_plans',
    input: z.object({
      week_start: LocalDate.describe('The Monday the week starts on'),
      plan: WeekPlanContentInput,
    }),
    output: WeekPlanProposal,
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (deps, input) => proposeWeekPlan(deps, { week_start: input.week_start, plan: input.plan }),
  }),

  defineTool({
    name: 'apply_week_plan',
    title: 'Apply a week plan',
    description:
      'Make a proposed (or an earlier) week plan the active plan for its week: that week\'s daily targets are rebuilt ' +
      'from today on and its sessions become the Train tab\'s planned sessions; the previous active plan is superseded. ' +
      'The rails are checked again. Recorded as one plan version and can be undone with revert_week_plan. Call it only ' +
      'after the plan was agreed in chat. Applying the active plan again changes nothing.',
    area: 'week_plans',
    input: z.object({ id: WeekPlanId }),
    output: WeekPlanApplied,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, input) => applyWeekPlan(deps, input.id),
  }),

  defineTool({
    name: 'revert_week_plan',
    title: 'Revert a week plan',
    description:
      'Undo applying the active week plan for its week: the plan it replaced becomes active again (or, if it replaced ' +
      'none, the week goes back to the everyday plan targets and training days) and the week\'s daily targets are ' +
      'rebuilt from today on. Only the active plan can be reverted. Recorded as one plan version.',
    area: 'week_plans',
    input: z.object({ id: WeekPlanId.describe('The active week plan to revert') }),
    output: WeekPlanApplied,
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (deps, input) => revertWeekPlan(deps, input.id),
  }),

  defineTool({
    name: 'replace_week_plan',
    title: 'Replace the week\'s sessions',
    description:
      'Program design: set the training sessions of one week from saved templates, e.g. the Mon–Thu upper/lower split. ' +
      'Starts from the week\'s active plan (or the everyday targets when there is none), sets each weekday you give to ' +
      'that template (null = rest day; weekdays you leave out keep their session, and are rest days when the week had ' +
      'no plan), checks the sessions against the allowed exercise set and 12–28 sets, then proposes the result and ' +
      'applies it at once (from the in-app assistant it stays proposed for a tap). Create the templates first with ' +
      'create_template. Revertible with revert_week_plan.',
    area: 'week_plans',
    input: z.object({
      week_start: LocalDate.optional().describe('Any date in the week (its Monday is used); default this week'),
      templates_by_weekday: TemplatesByWeekday.describe('Template id per weekday (mon … sun); null makes it a rest day'),
      focus_note: z.string().max(500).optional().describe('Replaces the week\'s focus note'),
    }),
    output: WeekPlanReplaced,
    annotations: { readOnlyHint: false, destructiveHint: false },
    run: (deps, input) => replaceWeekPlan(deps, input),
  }),
]
