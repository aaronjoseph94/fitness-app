// Owns: the metrics tool — query_metric, the read-only time series behind any coach question (the coach module reads
// the same day series as Today, Progress and the weekly report).
import { MetricQuery, MetricSeries, queryMetric } from '../../../coach'
import { defineTool, type ToolDefinition } from '../define'

export const METRIC_TOOLS: readonly ToolDefinition[] = [
  defineTool({
    name: 'query_metric',
    title: 'Query a metric series',
    area: 'metrics',
    description:
      "A read-only series of one stored metric between two dates (at most 400 days), one point per day (agg 'day') or per Monday–Sunday week (agg 'week'), with the day's target where one exists (kcal, macros, water, steps) and a summary (mean, min, max, total, days with data). Metrics: weight (raw kg), trend (trend weight kg), kcal, protein, carbs, fat, fibre (intake on logged days; a fast day counts as logged), water (ml), steps, sleep (minutes asleep), volume (training kg), sessions. Week values are means of the days with data, except volume and sessions (sums) and trend (the week's last value). Use it for questions like \"what did I average for protein in September?\" or for raw detail behind the review bundle.",
    input: MetricQuery,
    output: MetricSeries,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    run: (deps, q) => queryMetric(deps, q),
  }),
]
