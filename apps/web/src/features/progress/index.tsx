// Owns: the Progress tab (SPEC §11 chart inventory) — range selector (4 w / 12 w / all, kept in ?range=), the range's
// headline numbers, then two columns from 900 px: weight and body (left), food, water and recovery (right), then
// training (weekly volume, the weekly volume map with its 7-day slider, strength per exercise). Data: GET /api/days,
// /api/trend, /api/fasts, /api/sessions, /api/settings.
// Second entry point: ./series (the weight-series mapping Today shares); third: ./queries (the range the URL asks
// for).
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import { useSearchParams } from 'react-router'
import { Column, Columns } from '../../components'
import { useLocalToday } from '../../app/local-today'
import { tokens, transitionOf } from '../../theme'
import { HabitsColumn } from './lib/HabitsColumn'
import type { RangeKey } from './lib/range'
import { RangeToggle } from './lib/RangeToggle'
import { latestTargets, rangeDays, rangeSummary } from './lib/series'
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
  const proteinTarget = days.data ? (latestTargets(days.data)?.protein_g ?? null) : null
  const refreshing = days.isPlaceholderData || trend.isPlaceholderData

  return (
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="progress-page" aria-busy={refreshing}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 3 }}>
        <RangeToggle value={range} onChange={(next) => setParams(next === '4w' ? {} : { range: next }, { replace: true })} />
        <Box
          sx={{
            fontSize: tokens.font.size.small,
            color: tokens.ink.secondary,
            lineHeight: tokens.font.leading.small,
            letterSpacing: tokens.font.tracking.small,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {from} – {to}
        </Box>
      </Box>

      <SummaryStats summary={summary} proteinTarget={proteinTarget} days={length} />

      <Grid container spacing={4} sx={{ opacity: refreshing ? 0.6 : 1, transition: transitionOf('opacity', tokens.motion.duration.fast) }}>
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

      <TrainingSection sessions={sessions} from={from} to={to} />

      {/* The week and its reviews are both lists of the recent past, so from 900 px they sit side by side and
          together fit one screen instead of two. A phone still reads them one after the other. */}
      <Columns md={2}>
        <Column>
          <WeekViewSection date={date} />
        </Column>
        <Column>
          <WeeklyReviewsSection />
        </Column>
      </Columns>
    </Stack>
  )
}

