// Owns: Progress's food and habit cards (1d), from the range's v_day rows (GET /api/days) and the rails from settings —
// `FoodCards`, calories vs target (stacked by meal slot, the dashed target) beside the macros (stacked grams, the
// dashed protein minimum in amber), two up in a row that wraps; and `HabitCounts`, three small cards for water, steps
// and sleep over the selected range (as the Dashboard counts its window, so "14 of 28" means the same on both): the days on target out of the days logged in Outfit, what the target is,
// and a ramp bar of the share. The fasting strip, the full water, steps and sleep charts and the adherence calendars
// sit in the page's detail section.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { DaySummary, LocalDate } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { ApiError } from '../../../api'
import { useUiStore } from '../../../app/ui-store'
import { CaloriesChart, frameHeight, MacrosChart } from '../../../charts'
import {
  cardSurface,
  ChartCard,
  formatNumber,
  isQueryLoading,
  ProgressBar,
  QueryStateCard,
  staggerDelay,
  wrapCol,
  WrapRow,
} from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import {
  caloriesDays,
  latestTargets,
  macrosDays,
  SLEEP_TARGET_H,
  sleepNights,
  stepsDays,
  waterDays,
} from './series'

/** The food charts' plot height (1d: 120 px of bars, plus the day axis). */
const FOOD_HEIGHT = 160

type Days = UseQueryResult<DaySummary[], ApiError>

export function FoodCards({
  days,
  to,
  rails,
}: {
  days: Days
  /** The range's last day (today): a day still in progress is not counted as a full day. */
  to: LocalDate
  /** The calorie floor and ceiling from settings; null while settings load. */
  rails: { floor: number; ceiling: number } | null
}) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  if (!days.data)
    return (
      <WrapRow gap={tokens.summit.space.gap.tile}>
        <Box sx={wrapCol(1)}>
          <QueryStateCard query={days} what="your days" height={frameHeight(FOOD_HEIGHT)} titleSize="card" />
        </Box>
        {isQueryLoading(days) && (
          <Box sx={wrapCol(1)}>
            <QueryStateCard
              query={days}
              what="your days"
              height={frameHeight(FOOD_HEIGHT)}
              titleSize="card"
            />
          </Box>
        )}
      </WrapRow>
    )

  const rows = days.data
  const targets = latestTargets(rows)
  const meals = rows.some((d) => d.meals_logged > 0 || d.is_fast_day)
  const proteinTarget = targets?.protein_g
  // Full days: meals logged, not a fast, and not today (still in progress).
  const full = rows.filter((d) => d.meals_logged > 0 && !d.is_fast_day && d.date !== to)
  const kcalTarget = targets?.kcal ?? null
  const atOrUnder = kcalTarget === null ? 0 : full.filter((d) => d.intake.kcal <= kcalTarget).length
  const today = rows.find((d) => d.date === to)
  const caloriesCaption =
    kcalTarget !== null && full.length
      ? `${atOrUnder} of ${full.length} full ${full.length === 1 ? 'day' : 'days'} at or under ${formatNumber(kcalTarget)}${today && today.meals_logged > 0 ? ' · today in progress' : ''}`
      : undefined
  const noMeals = {
    title: 'No meals logged in this range',
    body: 'Each meal you log stacks into its slot here.',
    action: { label: 'Log a meal', onClick: () => openQuickLog('meal') },
  }

  return (
    <Box data-testid="progress-habits">
      <WrapRow gap={tokens.summit.space.gap.tile}>
        <Box sx={wrapCol(1)}>
          <ChartCard
            fill
            title="Calories vs target"
            titleSize="card"
            subtitle={
              rails
                ? `Per day by meal · floor ${formatNumber(rails.floor)} · ceiling ${formatNumber(rails.ceiling)}`
                : targets
                  ? `Per day by meal · target ${formatNumber(targets.kcal)} kcal`
                  : 'kcal per day by meal slot'
            }
            empty={meals ? undefined : noMeals}
            caption={caloriesCaption}
          >
            <CaloriesChart
              days={caloriesDays(rows)}
              target={targets?.kcal}
              height={FOOD_HEIGHT}
              legendPlacement="bottom"
            />
          </ChartCard>
        </Box>
        <Box sx={wrapCol(1)}>
          <ChartCard
            fill
            title="Macros"
            titleSize="card"
            subtitle="Protein · carbs · fat, grams a day"
            empty={meals ? undefined : { title: 'No meals logged in this range' }}
          >
            <MacrosChart
              days={macrosDays(rows)}
              proteinTarget={proteinTarget}
              height={FOOD_HEIGHT}
              legendPlacement="bottom"
            />
          </ChartCard>
        </Box>
      </WrapRow>
    </Box>
  )
}

