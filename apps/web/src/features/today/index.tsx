// Owns: the Today tab (SPEC §6 dashboard): the pinned coach note, the trend-weight header, today's rings (with the fast
// badge and queued logs), the quick-log row, the latest proposal or AI event (live: polled every 15 s while visible),
// the hero weight chart with the forecast to the goal, and "This week". Reads: GET /api/day/:date, /api/trend,
// /api/plan, /api/settings, /api/notes, /api/week-plans, /api/events.
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { useState } from 'react'
import { isQueryLoading, QueryStateCard } from '../../components'
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
  const { day, trend, plan, settings, weekPlan, note, pending } = useTodayData(date)
  const feed = useEventFeed()
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const [healthOpen, setHealthOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const profile = settings.data?.profile
  const goalKg = profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  const forecast = plan.data?.forecast ?? day.data?.forecast ?? null
  const lastPoint = trend.data?.points.findLast((p) => p.trend_kg !== null)
  const trendKg = day.data?.weight.trend_kg ?? lastPoint?.trend_kg ?? null
  const fasting = pending.fast === 'started' || (pending.fast !== 'ended' && day.data?.fast.state === 'active')
  const weighIn = () => openQuickLog('weigh-in')

  return (
    <Stack spacing={4} data-testid="today-page">
      {note && <CoachNote note={note} />}

      <TodayHeader
        loading={isQueryLoading(day) && isQueryLoading(trend)}
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
        <TodayRings
          day={day.data}
          loading={isQueryLoading(day)}
          pending={pending}
          waterTargetMl={settings.data?.settings.water_target_ml ?? DEFAULT_WATER_ML}
          onAddHealth={() => setHealthOpen(true)}
        />
      )}

      <QuickLogRow fasting={fasting} />

      <AiCard latest={day.data?.proposals.latest ?? null} pendingCount={day.data?.proposals.pending_count ?? 0} events={feed.data?.events ?? []} />

      <HeroChart trend={trend} forecast={forecast} goalKg={goalKg} onWeighIn={weighIn} />

      <ThisWeekCard date={date} day={day.data} weekPlan={weekPlan} trainingDays={settings.data?.settings.training_days ?? null} />

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
