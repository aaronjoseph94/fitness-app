// Owns: the Today tab (SPEC §6 dashboard, 2a layout): the title row (greeting, the date, the day of the plan and
// today's session; "+ Log" opens the quick-log sheet from `md` up, where the phone's quick-log row and floating button
// are not shown), today's five stat cards (with the fast badge and queued logs), the quick-log row on a phone, the
// weight trend card (headline, chart of the window's weigh-ins and trend, four-stat footer) beside today's session and
// this week, then the pinned coach note with today's day adjustment under it, the AI slot (the latest proposal or AI
// event, any safety flag; live: polled every 15 s while visible) and the recent activity table from the same feed.
// Reads: GET /api/day/:date (with the note and the active plan's forecast), /api/trend, /api/settings,
// /api/week-plans/view, /api/week-plans?status=proposed, /api/events. On a phone the page is one column in that order.
// Second entry point: ./queries (the reads' inputs).
import AddRounded from '@mui/icons-material/AddRounded'
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Snackbar from '@mui/material/Snackbar'
import Stack from '@mui/material/Stack'
import { daysBetween, weekdayOf } from '@fitness/shared/engine'
import { useState } from 'react'
import {
  Column,
  Columns,
  formatClockTime,
  formatLongDate,
  greetingFor,
  isQueryLoading,
  PageHeader,
  QueryStateCard,
  Reveal,
  staggerDelay,
} from '../../components'
import { useLocalToday } from '../../app/local-today'
import { useUiStore } from '../../app/ui-store'
import { tokens } from '../../theme'
import { AiCard, TodayAdjustment } from './lib/AiCard'
import { CoachNote } from './lib/CoachNote'
import { HealthDialog } from './lib/HealthDialog'
import { HeroChart } from './lib/HeroChart'
import { QuickLogRow } from './lib/QuickLogRow'
import { RecentActivity } from './lib/RecentActivity'
import { ThisWeekCard } from './lib/ThisWeekCard'
import { TodayRings } from './lib/TodayRings'
import { TodaySession } from './lib/TodaySession'
import { useEventFeed } from './lib/useEventFeed'
import { useTodayData } from './lib/useToday'

/** Fallbacks while settings load: the goal (SPEC §3) and the water target (SPEC §6). */
const DEFAULT_GOAL_KG = 65
const DEFAULT_WATER_ML = 3000

/** The session and week cards' heights with a planned session, for their placeholders. */
const SESSION_HEIGHT = 326
const WEEK_HEIGHT = 303
/** The recent activity table's height under its title, for its placeholder. */
const ACTIVITY_HEIGHT = 260

/** A bottom-row slot: its cards stacked 16 px apart; gone when it has nothing to show. */
const SLOT = { display: 'grid', gap: 4, alignContent: 'start', minWidth: 0, '&:empty': { display: 'none' } } as const

/** 2a's entrance: the stat cards first, then the 2 : 1 row, then the bottom row, 90 ms apart per card. */
const rowDelay = (row: number, i = 0) => staggerDelay(i, tokens.motion.stagger.section, row === 1 ? 300 : 450)

