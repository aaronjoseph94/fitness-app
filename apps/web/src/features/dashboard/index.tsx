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
import { Column, Columns, formatLongDate, greetingFor, PageHero } from '../../components'
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
      <Stack spacing={6} data-testid="dashboard-page" aria-busy="true">
        <PageHero testId="dashboard-hero" eyebrow={greetingFor(new Date().getHours())} title="Welcome back" pageName="Dashboard" subtitle={formatLongDate(date)} action={picker} />
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {Array.from({ length: 12 }, (_, i) => (
            <Skeleton key={i} variant="rounded" height={172} sx={{ borderRadius: `${tokens.radius.card}px` }} />
          ))}
        </Box>
      </Stack>
    )

  if (!data)
    return (
      <Alert
        severity="error"
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
        {`Couldn't load the dashboard. ${problemText(error)}`}
      </Alert>
    )

  return (
    <Stack spacing={6} data-testid="dashboard-page" sx={{ pb: 4, opacity: refreshing ? 0.6 : 1, transition: transitionOf('opacity', tokens.motion.duration.fast) }}>
      {/* The route handle says `hero: true`, so this owns the page's h1 and the picker rides beside it. */}
      <PageHero
        testId="dashboard-hero"
        eyebrow={greetingFor(new Date().getHours())}
        title="Welcome back"
        pageName="Dashboard"
        subtitle={`${formatLongDate(date)} · ${data.from} to ${data.to}`}
        action={picker}
      />

      {/* Two thirds of main numbers, one third of where they sit against the plan; the rail drops under the band on a
          narrower desktop rather than squeezing both. */}
      <Columns md={2} lg={3} align="stretch">
        <Column span={2}>
          <KpiBand kpis={dashboardKpis(data)} />
        </Column>
        <Column span={1} mdSpan={2}>
          <GoalRail data={data} />
        </Column>
      </Columns>

      <BodySection data={data} />
      <NutritionSection data={data} />
      <RecoverySection data={data} />
      <TrainingSection data={data} />

      <SettingsGroup id="more" title="More" subtitle="The same numbers, with a window of their own.">
        <LinkRow label="Progress" help="Range selector, plan history and the week view" to="/progress" />
        <LinkRow label="Scans" help="Evolt 360 results and segmental fat" to="/scans" />
        <LinkRow label="Plan history" help="Every plan version, revertible in one tap" to="/plan" />
      </SettingsGroup>
    </Stack>
  )
}
