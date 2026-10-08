// Owns: the Progress tab (SPEC §11 chart inventory, 2a layout) — the title row with the range selector (4 weeks /
// 12 weeks / all, kept in ?range=) and a link to last week's report, the range's four headline numbers, then two
// columns from 900 px: weight and body (left), food, water and recovery (right); training (weekly volume, the volume
// map with its 7-day slider, strength per exercise); the week plan beside the weekly reviews; then the measurements
// and adherence calendars (waist and WHR, photos, protein and logging adherence) and last the scans.
// Data: GET /api/days, /api/trend, /api/fasts, /api/sessions, /api/settings.
// Second entry point: ./series (the weight-series mapping Today shares); third: ./queries (the range the URL asks
// for).
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { addDays, isoWeek } from '@fitness/shared/engine'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { Column, Columns, formatShortDate, PageHeader, Reveal, staggerDelay } from '../../components'
import { useLocalToday } from '../../app/local-today'
import { tokens, transitionOf } from '../../theme'
import { DetailSection } from './lib/DetailSection'
import { HabitsColumn } from './lib/HabitsColumn'
import type { RangeKey } from './lib/range'
import { RangeToggle } from './lib/RangeToggle'
import { latestTargets, rangeDays, rangeSummary } from './lib/series'
import { ScansSection } from './lib/ScansSection'
import { SummaryStats } from './lib/SummaryStats'
import { TrainingSection } from './lib/TrainingSection'
import { useProgressData } from './lib/useProgressData'
import { WeightColumn } from './lib/WeightColumn'
import { WeeklyReviewsSection } from './lib/WeeklyReviewsSection'
import { WeekViewSection } from './lib/WeekViewSection'
import { progressRange } from './queries'

/** Fallbacks while settings load: the goal (SPEC §3) and the fast length (SPEC §2). */
const DEFAULT_GOAL_KG = 65
const DEFAULT_FAST_HOURS = 24

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
  const sincePlan = profile?.start_date === from ? ' since the plan started' : ''
  const subtitle = [
    `${formatShortDate(from)} – ${formatShortDate(to)}`,
    `${length} days`,
    summary ? `${summary.daysWithData} with data${sincePlan}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const dim = { opacity: refreshing ? 0.6 : 1, transition: transitionOf('opacity', tokens.motion.duration.fast) }
  // After the title (0) and the stat cards (150–330 ms), each later group rises 90 ms after the one before it.
  const section = (i: number) => staggerDelay(i, tokens.motion.stagger.section, 360)

  return (
    <Stack spacing={5} data-testid="progress-page" aria-busy={refreshing}>
      <PageHeader
        title="Progress"
        subtitle={<Box component="span" sx={{ fontVariantNumeric: 'tabular-nums' }}>{subtitle}</Box>}
        action={
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, width: { xs: '100%', sm: 'auto' } }}>
            <RangeToggle value={range} onChange={(next) => setParams(next === '4w' ? {} : { range: next }, { replace: true })} />
            <Button variant="outlined" startIcon={<DescriptionOutlined />} component={RouterLink} to={`/reports/week/${isoWeek(addDays(date, -7))}`}>
              Weekly report
            </Button>
          </Box>
        }
      />

      <SummaryStats summary={summary} targets={targets} forecast={trend.data?.forecast ?? null} />

      <Reveal delay={section(0)}>
        <Box sx={dim}>
          <Columns md={2}>
            <Column>
              <WeightColumn
                trend={trend}
                range={range}
                rangeLength={length}
                goalKg={goalKg}
                start={profile ? { date: profile.start_date, kg: profile.start_weight_kg } : null}
              />
            </Column>
            <Column>
              <HabitsColumn
                days={days}
                fasts={fasts}
                from={from}
                to={to}
                fastHours={rails?.fast_hours ?? DEFAULT_FAST_HOURS}
                fastsPerMonth={rails?.fasts_per_month ?? null}
                rails={rails ? { floor: rails.calorie_floor, ceiling: rails.calorie_ceiling } : null}
              />
            </Column>
          </Columns>
        </Box>
      </Reveal>

      <Reveal delay={section(1)}>
        <TrainingSection sessions={sessions} from={from} to={to} />
      </Reveal>

      {/* The week and its reviews are both lists of the recent past, so from 900 px they sit side by side. */}
      <Reveal delay={section(2)}>
        <Columns md={2}>
          <Column>
            <WeekViewSection date={date} />
          </Column>
          <Column>
            <WeeklyReviewsSection />
          </Column>
        </Columns>
      </Reveal>

      <Box sx={dim}>
        <DetailSection trend={trend} days={days} />
      </Box>

      <ScansSection />
    </Stack>
  )
}