export function TodayPage() {
  const date = useLocalToday()
  const { day, trend, settings, week, weekPlan, proposed, note, pending } = useTodayData(date)
  const feed = useEventFeed()
  const openQuickLog = useUiStore((s) => s.openQuickLog)
  const [healthOpen, setHealthOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const profile = settings.data?.profile
  const goalKg = profile?.goal_weight_kg ?? DEFAULT_GOAL_KG
  const waterTargetMl = settings.data?.settings.water_target_ml ?? DEFAULT_WATER_ML
  const trainingDays = settings.data?.settings.training_days ?? null
  const workoutReminder = settings.data?.settings.reminders.workout
  // The day carries the active plan's forecast (the same one GET /api/plan returns).
  const forecast = day.data?.forecast ?? null
  const lastPoint = trend.data?.points.findLast((p) => p.trend_kg !== null)
  const trendKg = day.data?.weight.trend_kg ?? lastPoint?.trend_kg ?? null
  const fasting = pending.fast === 'started' || (pending.fast !== 'ended' && day.data?.fast.state === 'active')
  const weighIn = () => openQuickLog('weigh-in')

  // "Wednesday, October 7 · Day 12 of the plan · Upper B — Pull at 4:30 PM", from what has arrived.
  const planDay = profile?.start_date && profile.start_date <= date ? daysBetween(profile.start_date, date) + 1 : null
  const session = day.data?.session ? null : (day.data?.planned_session ?? weekPlan?.plan.sessions[weekdayOf(date)] ?? null)
  const at = workoutReminder?.enabled && workoutReminder.time ? ` at ${formatClockTime(workoutReminder.time)}` : ''
  const subtitle = [formatLongDate(date), planDay && `Day ${planDay} of the plan`, session && `${session.name}${at}`].filter(Boolean).join(' · ')

  return (
    <Stack spacing={{ xs: 4, md: 5 }} data-testid="today-page">
      <PageHeader
        testId="today-hero"
        title={`${greetingFor(new Date().getHours())}, Aaron`}
        pageName="Today"
        subtitle={subtitle}
        action={
          // From `md` up the title row carries the log button; a phone has the floating one and the quick-log row.
          <Button
            variant="contained"
            startIcon={<AddRounded />}
            endIcon={<ExpandMoreRounded />}
            aria-haspopup="dialog"
            onClick={() => openQuickLog()}
            sx={{ display: { xs: 'none', md: 'inline-flex' } }}
          >
            Log
          </Button>
        }
      />

      {!day.data && !isQueryLoading(day) ? (
        <QueryStateCard query={day} what="today" />
      ) : (
        <TodayRings
          day={day.data}
          loading={isQueryLoading(day)}
          pending={pending}
          waterTargetMl={waterTargetMl}
          onAddHealth={() => setHealthOpen(true)}
        />
      )}

      <Box sx={{ display: { md: 'none' } }}>
        <QuickLogRow fasting={fasting} />
      </Box>

      {/* 2 : 1 from `lg` (the chart, then today's session over this week); from `sm` the chart takes the full width
          and the two cards share the row under it; one column on a phone. */}
      <Columns md={1} lg={3}>
        <Column span={2}>
          <Reveal delay={rowDelay(1)}>
            <HeroChart
              trend={trend}
              forecast={forecast}
              trendKg={trendKg}
              rawKg={pending.weighInKg ?? day.data?.weight.raw_kg ?? null}
              rawPending={pending.weighInKg !== null}
              change7dKg={day.data?.weight.change_7d_kg ?? trend.data?.change_7d_kg ?? null}
              startKg={profile?.start_weight_kg ?? null}
              startDate={profile?.start_date ?? null}
              goalKg={goalKg}
              onWeighIn={weighIn}
            />
          </Reveal>
        </Column>
        <Column>
          <Box sx={{ display: 'grid', gap: 4, alignItems: 'start', gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1fr)' } }}>
            {/* Until the day and the week answer, placeholders; if either fails, its banner: "Rest day" or an empty
                week would be a claim. */}
            {isQueryLoading(day) || isQueryLoading(week) ? (
              <>
                <Skeleton variant="rounded" height={SESSION_HEIGHT} />
                <Skeleton variant="rounded" height={WEEK_HEIGHT} />
              </>
            ) : !week.data || !day.data ? (
              <QueryStateCard query={week.data ? day : week} what="today’s session and this week" />
            ) : (
              <>
                <Reveal delay={rowDelay(1, 1)}>
                  <TodaySession date={date} day={day.data} plan={weekPlan} trainingDays={trainingDays} reminder={workoutReminder} />
                </Reveal>
                <Reveal delay={rowDelay(1, 2)}>
                  <ThisWeekCard
                    date={date}
                    day={day.data}
                    week={week.data}
                    proposed={proposed.data ?? []}
                    trainingDays={trainingDays}
                    fastHours={settings.data?.settings.fast_hours ?? null}
                    waterTargetMl={waterTargetMl}
                  />
                </Reveal>
              </>
            )}
          </Box>
        </Column>
      </Columns>

      {/* Coach note (with today's day adjustment under it) : AI slot : recent activity at 1 : 1 : 1.3 from `lg`; the
          first two side by side over the table from `md`; one column on a phone. A slot with nothing to show takes no
          room. */}
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, flexWrap: { md: 'wrap', lg: 'nowrap' }, alignItems: { md: 'flex-start' }, gap: 4 }}>
        <Reveal delay={rowDelay(2)} sx={{ ...SLOT, flex: { md: '1 1 0' } }}>
          {note && <CoachNote note={note} />}
          <TodayAdjustment events={feed.data?.events ?? []} />
        </Reveal>
        <Reveal delay={rowDelay(2, 1)} sx={{ ...SLOT, flex: { md: '1 1 0' } }}>
          <AiCard latest={day.data?.proposals.latest ?? null} pendingCount={day.data?.proposals.pending_count ?? 0} events={feed.data?.events ?? []} />
        </Reveal>
        <Reveal delay={rowDelay(2, 2)} sx={{ ...SLOT, flex: { md: '1 1 100%', lg: '1.3 1 0' } }}>
          {feed.data ? <RecentActivity events={feed.data.events} /> : <QueryStateCard query={feed} what="recent activity" height={ACTIVITY_HEIGHT} />}
        </Reveal>
      </Box>

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
