// Owns: the Train tab (SPEC §7, §11) — today's date and readiness chip, the today card (in progress, done, planned,
// or generate), templates with mini muscle maps and Start, recent sessions, and the way into the library, the
// equipment profile, the builder and AI workouts.
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
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
import { EmptyState, formatShortDate, formatWeekday, LoadProblem, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'
import { useNow } from '../../quick-log'
import { ReadinessChip } from './ReadinessChip'
import { RecentSessions } from './RecentSessions'
import { useStartSession } from './session'
import { TemplateCard } from './TemplateCard'
import { GENERATE_PATH, TodayCard } from './TodayCard'
import { useTrainData } from './useTrainData'

const LINKS: { to: string; label: string; detail: string; Icon: SvgIconComponent; testId: string }[] = [
  {
    to: '/train/library',
    label: 'Exercise library',
    detail: 'Search, filter, form videos',
    Icon: MenuBookOutlined,
    testId: 'link-library',
  },
  {
    to: '/train/equipment',
    label: 'Equipment',
    detail: 'What your gym has, what to avoid',
    Icon: FitnessCenterRounded,
    testId: 'link-equipment',
  },
  {
    to: '/train/builder',
    label: 'Workout builder',
    detail: 'Build a template, fill it with AI',
    Icon: EditNoteRounded,
    testId: 'link-builder',
  },
  {
    to: GENERATE_PATH,
    label: 'AI workout',
    detail: 'A session from your allowed exercises',
    Icon: AutoAwesomeOutlined,
    testId: 'link-ai',
  },
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
    <Stack spacing={5} data-testid="train-page">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{ flex: 1, fontSize: tokens.font.size.emphasis, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}
        >
          {formatWeekday(date)} {formatShortDate(date)}
        </Box>
        {readiness && <ReadinessChip readiness={readiness} />}
      </Box>

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
          <Stack spacing={2}>
            {templates.data.map((t) => (
              <TemplateCard key={t.id} template={t} onStart={startTemplate} />
            ))}
          </Stack>
        ) : (
          <Card>
            <EmptyState
              compact
              illustration="training"
              title="No templates yet"
              body="Build one from the library, or finish a session and save it as a template."
              action={{ label: 'Build a template', onClick: () => void navigate('/train/builder') }}
            />
          </Card>
        )}
      </Box>

      <Box component="section" aria-labelledby="recent-title">
        <SectionHeader id="recent" title="Recent sessions" subtitle="Last four weeks" />
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
            <EmptyState
              compact
              illustration="schedule"
              title="No sessions yet"
              body="Your sessions show here with their sets and volume."
            />
          </Card>
        )}
      </Box>

      <Box component="section" aria-labelledby="more-title">
        <SectionHeader id="more" title="Library and tools" />
        <Card>
          {LINKS.map(({ to, label, detail, Icon, testId }, i) => (
            <ButtonBase
              key={to}
              component={Link}
              to={to}
              data-testid={testId}
              sx={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                px: 4,
                py: 3,
                minHeight: 60,
                justifyContent: 'flex-start',
                textAlign: 'left',
                borderTop: i === 0 ? 'none' : `1px solid ${tokens.ink.border}`,
              }}
            >
              <Icon sx={{ color: tokens.ink.secondary }} aria-hidden />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ fontSize: tokens.font.size.emphasis, fontWeight: tokens.font.weight.label }}>{label}</Box>
                <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{detail}</Box>
              </Box>
              <ChevronRightRounded sx={{ color: tokens.ink.secondary }} aria-hidden />
            </ButtonBase>
          ))}
        </Card>
      </Box>
    </Stack>
  )
}
