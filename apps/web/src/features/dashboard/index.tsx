// Owns: the Dashboard — the app's overview of a window of history (1d "Summit"). The sky hero opens it ("The climb so
// far" and the window's dates, the title, the days logged and the expenditure estimate, the 30 / 90 / 180-day window
// as glass and Export); then, on the cream panel, the trend card beside the deep-sky "Against the plan", the five KPI
// tiles, weekly loss / body composition / macros, and Training; then the detail sections (the latest day, the weight
// journey with the tape and the camps, calories and protein, recovery and habits). Every row of cards wraps rather
// than squeezing (README §4). The window is 30, 90 or 180 days (?window=). On a phone the detail sections fold away and
// open on a tap. Reads GET /api/days, /api/trend, /api/fasts, /api/sessions, /api/scans and /api/settings. Needs a
// connection.
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { problemText, signInAgain } from '../../api'
import { useLocalToday } from '../../app/local-today'
import { LinkRow, SettingsGroup } from '../settings/rows'
import {
  formatNumber,
  formatShortDate,
  PageHeader,
  Reveal,
  Segmented,
  staggerDelay,
  visuallyHidden,
  wrapCol,
  WrapRow,
} from '../../components'
import { copy } from '../../copy'
import { tokens, transitionOf } from '../../theme'
import { WeeklyLossCard } from '../progress/cards'
import { BodySection, CompositionCard } from './lib/BodySection'
import { GoalRail, goalFacts, LatestDay } from './lib/GoalRail'
import { dashboardKpis } from './lib/kpis'
import { KpiBand } from './lib/KpiBand'
import { MacrosCard, NutritionSection } from './lib/NutritionSection'
import { RecoverySection } from './lib/RecoverySection'
import { TrainingSection } from './lib/TrainingSection'
import { DEFAULT_WINDOW, useDashboardData, WINDOWS, type WindowKey } from './lib/useDashboardData'

function isWindowKey(value: string | null): value is WindowKey {
  return WINDOWS.some((w) => w.key === value)
}

/** The weekly loss bars' plot height (1d: 150 px of bars plus their labels). */
const LOSS_HEIGHT = 170

/** README §2: 26 px between a page's rows of cards. */
const ROW_GAP = tokens.rhythm.section

/** The page's column: rows of cards 26 px apart, never wider than the panel (a single-column grid stack, README §4). */
const column = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: `${ROW_GAP}px`,
  minWidth: 0,
} as const

