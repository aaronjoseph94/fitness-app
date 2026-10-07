// Owns: the Today tab (SPEC §6 dashboard): the pinned coach note, the trend-weight header, today's rings (with the fast
// badge and queued logs), the quick-log row, the hero weight chart with the forecast to the goal, the latest proposal or
// AI event (live: polled every 15 s while visible), and "This week". Reads: GET /api/day/:date (with the note and the
// active plan's forecast), /api/trend, /api/settings, /api/week-plans, /api/events. The cards that arrive last (AI,
// This week) sit below the hero chart, so they never push the cards above them down. From `md` up the hero chart takes
// two thirds of the width with those two late cards as a rail beside it, and the rings keep a reading width instead of
// spreading across the wide page; on a phone the page is the single column it always was, in the same order.
// Second entry point: ./queries (the reads' inputs).
import Box from '@mui/material/Box'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { Column, Columns, formatLongDate, greetingFor, isQueryLoading, PageHero, QueryStateCard } from '../../components'
import { useLocalToday } from '../../app/local-today'
import { useUiStore } from '../../app/ui-store'
import { AiCard } from './lib/AiCard'
import { CoachNote } from './lib/CoachNote'
import { HealthDialog } from './lib/HealthDialog'
import { HeroChart } from './lib/HeroChart'
import { QuickLogRow } from './lib/QuickLogRow'
import { ThisWeekCard } from './lib/ThisWeekCard'
import { TodayHeader } from './lib/TodayHeader'
import { TodayRings } from './lib/TodayRings'
import { useEventFeed } from './lib/useEventFeed'
import { useTodayData } from './lib/useToday'

/** Fallbacks while settings load: the goal (SPEC §3) and the water target (SPEC §6). */
const DEFAULT_GOAL_KG = 65
const DEFAULT_WATER_ML = 3000

export function TodayPage() {
  const date = useLocalToday()
  const { day, trend, settings, weekPlan, note, pending } = useTodayData(date)
  const feed = useEventFeed()
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const [healthOpen, setHealthOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const profile = settings.data?.profile
  const goalKg = profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  // The day carries the active plan's forecast (the same one GET /api/plan returns).
  const forecast = day.data?.forecast ?? null
  const lastPoint = trend.data?.points.findLast((p) => p.trend_kg !== null)
  const trendKg = day.data?.weight.trend_kg ?? lastPoint?.trend_kg ?? null
  const fasting = pending.fast === 'started' || (pending.fast !== 'ended' && day.data?.fast.state === 'active')
  const weighIn = () => openQuickLog('weigh-in')

  return (
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="today-page">
      {/* The route handle says `hero: true`, so the top bar keeps only its controls and this owns the page's h1. */}
      <PageHero
        testId="today-hero"
        eyebrow={greetingFor(new Date().getHours())}
        title="Welcome back, Aaron"
        pageName="Today"
        subtitle={formatLongDate(date)}
      />

      {note && <CoachNote note={note} />}

      <TodayHeader
        loading={isQueryLoading(day) && isQueryLoading(trend)}
        startLoading={isQueryLoading(settings)}
        unavailable={!day.data && !trend.data}
        trendKg={trendKg}
        rawKg={pending.weighInKg ?? day.data?.weight.raw_kg ?? null}
        rawPending={pending.weighInKg !== null}
        change7dKg={day.data?.weight.change_7d_kg ?? trend.data?.change_7d_kg ?? null}
        startKg={profile?.start_weight_kg ?? null}
        startDate={profile?.start_date ?? null}
        goalKg={goalKg}
        forecast={forecast}
        onWeighIn={weighIn}
      />

      {!day.data && !isQueryLoading(day) ? (
        <QueryStateCard query={day} what="today" />
      ) : (
        // The metric cards take the page's full width: five of them at the desktop width is 214 px each, which is what
        // lets a four-digit number and its unit sit on one line without truncating.
        <TodayRings
          day={day.data}
          loading={isQueryLoading(day)}
          pending={pending}
          waterTargetMl={settings.data?.settings.water_target_ml ?? DEFAULT_WATER_ML}
          onAddHealth={() => setHealthOpen(true)}
        />
      )}

      <QuickLogRow fasting={fasting} />

      {/* One column on a phone (the same order as before); two thirds for the chart and a rail for the two late cards
          from `md` up. `mdSpan` keeps the board even at 900–1200 px, where three columns would be too narrow. */}
      <Columns md={2} lg={3}>
        <Column span={2} mdSpan={1}>
          <HeroChart trend={trend} forecast={forecast} goalKg={goalKg} onWeighIn={weighIn} />
        </Column>
        <Column span={1}>
          <Stack spacing={4}>
            <AiCard latest={day.data?.proposals.latest ?? null} pendingCount={day.data?.proposals.pending_count ?? 0} events={feed.data?.events ?? []} />
            <ThisWeekCard date={date} day={day.data} weekPlan={weekPlan} trainingDays={settings.data?.settings.training_days ?? null} />
          </Stack>
        </Column>
      </Columns>

      {healthOpen && (
        <HealthDialog
          open
          date={date}
          onClose={() => setHealthOpen(false)}
          onDone={(status) => setNotice(status === 'queued' ? 'Saved on this phone; it syncs when you’re back online.' : 'Saved.')}
        />
      )}
      <Snackbar
        open={notice !== null}
        autoHideDuration={3000}
        onClose={() => setNotice(null)}
        message={notice}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Stack>
  )
}