export function HabitCounts({ days }: { days: Days }) {
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  if (!days.data) return <QueryStateCard query={days} what="your days" height={110} titleSize="card" />
  const rows = days.data
  const targets = latestTargets(rows)
  // The whole selected range (the toggle's 4 weeks / 12 weeks / all), not a fixed last 12 days.
  const water = waterDays(rows).map((d) => d.ml ?? null)
  const steps = stepsDays(rows).map((d) => d.steps ?? null)
  const sleep = sleepNights(rows).map((n) => n.hours ?? null)
  const litres = (ml: number) => `${formatNumber(ml / 1000, ml % 1000 === 0 ? 0 : 1)} L`
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '12px',
        minWidth: 0,
      }}
    >
      <CountCard
        index={0}
        title="Water"
        metric="water"
        testId="chart-water-mini"
        values={water}
        target={targets?.water_ml ?? null}
        unit="days"
        at={(t) => `at ${litres(t)}`}
        empty={
          <Button variant="text" size="tiny" onClick={() => openQuickLog('water')}>
            Log water
          </Button>
        }
      />
      <CountCard
        index={1}
        title="Steps"
        metric="steps"
        testId="chart-steps-mini"
        values={steps}
        target={targets?.steps ?? null}
        unit="days"
        at={(t) => `at ${formatNumber(t)}`}
        empty="From the Apple Watch Shortcut or the form."
      />
      <CountCard
        index={2}
        title="Sleep"
        metric="sleep"
        testId="chart-sleep-mini"
        values={sleep}
        target={SLEEP_TARGET_H}
        unit="nights"
        at={(t) => `at ${formatNumber(t, 1)} h`}
        empty="From the Apple Watch Shortcut or the form."
      />
    </Box>
  )
}

interface CountCardProps {
  index: number
  title: string
  metric: MetricKey
  /** The bar's test id. */
  testId: string
  /** One value per day, oldest first; null = nothing logged. */
  values: readonly (number | null)[]
  target: number | null
  /** "days" or "nights". */
  unit: string
  /** "at 3 L" for the target. */
  at: (target: number) => string
  /** What the card says when none of its days has a value. */
  empty: ReactNode
}

/** A 1d small card (radius 22, 16 px in): 12/600 label, "8 / 12" in Outfit 18, "days at 3 L", an 8 px ramp bar. */
function CountCard({ index, title, metric, testId, values, target, unit, at, empty }: CountCardProps) {
  const logged = values.filter((v): v is number => v !== null && v > 0)
  const hit = target === null ? 0 : logged.filter((v) => v >= target).length
  const n = values.length
  const mean = logged.length ? logged.reduce((s, v) => s + v, 0) / logged.length : null
  return (
    <Box
      component="section"
      aria-labelledby={`count-${metric}-title`}
      sx={{
        ...cardSurface,
        borderRadius: `${tokens.radius.small}px`,
        p: '16px',
        minWidth: 0,
      }}
    >
      <Box
        component="h3"
        id={`count-${metric}-title`}
        sx={{
          m: 0,
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.secondary,
        }}
      >
        {title}
      </Box>
      {logged.length > 0 && target !== null ? (
        <>
          <Box
            sx={{
              mt: '4px',
              fontFamily: tokens.font.display,
              fontSize: 18,
              fontWeight: tokens.font.weight.number,
              lineHeight: 1.2,
              color: tokens.ink.text,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {hit}
            <Box
              component="span"
              sx={{
                fontFamily: tokens.font.family,
                fontSize: tokens.font.size.micro,
                color: tokens.ink.secondary,
              }}
            >
              {` / ${n}`}
            </Box>
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.micro,
              fontWeight: tokens.font.weight.label,
              lineHeight: tokens.font.leading.caption,
              color: tokens.ink.secondary,
            }}
          >
            {unit} {at(target)}
          </Box>
          <Box sx={{ mt: '10px' }}>
            <ProgressBar
              value={n ? hit / n : 0}
              color={tokens.metric[metric]}
              height={8}
              delay={staggerDelay(index, 100, 900)}
              label={`${title}: ${hit} of the last ${n} ${unit} ${at(target)}${mean !== null ? `; average ${formatNumber(mean, metric === 'sleep' ? 1 : 0)}` : ''}`}
              testId={testId}
            />
          </Box>
        </>
      ) : (
        <Box
          sx={{
            mt: '6px',
            fontSize: tokens.font.size.micro,
            lineHeight: tokens.font.leading.caption,
            color: tokens.ink.secondary,
          }}
        >
          {empty}
        </Box>
      )}
    </Box>
  )
}
