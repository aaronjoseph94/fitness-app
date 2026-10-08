// Owns: the "Food, water and recovery" column of Progress (2a) — calories vs target with the calorie rails, macros
// with the protein target, three small cards for water, steps and sleep (the last 12 days as mini bars, the average
// and the days on target), and the fasting strip — from the range's v_day rows (GET /api/days), fasts (GET /api/fasts)
// and the rails from settings. The full water, steps and sleep charts and the protein and logging adherence calendars
// sit in the page's detail section.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { DaySummary, Fast, LocalDate } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { CaloriesChart, FastingStrip, frameHeight, MacrosChart } from '../../../charts'
import { ChartCard, formatNumber, isQueryLoading, MiniBars, Panel, QueryStateCard, SectionHeader } from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import { caloriesDays, fastEntries, latestTargets, macrosDays, SLEEP_TARGET_H, sleepNights, stepsDays, waterDays } from './series'

/** The small cards' mini bars: the range's last 12 days (2a's sparkline length). */
const MINI_DAYS = 12
const COUNT_WORDS = ['No', 'One', 'Two', 'Three', 'Four']

interface HabitsColumnProps {
  days: UseQueryResult<DaySummary[], ApiError>
  fasts: UseQueryResult<Fast[], ApiError>
  from: LocalDate
  to: LocalDate
  fastHours: number
  /** Fasts a month from settings; null while settings load. */
  fastsPerMonth: number | null
  /** The calorie floor and ceiling from settings; null while settings load. */
  rails: { floor: number; ceiling: number } | null
}

export function HabitsColumn({ days, fasts, from, to, fastHours, fastsPerMonth, rails }: HabitsColumnProps) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const header = <SectionHeader title="Food, water and recovery" subtitle="Per day against the targets" />
  if (!days.data)
    return (
      <Box>
        {header}
        <Box sx={{ display: 'grid', gap: 4 }}>
          <QueryStateCard query={days} what="your days" height={frameHeight(220)} titleSize="card" />
          {isQueryLoading(days) && <QueryStateCard query={days} what="your days" height={frameHeight(220)} titleSize="card" />}
        </Box>
      </Box>
    )

  const rows = days.data
  const targets = latestTargets(rows)
  const meals = rows.some((d) => d.meals_logged > 0 || d.is_fast_day)
  const entries = fasts.data ? fastEntries(fasts.data, Date.now(), fastHours) : []
  const stripTo = entries.reduce((latest, f) => (f.date > latest ? f.date : latest), to)
  const proteinTarget = targets?.protein_g
  const water = waterDays(rows).slice(-MINI_DAYS).map((d) => d.ml ?? null)
  const steps = stepsDays(rows).slice(-MINI_DAYS).map((d) => d.steps ?? null)
  const sleep = sleepNights(rows).slice(-MINI_DAYS).map((n) => n.hours ?? null)
  const litres = (ml: number) => `${formatNumber(ml / 1000, ml % 1000 === 0 ? 0 : 1)} L`
  const fastsLine = fastsPerMonth === null ? `${fastHours} h fasts` : `${COUNT_WORDS[fastsPerMonth] ?? fastsPerMonth} ${fastHours} h fasts a month`

  return (
    <Box data-testid="progress-habits">
      {header}
      <Box sx={{ display: 'grid', gap: 4 }}>
        <ChartCard
          title="Calories vs target"
          titleSize="card"
          subtitle={
            rails
              ? `Rails: floor ${formatNumber(rails.floor)} · ceiling ${formatNumber(rails.ceiling)}`
              : targets
                ? `kcal per day by meal slot; target ${formatNumber(targets.kcal)} kcal`
                : 'kcal per day by meal slot'
          }
          empty={
            meals
              ? undefined
              : {
                  title: 'No meals logged in this range',
                  body: 'Each meal you log stacks into its slot here.',
                  action: { label: 'Log a meal', onClick: () => openQuickLog('meal') },
                }
          }
        >
          <CaloriesChart days={caloriesDays(rows)} target={targets?.kcal} height={160} />
        </ChartCard>

        <ChartCard
          title="Macros"
          titleSize="card"
          subtitle={proteinTarget ? `Grams per day, stacked · protein target ${formatNumber(proteinTarget)} g as the line` : 'Grams per day, stacked'}
          empty={meals ? undefined : { title: 'No meals logged in this range' }}
        >
          <MacrosChart days={macrosDays(rows)} proteinTarget={proteinTarget} height={160} />
        </ChartCard>

        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' } }}>
          <MiniCard
            title="Water"
            metric="water"
            testId="chart-water-mini"
            values={water}
            target={targets?.water_ml ?? null}
            average={(v) => `avg ${litres(Math.round(v))}`}
            onTarget={(hit, n, t) => `${hit} of ${n} days at ${litres(t)}`}
            empty={
              <Button variant="text" size="tiny" onClick={() => openQuickLog('water')}>
                Log water
              </Button>
            }
          />
          <MiniCard
            title="Steps"
            metric="steps"
            testId="chart-steps-mini"
            values={steps}
            target={targets?.steps ?? null}
            average={(v) => `avg ${formatNumber(v)}`}
            onTarget={(hit, n, t) => `${hit} of ${n} days at ${formatNumber(t)}`}
            empty="Steps arrive from the Apple Watch Shortcut or the manual form."
          />
          <MiniCard
            title="Sleep"
            metric="sleep"
            testId="chart-sleep-mini"
            values={sleep}
            target={SLEEP_TARGET_H}
            average={(v) => `avg ${formatNumber(v, 1)} h`}
            onTarget={(hit, n, t) => `${hit} of ${n} ${n === 1 ? 'night' : 'nights'} at ${formatNumber(t, 1)} h`}
            empty="Last night’s sleep arrives from the Apple Watch Shortcut or the manual form."
          />
        </Box>

        {!fasts.data ? (
          <QueryStateCard query={fasts} what="your fasts" height={90} titleSize="card" />
        ) : (
          <ChartCard title="Fasting" titleSize="card" subtitle={`${fastsLine} · planned, done, partial, missed`}>
            <FastingStrip fasts={entries} from={from} to={stripTo} />
          </ChartCard>
        )}
      </Box>
    </Box>
  )
}

