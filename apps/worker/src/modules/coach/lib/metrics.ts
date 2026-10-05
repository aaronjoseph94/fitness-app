// Owns: query_metric — a read-only daily or weekly series of one stored metric from the day series (v_day + trend via
// the day module), so the numbers match Today, Progress and the weekly report.
//   day value:  weight = weigh-in kg; trend = trend kg; kcal/macros = intake when the day is logged (meals_logged > 0 ∨
//               fast day; a fast day counts at its intake, usually 0), else null; water = ml when > 0; steps; sleep =
//               minutes asleep; volume = Σ reps × load kg; sessions = sessions done
//   week value: mean of the week's days with data, Σ for volume and sessions, the last value for trend
import { weekStart } from '@fitness/shared/engine'
import type { DaySummary } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { days } from '../../day'
import type { MetricName, MetricPoint, MetricQuery, MetricSeries } from './schemas'

type Spec = {
  unit: string
  dp: number
  week: MetricSeries['week_value']
  value: (d: DaySummary) => number | null
  target?: (d: DaySummary) => number | null
}

const logged = (d: DaySummary) => d.meals_logged > 0 || d.is_fast_day
const intake = (
  f: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fibre_g',
): Pick<Spec, 'value' | 'target'> => ({
  value: (d) => (logged(d) ? d.intake[f] : null),
  target: (d) => d.targets?.[f] ?? null,
})

const SPECS: Record<MetricName, Spec> = {
  weight: { unit: 'kg', dp: 2, week: 'mean', value: (d) => d.weight_kg },
  trend: { unit: 'kg', dp: 2, week: 'last', value: (d) => d.trend_kg },
  kcal: { unit: 'kcal', dp: 0, week: 'mean', ...intake('kcal') },
  protein: { unit: 'g', dp: 1, week: 'mean', ...intake('protein_g') },
  carbs: { unit: 'g', dp: 1, week: 'mean', ...intake('carbs_g') },
  fat: { unit: 'g', dp: 1, week: 'mean', ...intake('fat_g') },
  fibre: { unit: 'g', dp: 1, week: 'mean', ...intake('fibre_g') },
  water: {
    unit: 'ml',
    dp: 0,
    week: 'mean',
    value: (d) => (d.water_ml > 0 ? d.water_ml : null),
    target: (d) => d.targets?.water_ml ?? null,
  },
  steps: {
    unit: 'steps',
    dp: 0,
    week: 'mean',
    value: (d) => d.steps,
    target: (d) => d.targets?.steps ?? null,
  },
  sleep: { unit: 'min', dp: 0, week: 'mean', value: (d) => d.sleep_min },
  volume: { unit: 'kg', dp: 0, week: 'sum', value: (d) => d.volume_kg },
  sessions: { unit: 'sessions', dp: 0, week: 'sum', value: (d) => d.sessions_done },
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp
const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

function combine(xs: readonly number[], how: MetricSeries['week_value']): number | null {
  if (xs.length === 0) return null
  if (how === 'sum') return xs.reduce((s, x) => s + x, 0)
  if (how === 'last') return xs[xs.length - 1]!
  return mean(xs)
}

export async function queryMetric(deps: Deps, q: MetricQuery): Promise<MetricSeries> {
  const spec = SPECS[q.metric]
  const series = await days(deps, { from: q.from, to: q.to })
  const daily = series.map((d) => ({ date: d.date, value: spec.value(d), target: spec.target?.(d) ?? null }))

  const groups = new Map<string, typeof daily>()
  for (const d of daily) {
    const key = q.agg === 'week' ? weekStart(d.date) : d.date
    groups.set(key, [...(groups.get(key) ?? []), d])
  }
  const points: MetricPoint[] = [...groups.entries()].map(([date, ds]) => {
    const values = ds.flatMap((d) => (d.value === null ? [] : [d.value]))
    const targets = ds.flatMap((d) => (d.target === null ? [] : [d.target]))
    const value = combine(values, spec.week)
    const target = mean(targets)
    return {
      date,
      value: value === null ? null : round(value, spec.dp),
      target: target === null ? null : round(target, spec.dp),
      n: values.length,
    }
  })

  const values = daily.flatMap((d) => (d.value === null ? [] : [d.value]))
  const m = mean(values)
  return {
    metric: q.metric,
    unit: spec.unit,
    agg: q.agg,
    from: q.from,
    to: q.to,
    week_value: spec.week,
    points,
    summary: {
      mean: m === null ? null : round(m, spec.dp),
      min: values.length ? round(Math.min(...values), spec.dp) : null,
      max: values.length ? round(Math.max(...values), spec.dp) : null,
      total:
        spec.week === 'sum'
          ? round(
              values.reduce((s, x) => s + x, 0),
              spec.dp,
            )
          : null,
      days_with_data: values.length,
    },
  }
}
