// Owns: the health-input tools — log_sleep, log_steps (the health module; Apple Watch data typed by Aaron in chat).
import {
  Count,
  Instant,
  Kcal,
  LocalDate,
  Minutes,
  SleepLog,
  SleepLogCreate,
  StepLog,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { badRequest } from '../../../../lib/http-error'
import { logSleep, logSteps } from '../../../health'
import { defineTool, type ToolDefinition } from '../define'

export const HEALTH_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'log_sleep',
    title: 'Log a night of sleep',
    area: 'health',
    description:
      "Record one night of sleep, keyed by the wake date: minutes asleep, or both in-bed and wake instants (asleep = wake − in bed). Replaces that night's entry. Sleep feeds readiness for training and the weekly review.",
    input: z.object({
      date: LocalDate.describe('The wake date, YYYY-MM-DD'),
      asleep_min: Minutes.max(24 * 60).optional(),
      in_bed_at: Instant.optional(),
      woke_at: Instant.optional(),
    }),
    output: SleepLog,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, i) => {
      const body = SleepLogCreate.safeParse({ id: crypto.randomUUID(), ...i })
      if (!body.success) throw badRequest(body.error.issues.map((x) => x.message).join('; '))
      return logSleep(deps, body.data)
    },
  }),
  defineTool({
    name: 'log_steps',
    title: 'Log steps',
    area: 'health',
    description:
      "Record a date's step count (and active kcal if known). Replaces that date's entry. Steps feed readiness, the steps target and the weekly review.",
    input: z.object({ date: LocalDate, steps: Count.max(200_000), active_kcal: Kcal.optional() }),
    output: StepLog,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, i) => logSteps(deps, { id: crypto.randomUUID(), ...i }),
  }),
]
