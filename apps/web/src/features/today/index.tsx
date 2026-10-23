// Owns: the Today tab (SPEC §6 dashboard, 1d "Summit" layout: docs/design/design_handoff_fitness_1d README §5.1) — the
// full sky hero (the eyebrow "Day 12 of the climb · Wed, Oct 7"; the trend weight as the page's h1, counting down from
// the start weight; today's weigh-in and the 7-day change; the pills for the change since base camp and kg to the
// summit; the glass "Next camp" card; under it the gold "+ Log" that opens the quick-log sheet, in the headline column
// so it never sits on the mountain; and the mountain with its camps, the summit and "You"), then on the cream panel:
// "Today's fuel" (five capsule gauges, the fast badge and queued logs) beside the pinned coach note over the quick-log
// row (1.45 : 1, wrapping); today's session (with the readiness ring), the AI check-in (today's day adjustment, the
// latest AI event or the pending proposal, any safety flag; live: polled every 15 s while visible) and the deep-sky
// "This week" (1 : 1 : 1, wrapping; its next Evolt scan from the scan schedule); and the recent activity table from the
// same feed.
// Reads: GET /api/day/:date (with the note and the active plan's forecast), /api/trend (milestones too), /api/settings,
// /api/week-plans/view, /api/week-plans?status=proposed, /api/scans/schedule, /api/fasts (this week's planned fasts),
// /api/days and /api/sessions (readiness),
// /api/events, and the exercise library for the session's names.
// Every row wraps instead of squeezing (README §4); on a phone the page is one column in that order.
// Second entry point: ./queries (the reads' inputs).
import AddRounded from '@mui/icons-material/AddRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import { daysBetween } from '@fitness/shared/engine'
import { useMemo, useState } from 'react'
import {
  formatShortDate,
  formatWeekday,
  isQueryLoading,
  PageHeader,
  QueryStateCard,
  Reveal,
  WrapRow,
  wrapCol,
} from '../../components'
import { useLocalToday } from '../../app/local-today'
import { useUiStore } from '../../app/ui-store'
import { copy } from '../../copy'
import { tokens } from '../../theme'
import { lastTrend, plannedFasts } from '../progress/series'
import { AiCard } from './lib/AiCard'
import { climbOf } from './lib/climb'
import { CoachNote } from './lib/CoachNote'
import { HealthDialog } from './lib/HealthDialog'
import { HeroMountain } from './lib/Mountain'
import { QuickLogRow } from './lib/QuickLogRow'
import { RecentActivity } from './lib/RecentActivity'
import { ThisWeekCard } from './lib/ThisWeekCard'
import { TodayRings } from './lib/TodayRings'
import { TodaySession } from './lib/TodaySession'
import { TrendFacts, TrendTitle } from './lib/TodayHeader'
import { useEventFeed } from './lib/useEventFeed'
import { useTodayData } from './lib/useToday'

/** Fallback while settings load: the water target (SPEC §6). */
const DEFAULT_WATER_ML = 3000

/** The second row's cards with a planned session, for their placeholders. */
const ROW_HEIGHT = 420
/** The recent activity table's height under its title, for its placeholder. */
const ACTIVITY_HEIGHT = 260

/** README §6: the panel's cards rise in reading order, 90 ms apart, after the hero. */
const enter = (i: number) => 200 + i * tokens.motion.stagger.section

