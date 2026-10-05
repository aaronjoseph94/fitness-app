// Owns: the fasting tools — start_fast, end_fast, plan_fast (the fasting module). A fast day is a known pattern (two
// 24 h fasts a month on Aaron's dates), never a missed day.
import { addDays, today } from '@fitness/shared/engine'
import { Fast, Id, Instant, LocalDate, LocalTime } from '@fitness/shared/schemas'
import * as z from 'zod'
import { DEFAULT_FAST_TIME, localInstant } from '../../../coach'
import { endFast, listFasts, moveFast, planFast, startFast } from '../../../fasting'
import { HttpError } from '../../../../lib/http-error'
import { defineTool, type ToolDefinition } from '../define'

export const FASTING_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'start_fast',
    title: 'Start a fast',
    area: 'fasting',
    description:
      "Start a 24 h fast now (or at `at`, now or earlier; a future fast is planned with plan_fast). If a planned fast is on today's calendar and has not begun, that one starts; otherwise an ad-hoc fast starts. Today becomes a fast day: intake target 0, water target up, training light, meal reminders off. Fails with fast_active while another fast runs.",
    input: z.object({
      at: Instant.optional().describe('Start instant, now or earlier; default now'),
      note: z.string().trim().max(500).optional(),
    }),
    output: Fast,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: async (deps, i) => {
      const now = deps.now().toISOString()
      const date = today(deps.now())
      const planned = (await listFasts(deps, { from: date, to: date })).find(
        (f) => f.planned && f.started_at > now && today(f.started_at) === date,
      )
      return startFast(deps, { id: planned?.id ?? crypto.randomUUID(), started_at: i.at, note: i.note })
    },
  }),
  defineTool({
    name: 'end_fast',
    title: 'End the fast',
    area: 'fasting',
    description:
      'End the fast that is running now (at `at`, now or earlier; default now). The weekly review reports it as completed (≥ 95 % of 24 h) or partial with its real hours.',
    input: z.object({ at: Instant.optional().describe('End instant, now or earlier; default now') }),
    output: Fast,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: async (deps, i) => {
      const now = deps.now().toISOString()
      const running = (await listFasts(deps, { from: addDays(today(deps.now()), -3) })).find(
        (f) => f.ended_at === null && f.started_at <= now,
      )
      if (!running) throw new HttpError(409, 'no_active_fast', 'No fast is running')
      return endFast(deps, running.id, { ended_at: i.at })
    },
  }),
  defineTool({
    name: 'plan_fast',
    title: 'Plan a fast',
    area: 'fasting',
    description:
      "Put a 24 h fast on the calendar for a future Edmonton date (default start 19:00, dinner to dinner), or move a planned fast with fast_id. The fasting pattern rail allows settings.fasts_per_month (2) fasts in a calendar month; a third fails with fasting_pattern. The fast day (0 kcal target) is the date holding most of the fast — a 19:00 start makes the next day the fast day; its targets are rebuilt, the week plan's fast_dates and the fast reminders follow. Plan only dates Aaron picked.",
    input: z.object({
      date: LocalDate,
      time: LocalTime.optional().describe(`HH:MM Edmonton start; default ${DEFAULT_FAST_TIME}`),
      fast_id: Id.optional().describe('Move this planned fast instead of planning a new one'),
      note: z.string().trim().max(500).optional(),
    }),
    output: Fast,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    run: (deps, i) => {
      const started_at = localInstant(i.date, i.time ?? DEFAULT_FAST_TIME)
      return i.fast_id
        ? moveFast(deps, i.fast_id, { started_at, note: i.note })
        : planFast(deps, { id: crypto.randomUUID(), started_at, note: i.note })
    },
  }),
]
