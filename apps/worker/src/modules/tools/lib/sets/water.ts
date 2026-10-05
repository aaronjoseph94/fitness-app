// Owns: the water tool — log_water (the water module: quick-add entries; the day's total is computed). Logging water
// never changes the water target; that is a plan change (propose_plan_change field water_ml).
import { Instant, WaterLog } from '@fitness/shared/schemas'
import * as z from 'zod'
import { logWater } from '../../../water'
import { defineTool, type ToolDefinition } from '../define'

export const WATER_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'log_water',
    title: 'Log water',
    area: 'nutrition',
    description:
      "Record water Aaron drank: one entry in ml (a glass ≈ 250, a bottle ≈ 500; 1 L = 1000), at `at` or now. It adds to that Edmonton date's water total on Today. Use only for water he says he drank; it never changes the daily water target (that is propose_plan_change with field water_ml).",
    input: z.object({
      amount_ml: z.number().int().min(1).max(5000).describe('Millilitres drunk, 1–5000'),
      at: Instant.optional().describe('When it was drunk; default now'),
    }),
    output: WaterLog,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, i) => logWater(deps, { id: crypto.randomUUID(), amount_ml: i.amount_ml, logged_at: i.at }),
  }),
]