export function TodayPage() {
  const date = useLocalToday()
  const { day, trend, settings, week, weekPlan, proposed, note, pending, scanDue, fasts, readiness } =
    useTodayData(date)
  const feed = useEventFeed()
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const [healthOpen, setHealthOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const profile = settings.data?.profile
  const waterTargetMl = settings.data?.settings.water_target_ml ?? DEFAULT_WATER_ML
  const trainingDays = settings.data?.settings.training_days ?? null
  const workoutReminder = settings.data?.settings.reminders.workout
  // The day carries the active plan's forecast (the same one GET /api/plan returns); else the trend's own.
  const forecast = day.data?.forecast ?? trend.data?.forecast ?? null
  const last = trend.data ? lastTrend(trend.data.points) : null
  const trendKg = day.data?.weight.trend_kg ?? last?.kg ?? null
  const fasting =
    pending.fast === 'started' || (pending.fast !== 'ended' && day.data?.fast.state === 'active')

  const climb = useMemo(
    () =>
      profile
        ? climbOf({
            startKg: profile.start_weight_kg,
            goalKg: profile.goal_weight_kg,
            milestones: trend.data?.milestones ?? [],
            trend: trendKg !== null ? { date: last?.date ?? date, kg: trendKg } : null,
            forecast,
          })
        : null,
    [profile, trend.data?.milestones, trendKg, last?.date, date, forecast],
  )

  // "Day 12 of the climb · Wed, Oct 7".
  const planDay =
    profile?.start_date && profile.start_date <= date ? daysBetween(profile.start_date, date) + 1 : null
  const eyebrow = [planDay && copy.dayOfPlan(planDay), `${formatWeekday(date)}, ${formatShortDate(date)}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box
      data-testid="today-page"
      sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: `${tokens.rhythm.section}px` }}
    >
      <PageHeader
        variant="today"
        testId="today-hero"
        pageName="Today"
        eyebrow={eyebrow}
        title={<TrendTitle trendKg={trendKg} startKg={profile?.start_weight_kg ?? null} />}
        subtitle={
          <TrendFacts
            climb={climb}
            rawKg={pending.weighInKg ?? day.data?.weight.raw_kg ?? null}
            rawPending={pending.weighInKg !== null}
            change7dKg={day.data?.weight.change_7d_kg ?? trend.data?.change_7d_kg ?? null}
            action={
              <Button
                variant="contained"
                color="gold"
                startIcon={<AddRounded />}
                aria-haspopup="dialog"
                data-testid="today-log"
                onClick={() => openQuickLog()}
              >
                Log
              </Button>
            }
          />
        }
        extras={<HeroMountain climb={climb} />}
      />

      {/* Fuel : coach note over the quick-log row, 1.45 : 1; they wrap to one column rather than squeeze. Without a
          coach note the AI check-in moves up under the quick-log row, so that column is not a lone row of tiles. */}
      <WrapRow align="flex-start">
        <Box sx={wrapCol(1.45)}>
          <Reveal delay={enter(0)}>
            {!day.data && !isQueryLoading(day) ? (
              <QueryStateCard query={day} what="today" />
            ) : (
              <TodayRings
                day={day.data}
                loading={isQueryLoading(day)}
                readAt={day.dataUpdatedAt}
                pending={pending}
                waterTargetMl={waterTargetMl}
                onAddHealth={() => setHealthOpen(true)}
              />
            )}
          </Reveal>
        </Box>
        <Box
          sx={{
            ...wrapCol(1),
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: '20px',
            alignContent: 'start',
          }}
        >
          {note && (
            <Reveal delay={enter(1)}>
              <CoachNote note={note} />
            </Reveal>
          )}
          <QuickLogRow fasting={fasting} />
          {!note && (
            <Reveal delay={enter(1)}>
              <AiCard
                latest={day.data?.proposals.latest ?? null}
                pendingCount={day.data?.proposals.pending_count ?? 0}
                events={feed.data?.events ?? []}
              />
            </Reveal>
          )}
        </Box>
      </WrapRow>

      {/* Today's session : (AI check-in :) this week, 1 : 1 (: 1), each card its own height. Until the day and the
          week answer, placeholders; if either fails, its banner: "Rest day" or an empty week would be a claim. */}
      <WrapRow align="flex-start">
        {isQueryLoading(day) || isQueryLoading(week) ? (
          <>
            <Skeleton
              variant="rounded"
              height={ROW_HEIGHT}
              sx={{ ...wrapCol(1), borderRadius: `${tokens.radius.card}px` }}
            />
            <Skeleton
              variant="rounded"
              height={ROW_HEIGHT}
              sx={{ ...wrapCol(1), borderRadius: `${tokens.radius.card}px` }}
            />
            {note && (
              <Skeleton
                variant="rounded"
                height={ROW_HEIGHT}
                sx={{ ...wrapCol(1), borderRadius: `${tokens.radius.card}px` }}
              />
            )}
          </>
        ) : (
          <>
            <Box sx={wrapCol(1)}>
              <Reveal delay={enter(2)}>
                {day.data ? (
                  <TodaySession
                    date={date}
                    day={day.data}
                    plan={weekPlan}
                    trainingDays={trainingDays}
                    reminder={workoutReminder}
                    readiness={readiness}
                  />
                ) : (
                  <QueryStateCard query={day} what="today’s session" />
                )}
              </Reveal>
            </Box>
            {note && (
              <Box sx={wrapCol(1)}>
                <Reveal delay={enter(3)}>
                  <AiCard
                    latest={day.data?.proposals.latest ?? null}
                    pendingCount={day.data?.proposals.pending_count ?? 0}
                    events={feed.data?.events ?? []}
                  />
                </Reveal>
              </Box>
            )}
            <Box sx={wrapCol(1)}>
              <Reveal delay={enter(4)}>
                {week.data && day.data ? (
                  <ThisWeekCard
                    date={date}
                    day={day.data}
                    week={week.data}
                    proposed={proposed.data ?? []}
                    trainingDays={trainingDays}
                    fastHours={settings.data?.settings.fast_hours ?? null}
                    waterTargetMl={waterTargetMl}
                    scanDue={scanDue}
                    plannedFasts={plannedFasts(fasts, Date.now(), settings.data?.settings.fast_hours ?? 24)}
                  />
                ) : (
                  <QueryStateCard query={week.data ? day : week} what="this week" />
                )}
              </Reveal>
            </Box>
          </>
        )}
      </WrapRow>

      {/* Hidden while the feed has no event (RecentActivity draws nothing then). */}
      <Reveal delay={enter(5)}>
        {feed.data ? (
          <RecentActivity events={feed.data.events} />
        ) : (
          <QueryStateCard query={feed} what="recent activity" height={ACTIVITY_HEIGHT} />
        )}
      </Reveal>

      {healthOpen && (
        <HealthDialog
          open
          date={date}
          onClose={() => setHealthOpen(false)}
          onDone={(status) =>
            setNotice(
              status === 'queued' ? 'Saved on this device; it syncs when you’re back online.' : 'Saved.',
            )
          }
        />
      )}
      <Snackbar
        open={notice !== null}
        autoHideDuration={3000}
        onClose={() => setNotice(null)}
        message={notice}
      />
    </Box>
  )
}
