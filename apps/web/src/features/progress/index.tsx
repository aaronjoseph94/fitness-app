// Owns: the Progress tab (SPEC §11 chart inventory) — range selector (4 w / 12 w / all, kept in ?range=), the range's
// headline numbers, then two columns from 900 px: weight and body (left), food, water and recovery (right), and the
// training charts that later phases bring. Data: GET /api/days, /api/trend, /api/fasts, /api/settings.
// Second entry point: ./series (the weight-series mapping Today shares).
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import { useSearchParams } from 'react-router'
import { useLocalToday } from '../../app/local-today'
import { ChartCard, SectionHeader } from '../../components'
import { tokens } from '../../theme'
import { HabitsColumn } from './lib/HabitsColumn'
import { isRangeKey, type RangeKey } from './lib/range'
import { RangeToggle } from './lib/RangeToggle'
import { latestTargets, rangeDays, rangeSummary } from './lib/series'
import { SummaryStats } from './lib/SummaryStats'
import { useProgressData } from './lib/useProgressData'
import { WeightColumn } from './lib/WeightColumn'
import { WeeklyReviewsSection } from './lib/WeeklyReviewsSection'
import { WeekViewSection } from './lib/WeekViewSection'

/** Fallbacks while settings load: the goal (SPEC §3) and the fast length (SPEC §2). */
const DEFAULT_GOAL_KG = 65
const DEFAULT_FAST_HOURS = 24

export function ProgressPage() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('range')
  const range: RangeKey = isRangeKey(requested) ? requested : '4w'
  const date = useLocalToday()
  const { from, to, settings, days, trend, fasts } = useProgressData(range, date)
  const length = rangeDays(from, to)
  const goalKg = settings.data?.profile.goal_weight_kg ?? DEFAULT_GOAL_KG
  const summary = days.data && trend.data ? rangeSummary(days.data, trend.data.points) : null
  const proteinTarget = days.data ? (latestTargets(days.data)?.protein_g ?? null) : null
  const refreshing = days.isPlaceholderData || trend.isPlaceholderData

  return (
    <Stack spacing={4} data-testid="progress-page" aria-busy={refreshing}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
        <RangeToggle value={range} onChange={(next) => setParams(next === '4w' ? {} : { range: next }, { replace: true })} />
        <Box sx={{ fontSize: 14, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {from} – {to}
        </Box>
      </Box>

      {summary && <SummaryStats summary={summary} proteinTarget={proteinTarget} days={length} />}

      <Grid container spacing={4} sx={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 150ms' }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <WeightColumn trend={trend} range={range} rangeLength={length} goalKg={goalKg} />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <HabitsColumn
            days={days}
            fasts={fasts}
            from={from}
            to={to}
            fastHours={settings.data?.settings.fast_hours ?? DEFAULT_FAST_HOURS}
          />
        </Grid>
      </Grid>

      <Box>
        <SectionHeader title="Training" subtitle="Volume and strength charts arrive with session logging." />
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <ChartCard
            title="Training volume per week"
            subtitle="Sets × reps × kg, stacked by muscle group"
            empty={{ title: 'Arrives in phase 3', body: 'Session logging brings weekly volume and the muscle map.', illustration: null }}
            testId="placeholder-volume"
          />
          <ChartCard
            title="Strength per exercise"
            subtitle="Top set load and estimated 1RM"
            empty={{ title: 'Arrives in phase 3', body: 'Each exercise gets its load and e1RM line once sets are logged.', illustration: null }}
            testId="placeholder-strength"
          />
        </Box>
      </Box>

      <WeekViewSection date={date} />

      <WeeklyReviewsSection />
    </Stack>
  )
}