interface MiniCardProps {
  title: string
  metric: MetricKey
  /** The mini bars' chart-level test id. */
  testId: string
  /** One value per day, oldest first; null = nothing logged. */
  values: readonly (number | null)[]
  target: number | null
  /** "avg 2.8 L" from the mean of the logged days. */
  average: (mean: number) => string
  /** "5 of 12 days at 3 L" from the days at or above the target, the logged days and the target. */
  onTarget: (hit: number, logged: number, target: number) => string
  /** What the card says when none of its days has a value. */
  empty: ReactNode
}

/** A 2a small card: the 13/600 title with the average on the right, 56 px mini bars, the days on target under them. */
function MiniCard({ title, metric, testId, values, target, average, onTarget, empty }: MiniCardProps) {
  const logged = values.filter((v): v is number => v !== null && v > 0)
  const mean = logged.length ? logged.reduce((s, v) => s + v, 0) / logged.length : null
  const hit = target === null ? 0 : logged.filter((v) => v >= target).length
  const caption = target !== null && logged.length ? onTarget(hit, logged.length, target) : null
  return (
    <Panel padding="dense">
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2, mb: '12px' }}>
        <Box component="h3" sx={{ m: 0, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, fontWeight: tokens.font.weight.heading }}>
          {title}
        </Box>
        {mean !== null && (
          <Box component="span" sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            {average(mean)}
          </Box>
        )}
      </Box>
      <MiniBars
        values={values}
        metric={metric}
        target={target}
        height={56}
        testId={testId}
        label={`${title}, last ${values.length} days${mean !== null ? `: ${average(mean)}` : ': nothing logged'}${caption ? `; ${caption}` : ''}`}
      />
      <Box sx={{ mt: '8px', fontSize: tokens.font.size.micro, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary }}>
        {logged.length ? caption : empty}
      </Box>
    </Panel>
  )
}
