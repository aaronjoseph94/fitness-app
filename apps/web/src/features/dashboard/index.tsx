// Owns: the Dashboard — the app's overview of a window of history (2a). A title row opens it (the window's dates and
// days logged, the 30 / 90 / 180-day segmented window, Export), then the "Now" band of the window's headline numbers
// beside the goals rail, then four sections of history (body, nutrition, recovery and habits, training). The window is
// 30, 90 or 180 days (?window=). On a phone the sections fold away and open on a tap; from `md` up they are always open
// and their cards sit in rows, so a desktop shows the whole picture at once. Reads GET /api/days, /api/trend,
// /api/fasts, /api/sessions, /api/scans and /api/settings. Needs a connection.
import FileDownloadOutlined from '@mui/icons-material/FileDownloadOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import { Link as RouterLink, useSearchParams } from 'react-router'
import { problemText, signInAgain } from '../../api'
import { useLocalToday } from '../../app/local-today'
import { LinkRow, SettingsGroup } from '../settings/rows'
import { formatLongDate, formatShortDate, PageHeader, Reveal, SectionHeader, Segmented, staggerDelay } from '../../components'
import { tokens, transitionOf } from '../../theme'
import { BodySection } from './lib/BodySection'
import { GoalRail, goalFacts, LatestDay } from './lib/GoalRail'
import { dashboardKpis } from './lib/kpis'
import { KpiBand } from './lib/KpiBand'
import { NutritionSection } from './lib/NutritionSection'
import { RecoverySection } from './lib/RecoverySection'
import { TrainingSection } from './lib/TrainingSection'
import { DEFAULT_WINDOW, useDashboardData, WINDOWS, type WindowKey } from './lib/useDashboardData'

function isWindowKey(value: string | null): value is WindowKey {
  return WINDOWS.some((w) => w.key === value)
}

/** 2a: 24 px between the title row and each section on a desktop (the shell's main gap); a phone keeps 24 too. */
const PAGE_GAP = 6

/** 2a's entrance: the four sections rise in 90 ms apart, after the Now band (80 ms): 170, 260, 350 and 440 ms. */
const sectionDelay = (i: number) => staggerDelay(i, tokens.motion.stagger.section, 170)

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const windowKey: WindowKey = isWindowKey(params.get('window')) ? (params.get('window') as WindowKey) : DEFAULT_WINDOW
  const date = useLocalToday()
  const { data, loading, refreshing, error } = useDashboardData(windowKey, date)

  const controls = (
    <>
      <Segmented
        ariaLabel="Window shown"
        value={windowKey}
        onChange={(next) => setParams(next === DEFAULT_WINDOW ? {} : { window: next }, { replace: true })}
        options={WINDOWS.map((w) => ({ value: w.key, label: `${w.days} days` }))}
        testId="dashboard-window"
      />
      <Button component={RouterLink} to="/settings/data" variant="outlined" startIcon={<FileDownloadOutlined />}>
        Export
      </Button>
    </>
  )

  if (loading && !data)
    return (
      <Stack spacing={PAGE_GAP} data-testid="dashboard-page" aria-busy="true">
        <PageHeader testId="dashboard-hero" title="Welcome back, Aaron" pageName="Dashboard" action={controls} />
        {/* The skeleton is the shape of the band it replaces: one hero, the goals rail beside it, then the tiles. */}
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))', lg: 'repeat(12, minmax(0, 1fr))' } }}>
          <Skeleton variant="rounded" height={236} sx={{ gridColumn: { xs: 'span 1', sm: 'span 2', md: 'span 6', lg: 'span 8' } }} />
          <Skeleton variant="rounded" height={488} sx={{ gridColumn: { xs: 'span 1', sm: 'span 2', md: 'span 6', lg: 'span 4' }, gridRow: { lg: 'span 2' } }} />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={236} sx={{ gridColumn: { xs: 'span 1', md: 'span 3', lg: 'span 4' } }} />
          ))}
        </Box>
      </Stack>
    )

  // Reached when both essentials have stopped without data: a failure, or a read the network paused with nothing
  // saved on this phone (no `error` at all — the offline case, which gets the calm card rather than an "error"). A
  // skeleton must not come first here, because this is the only branch that carries the way on (sign in, or retry).
  if (!data)
    return (
      // The page keeps its one h1 above the card, so the outline still names the page; the card is the way on.
      <Stack spacing={PAGE_GAP}>
        {/* The window control stays, so a failed switch can go back to a window this phone already holds. */}
        <PageHeader testId="dashboard-hero" title="Welcome back, Aaron" pageName="Dashboard" action={controls} />
        {/* 2a draws a failed read as the warning banner (as QueryStateCard does), not the red danger one. */}
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
            : "You're offline and the dashboard hasn't loaded on this phone yet. It fills in once you're back online."}
        </Alert>
      </Stack>
    )

  const facts = goalFacts(data)
  const logged = data.days.filter((d) => d.meals_logged > 0 || d.water_ml > 0).length

  return (
    <Stack
      spacing={PAGE_GAP}
      data-testid="dashboard-page"
      sx={{ pb: { xs: 4, md: 0 }, opacity: refreshing ? 0.6 : 1, transition: transitionOf('opacity', tokens.motion.duration.fast) }}
    >
      <PageHeader
        testId="dashboard-hero"
        title="Welcome back, Aaron"
        pageName="Dashboard"
        subtitle={`${formatLongDate(date)} · ${formatShortDate(data.from)} to ${formatShortDate(data.to)} · ${logged} ${logged === 1 ? 'day' : 'days'} logged since the plan started`}
        action={controls}
      />

      {/* The opening group: the window's headline numbers, the goals rail spanning two of its rows, then the latest
          day. The heading is what makes the band a category rather than a pile: it says what the numbers share. */}
      <Box component="section" aria-labelledby="now-title" data-testid="dashboard-now">
        <SectionHeader id="now" title="Now" subtitle="The window’s headline numbers, each against its target" />
        <KpiBand kpis={dashboardKpis(data)} goal={facts} rail={<GoalRail data={data} facts={facts} />} />
        <Box sx={{ mt: 4 }}>
          <LatestDay data={data} />
        </Box>
      </Box>

      <Reveal delay={sectionDelay(0)}>
        <BodySection data={data} />
      </Reveal>
      <Reveal delay={sectionDelay(1)}>
        <NutritionSection data={data} />
      </Reveal>
      <Reveal delay={sectionDelay(2)}>
        <RecoverySection data={data} />
      </Reveal>
      <Reveal delay={sectionDelay(3)}>
        <TrainingSection data={data} />
      </Reveal>

      {/* A phone has no sidebar: these are its way to the pages the desktop sidebar lists. */}
      <Box sx={{ display: { md: 'none' } }}>
        <SettingsGroup id="more" title="More">
          <LinkRow label="Progress" to="/progress" />
          <LinkRow label="Scans" to="/scans" />
          <LinkRow label="Plan history" to="/plan" />
        </SettingsGroup>
      </Box>
    </Stack>
  )
}
