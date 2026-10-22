// Owns: the Progress tab (SPEC §11 chart inventory, 1d "Summit" layout) — the sky hero (the range's dates and days with
// data, the title, where the trend stands against the plan's line and the next camp, the 4 weeks / 12 weeks / all
// range as glass, kept in ?range=, and a link to last week's report), the range's four summary cards, then a 1.3 : 1
// row that wraps: the weight trend over calories and macros (left), the deep-sky "Camps on the way", weekly loss and the
// water / steps / sleep counts (right); then Training (the volume map, strength, the weekly reviews; weekly volume and
// the week plan), the measurements and adherence section (tape, photos, fasting, the full habit charts, the calendars)
// and last the scans.
// Data: GET /api/days, /api/trend, /api/fasts, /api/sessions, /api/settings.
// Second entry point: ./series (the series mappings Today, the Dashboard and the weekly report share); third:
// ./queries (the range the URL asks for); fourth: ./cards (the weekly loss card the Dashboard shows too).
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { addDays, isoWeek } from '@fitness/shared/engine'
import { Link as RouterLink, useSearchParams } from 'react-router'
import {
  formatNumber,
  formatShortDate,
  PageHeader,
  QueryStateCard,
  Reveal,
  staggerDelay,
  wrapCol,
  WrapRow,
} from '../../components'
import { copy } from '../../copy'
import { useLocalToday } from '../../app/local-today'
import { tokens, transitionOf } from '../../theme'
import { DetailSection } from './lib/DetailSection'
import { FoodCards, HabitCounts } from './lib/FoodHabitCards'
import type { RangeKey } from './lib/range'
import { RangeToggle } from './lib/RangeToggle'
import {
  basePlan,
  effectiveRate,
  lastTrend,
  latestTargets,
  milestoneList,
  paceVersusPlan,
  rangeDays,
  rangeSummary,
} from './lib/series'
import { ScansSection } from './lib/ScansSection'
import { SummaryStats } from './lib/SummaryStats'
import { TrainingSection } from './lib/TrainingSection'
import { useProgressData } from './lib/useProgressData'
import { WeeklyLossCard } from './lib/WeeklyLossCard'
import { CampsCard, WeightTrendCard } from './lib/WeightCards'
import { progressRange } from './queries'

/** Fallbacks while settings load: the goal (SPEC §3) and the fast length (SPEC §2). */
const DEFAULT_GOAL_KG = 65
const DEFAULT_FAST_HOURS = 24

/** A single-column stack (README §4: a grid stack declares its one track), `gap` px apart. */
const stack = (gap: number) =>
  ({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: `${gap}px`, minWidth: 0 }) as const

/** "Apr 9, 2027" outside this year, "Nov 12" in it. */
const shortDate = (date: string, today: string) =>
  date.slice(0, 4) === today.slice(0, 4)
    ? formatShortDate(date)
    : `${formatShortDate(date)}, ${date.slice(0, 4)}`

