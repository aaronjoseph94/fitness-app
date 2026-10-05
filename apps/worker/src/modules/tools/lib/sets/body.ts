// Owns: the body tools — get_trend, log_weight, log_measurement (the body module: weigh-ins, tape, trend series).
import { today } from '@fitness/shared/engine'
import {
  Cm,
  DateRange,
  Kg,
  LocalDate,
  Measurement,
  MeasurementSite,
  TrendSeries,
  WeighIn,
} from '@fitness/shared/schemas'
import * as z from 'zod'
import { getTrend, logMeasurements, logWeighIn } from '../../../body'
import { defineTool, type ToolDefinition } from '../define'

export const BODY_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'get_trend',
    title: 'Get the weight trend',
    area: 'body',
    description:
      'Raw weigh-ins and the trend weight (EWMA, α = 0.25; gaps carry the trend forward) per day for a date range, the 7-day trend change, tape measurements in the range, the active forecast (weekly rate, finish date, band) and the milestones with the dates reached. Lead with the trend, not the raw scale weight. Read-only.',
    input: DateRange,
    output: TrendSeries,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, range) => getTrend(deps, range),
  }),
  defineTool({
    name: 'log_weight',
    title: 'Log a weigh-in',
    area: 'body',
    description:
      "Record Aaron's morning scale weight (kg) for a date. One weigh-in per date: logging a date that already has one replaces it. The trend and forecast update from it. Use only when Aaron gives you the number.",
    input: z.object({
      weight_kg: Kg.min(30).max(300),
      date: LocalDate.optional().describe('YYYY-MM-DD in Edmonton; default today'),
      note: z.string().trim().max(500).optional(),
    }),
    output: WeighIn,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: (deps, i) =>
      logWeighIn(deps, {
        id: crypto.randomUUID(),
        date: i.date ?? today(deps.now()),
        weight_kg: i.weight_kg,
        note: i.note,
      }),
  }),
  defineTool({
    name: 'log_measurement',
    title: 'Log a tape measurement',
    area: 'body',
    description:
      'Record one tape measurement in cm (neck, chest, waist_navel, hips, left/right arm, left/right thigh) for a date. A site already measured that date is replaced. Waist and hips feed the waist and waist-to-hip charts.',
    input: z.object({
      site: MeasurementSite,
      value_cm: Cm,
      date: LocalDate.optional().describe('YYYY-MM-DD in Edmonton; default today'),
    }),
    output: Measurement,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    run: async (deps, i) => {
      const [m] = await logMeasurements(deps, {
        date: i.date ?? today(deps.now()),
        entries: [{ id: crypto.randomUUID(), site: i.site, value_cm: i.value_cm }],
      })
      return m!
    },
  }),
]
