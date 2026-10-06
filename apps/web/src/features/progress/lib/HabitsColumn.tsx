// Owns: the "Food, water and recovery" column of Progress — calories vs target, macros with the protein target,
// protein and logging adherence calendars, water, steps with the 14-day median, sleep, and the fasting strip — from
// the range's v_day rows (GET /api/days) and fasts (GET /api/fasts).
import Stack from '@mui/material/Stack'
import type { DaySummary, Fast, LocalDate } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { CalendarHeatmap, CaloriesChart, FastingStrip, frameHeight, MacrosChart, SleepChart, StepsChart, WaterChart } from '../../../charts'
import { ChartCard, formatNumber, isQueryLoading, QueryStateCard, SectionHeader } from '../../../components'
import {
  caloriesDays,
  fastEntries,
  hasAny,
  latestTargets,
  loggingAdherence,
  macrosDays,
  proteinAdherence,
  sleepNights,
  stepsDays,
  waterDays,
} from './series'

/** SPEC §9 readiness compares sleep with 7.5 h. */
const SLEEP_TARGET_H = 7.5

interface HabitsColumnProps {
  days: UseQueryResult<DaySummary[], ApiError>
  fasts: UseQueryResult<Fast[], ApiError>
  from: LocalDate
  to: LocalDate
  fastHours: number
}

export function HabitsColumn({ days, fasts, from, to, fastHours }: HabitsColumnProps) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const header = <SectionHeader title="Food, water and recovery" subtitle="Each day against its target." />
  if (!days.data)
    return (
      <Stack spacing={4}>
        {header}
        <QueryStateCard query={days} what="your days" height={frameHeight(220)} />
        {isQueryLoading(days) && <QueryStateCard query={days} what="your days" height={frameHeight(220)} />}
      </Stack>
    )

  const rows = days.data
  const targets = latestTargets(rows)
  const meals = rows.some((d) => d.meals_logged > 0 || d.is_fast_day)
  const water = waterDays(rows)
  const steps = stepsDays(rows)
  const sleep = sleepNights(rows)
  const entries = fasts.data ? fastEntries(fasts.data, Date.now(), fastHours) : []
  const stripTo = entries.reduce((latest, f) => (f.date > latest ? f.date : latest), to)
  const proteinTarget = targets?.protein_g

  return (
    <Stack spacing={4} data-testid="progress-habits">
      {header}
      <ChartCard
        title="Calories vs target"
        subtitle={targets ? `kcal per day by meal slot; target ${formatNumber(targets.kcal)} kcal` : 'kcal per day by meal slot'}
        empty={
          meals
            ? undefined
            : {
                title: 'No meals logged in this range',
                body: 'Each meal you log stacks into its slot here.',
                illustration: 'meals',
                action: { label: 'Log a meal', onClick: () => openQuickLog('meal') },
              }
        }
      >
        <CaloriesChart days={caloriesDays(rows)} target={targets?.kcal} />
      </ChartCard>

      <ChartCard
        title="Macros"
        subtitle={proteinTarget ? `Grams per day; protein target ${formatNumber(proteinTarget)} g` : 'Grams per day'}
        empty={meals ? undefined : { title: 'No meals logged in this range', illustration: 'meals' }}
      >
        <MacrosChart days={macrosDays(rows)} proteinTarget={proteinTarget} />
      </ChartCard>

      <ChartCard
        title="Protein adherence"
        subtitle={proteinTarget ? `Share of the ${formatNumber(proteinTarget)} g target; fast days left blank` : 'Share of the protein target'}
        empty={meals ? undefined : { title: 'No meals logged in this range', illustration: 'meals' }}
      >
        <CalendarHeatmap
          days={proteinAdherence(rows)}
          metric="protein"
          label="Protein adherence"
          testId="chart-protein-adherence"
          describe={(v) => (v === null ? 'No meals logged or a fast day' : v >= 1 ? 'At or above target' : `${Math.round(v * 100)} % of target`)}
        />
      </ChartCard>

      <ChartCard
        title="Water"
        subtitle={targets ? `ml per day; target ${formatNumber(targets.water_ml)} ml` : 'ml per day'}
        empty={
          hasAny(water, (d) => d.ml)
            ? undefined
            : {
                title: 'No water logged in this range',
                body: 'Quick-add 250, 500 or 750 ml and the bars fill in.',
                illustration: 'empty',
                action: { label: 'Log water', onClick: () => openQuickLog('water') },
              }
        }
      >
        <WaterChart days={water} target={targets?.water_ml} />
      </ChartCard>

      <ChartCard
        title="Steps"
        subtitle={targets ? `Per day with the 14-day median; target ${formatNumber(targets.steps)}` : 'Per day with the 14-day median'}
        empty={
          hasAny(steps, (d) => d.steps)
            ? undefined
            : { title: 'No steps in this range', body: 'Steps arrive from the Apple Watch Shortcut or the manual form.', illustration: 'empty' }
        }
      >
        <StepsChart days={steps} target={targets?.steps} />
      </ChartCard>

      <ChartCard
        title="Sleep"
        subtitle={`Hours asleep against ${SLEEP_TARGET_H} h, and bedtime`}
        empty={
          hasAny(sleep, (n) => n.hours)
            ? undefined
            : { title: 'No sleep in this range', body: 'Last night’s sleep arrives from the Apple Watch Shortcut or the manual form.', illustration: 'empty' }
        }
      >
        <SleepChart nights={sleep} target={SLEEP_TARGET_H} />
      </ChartCard>

      <ChartCard title="Logging adherence" subtitle="Weigh-in, two meals or a fast, and water: share of the three">
        <CalendarHeatmap
          days={loggingAdherence(rows)}
          metric="weight"
          label="Logging adherence"
          testId="chart-logging-adherence"
          describe={(v) => (v === null ? 'No data' : v >= 1 ? 'All three logged' : `${Math.round(v * 3)} of 3 logged`)}
        />
      </ChartCard>

      {!fasts.data ? (
        <QueryStateCard query={fasts} what="your fasts" height={90} />
      ) : (
        <ChartCard title="Fasting" subtitle={`Planned and completed ${fastHours} h fasts`}>
          <FastingStrip fasts={entries} from={from} to={stripTo} />
        </ChartCard>
      )}
    </Stack>
  )
}