export function ProgressPage() {
  const [params, setParams] = useSearchParams()
  const range: RangeKey = progressRange(params.get('range'))
  const date = useLocalToday()
  const { from, to, settings, days, trend, fasts, sessions } = useProgressData(range, date)
  const length = rangeDays(from, to)
  const goalKg = settings.data?.profile.goal_weight_kg ?? DEFAULT_GOAL_KG
  const summary = days.data && trend.data ? rangeSummary(days.data, trend.data.points) : null
  const targets = days.data ? latestTargets(days.data) : null
  const refreshing = days.isPlaceholderData || trend.isPlaceholderData
  const profile = settings.data?.profile
  const rails = settings.data?.settings
  const plan = basePlan(profile ?? null)
  const sincePlan = profile?.start_date === from ? ` since ${copy.startLabel}` : ''
  const dim = {
    opacity: refreshing ? 0.6 : 1,
    transition: transitionOf('opacity', tokens.motion.duration.fast),
  }
  // After the hero (0) and the summary cards (150–360 ms), each later group rises 90 ms after the one before it.
  const section = (i: number) => staggerDelay(i, tokens.motion.stagger.section, 380)

  // Where the forecast stands against the pace the summit date needs (as the Dashboard says it), and the next camp
  // with its forecast date.
  const last = trend.data ? lastTrend(trend.data.points) : null
  const pace = paceVersusPlan({
    nowKg: last?.kg ?? null,
    goalKg: profile?.goal_weight_kg ?? null,
    today: date,
    goalDate: profile?.goal_date ?? null,
    weeklyRateKg: trend.data?.forecast?.weekly_rate_kg,
  })
  const next =
    trend.data && last
      ? milestoneList(
          trend.data.milestones,
          last,
          trend.data.forecast ? effectiveRate(last, trend.data.forecast, goalKg) : null,
        ).find((m) => m.state === 'next')
      : undefined
  const subtitle = [
    pace.ahead !== null
      ? `${pace.ahead ? 'Ahead of' : 'Behind'} the ${formatNumber(pace.requiredRate, 2)} kg a week the ${copy.goalLabel} date needs`
      : null,
    next
      ? `${copy.nextMilestone.toLowerCase()} ${next.label}${next.expectedOn ? ` on ${shortDate(next.expectedOn, date)}` : ''}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box data-testid="progress-page" aria-busy={refreshing} sx={stack(tokens.rhythm.section)}>
      <PageHeader
        title="Progress"
        eyebrow={
          <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>
            {formatShortDate(from)} – {formatShortDate(to)} · {length} days
            {/* The count lands with the range's data: until then it is held invisibly, so the eyebrow has its final
                length from the first paint and nothing under it moves. */}
            <Box component="span" sx={{ visibility: summary ? 'visible' : 'hidden' }}>
              {' · '}
              {summary?.daysWithData ?? length} with data{sincePlan}
            </Box>
          </Box>
        }
        // A space holds the line while the range loads, so the hero does not grow when the sentence lands.
        subtitle={subtitle || ' '}
        action={
          // Direct children of the hero's action row, so they take the sky's glass (PageHeader's `skyControls`).
          <>
            <RangeToggle
              value={range}
              onChange={(next) => setParams(next === '4w' ? {} : { range: next }, { replace: true })}
            />
            <Button
              variant="outlined"
              startIcon={<DescriptionOutlined />}
              component={RouterLink}
              to={`/reports/week/${isoWeek(addDays(date, -7))}`}
            >
              Weekly report
            </Button>
          </>
        }
      />

      <SummaryStats summary={summary} targets={targets} forecast={trend.data?.forecast ?? null} />

      <Box sx={dim}>
        <WrapRow align="flex-start">
          <Box sx={{ ...wrapCol(1.3), ...stack(tokens.summit.space.gap.tile) }}>
            <Reveal delay={section(0)}>
              <WeightTrendCard trend={trend} range={range} rangeLength={length} goalKg={goalKg} plan={plan} />
            </Reveal>
            <Reveal delay={section(2)}>
              <FoodCards
                days={days}
                to={to}
                rails={rails ? { floor: rails.calorie_floor, ceiling: rails.calorie_ceiling } : null}
              />
            </Reveal>
          </Box>
          <Box sx={{ ...wrapCol(1), ...stack(tokens.summit.space.gap.tile) }}>
            <Reveal delay={section(1)}>
              <CampsCard
                trend={trend}
                goalKg={goalKg}
                start={profile ? { date: profile.start_date, kg: profile.start_weight_kg } : null}
              />
            </Reveal>
            <Reveal delay={section(2)}>
              {trend.data ? (
                <WeeklyLossCard trend={trend.data} height={150} titleSize="card" />
              ) : (
                <QueryStateCard query={trend} what="the weekly loss" height={190} titleSize="card" />
              )}
            </Reveal>
            <Reveal delay={section(3)}>
              <HabitCounts days={days} />
            </Reveal>
          </Box>
        </WrapRow>
      </Box>

      <Reveal delay={section(4)}>
        <TrainingSection sessions={sessions} from={from} to={to} date={date} />
      </Reveal>

      <Box sx={dim}>
        <DetailSection
          trend={trend}
          days={days}
          fasts={fasts}
          from={from}
          to={to}
          fastHours={rails?.fast_hours ?? DEFAULT_FAST_HOURS}
          fastsPerMonth={rails?.fasts_per_month ?? null}
        />
      </Box>

      <ScansSection />
    </Box>
  )
}
