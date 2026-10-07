// Owns: the Dashboard — the app's overview page. A greeting hero opens it, then a band of the main metrics with their
// sparklines beside a goals rail, then four sections of history (body, nutrition, recovery, training) built from the
// chart kit. The window is 30, 90 or 180 days (?window=). On a phone the sections fold away and open on a tap; from
// `md` up they are always open and their charts sit in two or three columns, so a desktop shows the whole picture at
// once. Reads GET /api/days, /api/trend, /api/fasts, /api/sessions, /api/scans and /api/settings. Needs a connection.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { useSearchParams } from 'react-router'
import { problemText, signInAgain } from '../../api'
import { useLocalToday } from '../../app/local-today'
import { LinkRow, SettingsGroup } from '../settings/rows'
import { formatLongDate, greetingFor, PageHero, SectionHeader } from '../../components'
import { tokens, transitionOf } from '../../theme'
import { BodySection } from './lib/BodySection'
import { GoalRail } from './lib/GoalRail'
import { dashboardKpis } from './lib/kpis'
import { KpiBand } from './lib/KpiBand'
import { NutritionSection } from './lib/NutritionSection'
import { RecoverySection } from './lib/RecoverySection'
import { TrainingSection } from './lib/TrainingSection'
import { DEFAULT_WINDOW, useDashboardData, WINDOWS, type WindowKey } from './lib/useDashboardData'

function isWindowKey(value: string | null): value is WindowKey {
  return WINDOWS.some((w) => w.key === value)
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams()
  const windowKey: WindowKey = isWindowKey(params.get('window')) ? (params.get('window') as WindowKey) : DEFAULT_WINDOW
  const date = useLocalToday()
  const { data, loading, refreshing, error } = useDashboardData(windowKey, date)

  const picker = (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={windowKey}
      onChange={(_, next: WindowKey | null) => next && setParams(next === DEFAULT_WINDOW ? {} : { window: next }, { replace: true })}
      aria-label="Window shown"
      data-testid="dashboard-window"
    >
      {WINDOWS.map((w) => (
        <ToggleButton key={w.key} value={w.key} sx={{ minHeight: tokens.tapTarget, px: 3 }}>
          {w.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )

  if (loading && !data)
    return (
      <Stack spacing={{ xs: 6, md: 8 }} data-testid="dashboard-page" aria-busy="true">
        <PageHero testId="dashboard-hero" eyebrow={greetingFor(new Date().getHours())} title="Welcome back, Aaron" pageName="Dashboard" action={picker} />
        {/* The skeleton is the shape of the band it replaces: one hero, the goals rail beside it, then the tiles. */}
        <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))', lg: 'repeat(12, minmax(0, 1fr))' } }}>
          <Skeleton variant="rounded" height={244} sx={{ gridColumn: { xs: 'span 2', md: 'span 6', lg: 'span 8' }, borderRadius: `${tokens.radius.card}px` }} />
          <Skeleton variant="rounded" height={520} sx={{ gridColumn: { xs: 'span 2', md: 'span 6', lg: 'span 4' }, borderRadius: `${tokens.radius.card}px` }} />
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton
              key={i}
              variant="rounded"
              height={244}
              sx={{ gridColumn: { xs: 'span 1', md: 'span 3', lg: 'span 4' }, borderRadius: `${tokens.radius.card}px` }}
            />
          ))}
        </Box>
      </Stack>
    )

  // Reached when both essentials have stopped without data: a failure, or a read the network paused with nothing
  // saved on this phone (no `error` at all — the offline case, which gets the calm card rather than an "error"). A
  // skeleton must not come first here, because this is the only branch that carries the way on (sign in, or retry).
  if (!data)
    return (
      <Alert
        severity={error ? 'error' : 'info'}
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
    )

  return (
    // 64 px between groups on a desktop and 48 on a phone: the page is a stack of bento groups, so the space between
    // two groups has to be visibly larger than the gutter inside one, or the whole page reads as one long table.
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="dashboard-page" sx={{ pb: 4, opacity: refreshing ? 0.6 : 1, transition: transitionOf('opacity', tokens.motion.duration.fast) }}>
      {/* The route handle says `hero: true`, so this owns the page's h1 and the picker rides beside it. */}
      <PageHero
        testId="dashboard-hero"
        eyebrow={greetingFor(new Date().getHours())}
        title="Welcome back, Aaron"
        pageName="Dashboard"
        subtitle={`${formatLongDate(date)} · ${data.from} to ${data.to}`}
        action={picker}
      />

      {/* The opening group: the window's headline numbers, the goals rail spanning two of its rows. The heading is what
          makes the band a category rather than a pile: it says what the numbers below have in common. */}
      <Box component="section" aria-labelledby="now-title" data-testid="dashboard-now">
        <SectionHeader id="now" title="Now" />
        <KpiBand kpis={dashboardKpis(data)} rail={<GoalRail data={data} />} />
      </Box>

      <BodySection data={data} />
      <NutritionSection data={data} />
      <RecoverySection data={data} />
      <TrainingSection data={data} />

      <SettingsGroup id="more" title="More">
        <LinkRow label="Progress" to="/progress" />
        <LinkRow label="Scans" to="/scans" />
        <LinkRow label="Plan history" to="/plan" />
      </SettingsGroup>
    </Stack>
  )
}
