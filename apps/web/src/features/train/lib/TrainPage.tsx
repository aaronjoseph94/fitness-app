// Owns: the Train tab (SPEC §7, §11) — the date and readiness chip as the section header, the today card (the session
// in progress, today's finished session, the planned one, or the way to generate), templates with mini muscle maps and
// Start, recent sessions, and one compact strip of four icon buttons into the library, the equipment profile, the
// builder and AI workouts. Three blocks and a strip, no explanatory copy: the tab opens on the session, and everything
// else is a label. On a desktop the sections sit on the shared board: today's session takes the full width, templates
// and recent sessions share a row, and the tool strip closes the page; on a phone the board is one column in this same
// order, so the tab reads exactly as it did.
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import type { SvgIconComponent } from '@mui/icons-material'
import { today } from '@fitness/shared/engine'
import type { Template } from '@fitness/shared/schemas'
import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'
import { Column, Columns, EmptyState, formatShortDate, formatWeekday, LoadProblem, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'
import { useNow } from '../../quick-log'
import { ReadinessChip } from './ReadinessChip'
import { RecentSessions } from './RecentSessions'
import { useStartSession } from './session'
import { TemplateCard } from './TemplateCard'
import { GENERATE_PATH, TodayCard } from './TodayCard'
import { useTrainData } from './useTrainData'

/** The four ways out of this tab, as one strip of equal buttons: icon over a single word. */
const TOOLS: { to: string; label: string; Icon: SvgIconComponent; testId: string }[] = [
  { to: '/train/library', label: 'Library', Icon: MenuBookOutlined, testId: 'link-library' },
  { to: '/train/equipment', label: 'Equipment', Icon: FitnessCenterRounded, testId: 'link-equipment' },
  { to: '/train/builder', label: 'Builder', Icon: EditNoteRounded, testId: 'link-builder' },
  { to: GENERATE_PATH, label: 'AI workout', Icon: AutoAwesomeOutlined, testId: 'link-ai' },
]

export function TrainPage() {
  // Edmonton's date, re-read every minute (the app stays open across midnight).
  const date = today(useNow(60_000))
  const navigate = useNavigate()
  const { day, sessions, templates, active, activeCounts, unsynced, readiness } = useTrainData(date)
  const start = useStartSession()

  const startTemplate = useCallback(
    (t: Template) => start({ origin: 'template', template_id: t.id, name: t.name, exercises: t.exercises }),
    [start],
  )

  return (
    <Stack spacing={{ xs: 6, md: 8 }} data-testid="train-page">
      {/* `gap={5}` matches the `spacing={5}` this page used when it was one stack, so a phone sees the same rhythm. */}
      <Columns md={2} lg={3} gap={5}>
        <Column span={3} mdSpan={2}>
          {/* The date is the heading and the readiness chip its action: the tab opens on the session, not on a header. */}
          <Box component="section" aria-labelledby="today-title">
            <SectionHeader
              id="today"
              title={`${formatWeekday(date)} ${formatShortDate(date)}`}
              action={readiness ? <ReadinessChip readiness={readiness} /> : undefined}
            />
            {day.isLoading && !active ? (
              <Skeleton variant="rounded" height={148} sx={{ borderRadius: `${tokens.radius.card}px` }} />
            ) : (
              <TodayCard
                day={day.data}
                active={active}
                activeCounts={activeCounts}
                templates={templates.data ?? []}
                onStart={start}
              />
            )}
          </Box>
        </Column>

        <Column span={2} mdSpan={1}>
          <Box component="section" aria-labelledby="templates-title">
            <SectionHeader
              id="templates"
              title="Templates"
              action={
                <Button component={Link} to="/train/builder" size="small">
                  New
                </Button>
              }
            />
            {templates.isLoading ? (
              <Stack spacing={2}>
                <Skeleton variant="rounded" height={124} sx={{ borderRadius: `${tokens.radius.card}px` }} />
                <Skeleton variant="rounded" height={124} sx={{ borderRadius: `${tokens.radius.card}px` }} />
              </Stack>
            ) : templates.error && !templates.data ? (
              <LoadProblem
                what="Your templates"
                error={templates.error}
                onRetry={() => void templates.refetch()}
              />
            ) : templates.data?.length ? (
              // One column when there is no room, two or more once the board gives the templates the width.
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' },
                }}
              >
                {templates.data.map((t) => (
                  <TemplateCard key={t.id} template={t} onStart={startTemplate} />
                ))}
              </Box>
            ) : (
              <Card>
                <EmptyState
                  compact
                  illustration="training"
                  title="No templates yet"
                  action={{ label: 'Build a template', onClick: () => void navigate('/train/builder') }}
                />
              </Card>
            )}
          </Box>
        </Column>

        <Column span={1}>
          <Box component="section" aria-labelledby="recent-title">
            <SectionHeader id="recent" title="Recent" />
            {sessions.isLoading ? (
              <Skeleton variant="rounded" height={160} sx={{ borderRadius: `${tokens.radius.card}px` }} />
            ) : sessions.error && !sessions.data ? (
              <LoadProblem
                what="Recent sessions"
                error={sessions.error}
                onRetry={() => void sessions.refetch()}
              />
            ) : (sessions.data?.length ?? 0) + unsynced.length > 0 ? (
              <RecentSessions sessions={sessions.data ?? []} unsynced={unsynced} templates={templates.data} />
            ) : (
              <Card>
                <EmptyState compact illustration="schedule" title="No sessions yet" />
              </Card>
            )}
          </Box>
        </Column>

        <Column span={3} mdSpan={2}>
          {/* A strip, not a list: four equal buttons, each a name and a glyph, so the page ends on a small, quiet row. */}
          <Box
            component="nav"
            aria-label="Training tools"
            data-testid="train-tools"
            sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 2 }}
          >
            {TOOLS.map(({ to, label, Icon, testId }) => (
              <ButtonBase
                key={to}
                component={Link}
                to={to}
                data-testid={testId}
                sx={{
                  minHeight: 76,
                  px: 1,
                  py: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  borderRadius: `${tokens.radius.card}px`,
                  bgcolor: tokens.ink.card,
                  boxShadow: tokens.elevation.card,
                  color: tokens.ink.text,
                  '@media (hover: hover)': {
                    '&:hover': { color: tokens.accent.main },
                  },
                }}
              >
                <Icon sx={{ fontSize: 24, color: tokens.accent.main }} aria-hidden />
                <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, textAlign: 'center' }}>
                  {label}
                </Box>
              </ButtonBase>
            ))}
          </Box>
        </Column>
      </Columns>
    </Stack>
  )
}