/** The entrance: after the opening band (80–600 ms), each later group rises 90 ms after the one before it. */
const sectionDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.section, 620)

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const windowKey: WindowKey = isWindowKey(params.get('window'))
    ? (params.get('window') as WindowKey)
    : DEFAULT_WINDOW
  const date = useLocalToday()
  const { data, loading, refreshing, error } = useDashboardData(windowKey, date)

  // Direct children of the hero's action row, so they take the sky's glass (PageHeader's `skyControls`).
  const controls = (
    <>
      <Segmented
        ariaLabel="Window shown"
        value={windowKey}
        onChange={(next) => setParams(next === DEFAULT_WINDOW ? {} : { window: next }, { replace: true })}
        options={WINDOWS.map((w) => ({ value: w.key, label: `${w.days} days` }))}
        testId="dashboard-window"
      />
      <Button
        component={RouterLink}
        to="/settings/data"
        variant="outlined"
        startIcon={<FileDownloadOutlined />}
      >
        Export
      </Button>
    </>
  )

  if (loading && !data)
    return (
      <Box data-testid="dashboard-page" aria-busy="true" sx={column}>
        <PageHeader testId="dashboard-hero" eyebrow={copy.planSoFar} title="Dashboard" action={controls} />
        {/* The skeleton is the shape of the band it replaces: the trend card and the rail, then the five tiles. */}
        <WrapRow>
          <Box sx={wrapCol(1.6)}>
            <Skeleton variant="rounded" height={340} sx={{ borderRadius: `${tokens.radius.card}px` }} />
          </Box>
          <Box sx={wrapCol(1)}>
            <Skeleton variant="rounded" height={340} sx={{ borderRadius: `${tokens.radius.card}px` }} />
          </Box>
        </WrapRow>
        <WrapRow gap={tokens.summit.space.gap.tile}>
          {Array.from({ length: 5 }, (_, i) => (
            <Box key={i} sx={wrapCol(1, tokens.layout.wrapBasis.tile)}>
              <Skeleton variant="rounded" height={170} sx={{ borderRadius: `${tokens.radius.tile}px` }} />
            </Box>
          ))}
        </WrapRow>
      </Box>
    )

  // Reached when both essentials have stopped without data: a failure, or a read the network paused with nothing
  // saved on this device (no `error` at all — the offline case, which gets the calm card rather than an "error"). A
  // skeleton must not come first here, because this is the only branch that carries the way on (sign in, or retry).
  if (!data)
    return (
      // The page keeps its one h1 above the card, so the outline still names the page; the card is the way on.
      <Box sx={column}>
        {/* The window control stays, so a failed switch can go back to a window this device already holds. */}
        <PageHeader testId="dashboard-hero" eyebrow={copy.planSoFar} title="Dashboard" action={controls} />
        {/* A failed read is the warning banner (as QueryStateCard draws it), not the red danger one. */}
        <Alert
          severity={error ? 'warning' : 'info'}
          data-testid="dashboard-error"
          action={
            error?.kind === 'auth-expired' ? (
              <Button color="inherit" onClick={signInAgain}>
                Sign in again
              </Button>
            ) : (
              <Button color="inherit" onClick={() => globalThis.location.reload()}>
                Try again
              </Button>
            )
          }
        >
          {error
            ? `Couldn't load the dashboard. ${problemText(error)}`
            : "You're offline and the dashboard hasn't loaded on this device yet. It fills in once you're back online."}
        </Alert>
      </Box>
    )

  const facts = goalFacts(data)
  const logged = data.days.filter((d) => d.meals_logged > 0 || d.water_ml > 0).length
  const firstDay = data.days[0]?.date ?? data.from
  const tdee = data.trend?.forecast?.tdee_est ?? null
  const subtitle = [
    `${logged} of ${data.days.length} ${data.days.length === 1 ? 'day' : 'days'} logged`,
    `${data.windowDays}-day window`,
    tdee !== null ? `expenditure estimate ${formatNumber(tdee)} kcal a day` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Box
      data-testid="dashboard-page"
      sx={{
        ...column,
        opacity: refreshing ? 0.6 : 1,
        transition: transitionOf('opacity', tokens.motion.duration.fast),
      }}
    >
      <PageHeader
        testId="dashboard-hero"
        eyebrow={`${copy.planSoFar} · ${formatShortDate(firstDay)} – ${formatShortDate(data.to)}`}
        title="Dashboard"
        subtitle={subtitle}
        action={controls}
      />

      {/* The opening group: the trend and the plan, then the window's headline numbers, each against its target. */}
      <Box
        component="section"
        aria-labelledby="now-title"
        data-testid="dashboard-now"
        sx={{ ...column, minWidth: 0 }}
      >
        <Box component="h2" id="now-title" sx={visuallyHidden}>
          Now
        </Box>
        <KpiBand
          kpis={dashboardKpis(data)}
          goal={facts}
          rail={<GoalRail data={data} facts={facts} />}
          today={data.to}
          todayLast={data.days.at(-1)?.date === data.to}
        />
        <WrapRow>
          {[
            {
              ratio: 1.2,
              card: (
                <WeeklyLossCard trend={data.trend} height={LOSS_HEIGHT} fill testId="dashboard-weekly-loss" />
              ),
            },
            { ratio: 1, card: <CompositionCard data={data} /> },
            { ratio: 1.1, card: <MacrosCard data={data} /> },
          ].map(({ ratio, card }, i) => (
            <Box key={i} sx={{ ...wrapCol(ratio), display: 'flex' }}>
              <Reveal delay={staggerDelay(i, tokens.motion.stagger.section, 520)} sx={{ width: '100%' }}>
                {card}
              </Reveal>
            </Box>
          ))}
        </WrapRow>
      </Box>

      <Reveal delay={sectionDelay(0)}>
        <TrainingSection data={data} />
      </Reveal>

      <Reveal delay={sectionDelay(1)}>
        <Box sx={{ mt: `${40 - ROW_GAP}px` }}>
          <LatestDay data={data} />
        </Box>
      </Reveal>
      <Reveal delay={sectionDelay(2)}>
        <BodySection data={data} />
      </Reveal>
      <Reveal delay={sectionDelay(3)}>
        <NutritionSection data={data} />
      </Reveal>
      <Reveal delay={sectionDelay(4)}>
        <RecoverySection data={data} />
      </Reveal>

      {/* A phone's tab bar has no room for these: its way to the pages the desktop reaches from elsewhere. */}
      <Box sx={{ display: { md: 'none' } }}>
        <SettingsGroup id="more" title="More">
          <LinkRow label="Progress" to="/progress" />
          <LinkRow label="Scans" to="/scans" />
          <LinkRow label="Plan history" to="/plan" />
        </SettingsGroup>
      </Box>
    </Box>
  )
}
