// Owns: the goal tools — propose_goal_change (the settings module: a new goal weight or goal date as a pending
// proposal Aaron taps; the rails are never goals and no tool here moves them).
import { GOAL_WEIGHT_KG, Id, LocalDate } from '@fitness/shared/schemas'
import * as z from 'zod'
import { proposeGoalChange } from '../../../settings'
import { defineTool, type ToolDefinition } from '../define'

const Goals = z.object({ goal_weight_kg: z.number(), goal_date: LocalDate })

export const GOAL_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'propose_goal_change',
    title: 'Propose a goal change',
    area: 'body',
    description:
      'Propose a new goal weight and/or goal date when Aaron says his goal changed (e.g. "doctor says aim for 88 by ' +
      'March"); null keeps that goal. It waits as a proposal card for his tap (status "proposed"); accepting saves ' +
      'the goal and reforecasts the summit date. Refused (422 goal_refused) when nothing would change, the weight is ' +
      `outside ${GOAL_WEIGHT_KG.min}–${GOAL_WEIGHT_KG.max} kg or not below his start weight, or the date is not after ` +
      'today. The calorie floor and other rails are not goals: only Aaron changes them, in Settings.',
    input: z.object({
      goal_weight_kg: z
        .number()
        .min(GOAL_WEIGHT_KG.min)
        .max(GOAL_WEIGHT_KG.max)
        .nullable()
        .describe('The new goal weight in kg, or null to keep it'),
      goal_date: LocalDate.nullable().describe('The new goal date YYYY-MM-DD, or null to keep it'),
      reason: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .optional()
        .describe('Why, in one short sentence (e.g. "Your doctor suggested 88 kg by March")'),
    }),
    output: z.object({
      status: z.literal('proposed'),
      proposal_id: Id,
      goal_weight_kg: z.number().nullable().describe('The goal weight it asks for; null = stays'),
      goal_date: LocalDate.nullable().describe('The goal date it asks for; null = stays'),
      before: Goals.describe('The goals now'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, input) => proposeGoalChange(deps, input),
  }),
]
