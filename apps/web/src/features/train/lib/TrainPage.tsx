// Owns: the Train tab (SPEC §7, §11; 2a "Train") — the title row (the date as the page's h1, the kind of day and
// sessions done this week, the readiness chip and "Blank session"), the today card (the session in progress, today's
// finished session, the planned one, or the way to generate) across the full width, then templates (2 × 2 cards with
// mini muscle maps and Start) beside recent sessions and this week's totals (above them below lg), and a row of four
// tool cards into the library, the equipment profile, the builder and AI workouts. On a phone everything is one column
// in this order.
import AddRounded from '@mui/icons-material/AddRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import type { SvgIconComponent } from '@mui/icons-material'
import { today } from '@fitness/shared/engine'
import type { Template } from '@fitness/shared/schemas'
import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Column,
  Columns,
  dateToTime,
  EmptyState,
  formatShortDate,
  ListRow,
  LoadProblem,
  PageHeader,
  Reveal,
  SectionHeader,
  staggerDelay,
} from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { useExerciseIndex } from '../../library'
import { useNow } from '../../quick-log'
import { ReadinessChip } from './ReadinessChip'
import { lastDoneByTemplate, RecentSessions, weekTotals } from './RecentSessions'
import { useStartSession } from './session'
import { TemplateCard } from './TemplateCard'
import { GENERATE_PATH, TodayCard } from './TodayCard'
import { useTrainData } from './useTrainData'

/** The four ways out of this tab, as a row of tool cards. */
const TOOLS: { to: string; label: string; help?: string; Icon: SvgIconComponent; testId: string }[] = [
  { to: '/train/library', label: 'Exercise library', Icon: MenuBookOutlined, testId: 'link-library' },
  { to: '/train/equipment', label: 'Equipment', help: 'The machines at your gym', Icon: FitnessCenterRounded, testId: 'link-equipment' },
  { to: '/train/builder', label: 'Workout builder', help: 'Create or edit a template', Icon: EditNoteRounded, testId: 'link-builder' },
  { to: GENERATE_PATH, label: 'AI workout', help: 'From your equipment and readiness', Icon: AutoAwesomeRounded, testId: 'link-ai' },
]

const weekdayLong = new Intl.DateTimeFormat('en-CA', { weekday: 'long', timeZone: 'UTC' })

const cardSkeleton = { borderRadius: `${tokens.radius.card}px` } as const

/** Template cards two a row wherever two fit at 300 px, else one; never three (each is at least half the row). */
const templateGrid = {
  display: 'grid',
  gap: 4,
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, max(300px, calc(50% - 8px))), 1fr))',
} as const

/**
 * "+ New template" reads as a link in the section header: its 10 px padding hangs past the column's edge and its
 * height (a small button's 32 px, 44 on touch) past the title's line box, so the Templates and Recent headers keep
 * one height.
 */
const titleLine = tokens.font.size.sectionTitle * tokens.font.leading.sectionTitle
const headerLink = {
  mr: '-10px',
  my: `${(titleLine - 32) / 2}px`,
  [COARSE_POINTER_QUERY]: { my: `${(titleLine - tokens.tapTarget) / 2}px` },
} as const

export function TrainPage() {
  // Edmonton's date, re-read every minute (the app stays open across midnight).
  const date = today(useNow(60_000))
  const navigate = useNavigate()
  const { day, sessions, templates, active, activeCounts, unsynced, readiness } = useTrainData(date)
  const start = useStartSession()
  const index = useExerciseIndex()

  const startTemplate = useCallback(
    (t: Template) => start({ origin: 'template', template_id: t.id, name: t.name, exercises: t.exercises }),
    [start],
  )
  const lastDone = useMemo(() => lastDoneByTemplate(sessions.data ?? []), [sessions.data])
  const week = useMemo(() => weekTotals(sessions.data ?? [], unsynced, date), [sessions.data, unsynced, date])

  const inProgress = Boolean(active || (day.data?.session && day.data.session.ended_at === null))
  // Not before today's session is known: an open session started on another device would hide it again.
  const showBlank = !inProgress && !day.isLoading
  const todayTemplate = day.data?.planned_session?.template_id ?? null
  const kind = day.data?.fast.is_fast_day
    ? 'Fast day'
    : day.data?.targets?.training_planned === false
      ? 'Rest day'
      : day.data?.targets?.training_planned || day.data?.planned_session
        ? 'Training day'
        : null
  const done = sessions.data ? `${week.sessions} session${week.sessions === 1 ? '' : 's'} done this week` : null
  const libraryHelp = index.all.length > 0 ? `${index.allowed.length} allowed of ${index.all.length}` : undefined

  return (
    <Stack spacing={5} data-testid="train-page">
      <PageHeader
        title={`${weekdayLong.format(dateToTime(date))}, ${formatShortDate(date)}`}
        pageName="Train"
        subtitle={[kind, done].filter(Boolean).join(' · ') || undefined}
        action={
          <>
            {readiness && <ReadinessChip readiness={readiness} />}
            {showBlank && (
              <Button
                variant="outlined"
                startIcon={<AddRounded />}
                onClick={() => start({ origin: 'blank', template_id: null, name: null, exercises: [] })}
                data-testid="start-blank"
              >
                Blank session
              </Button>
            )}
          </>
        }
      />

      {/* 2a's entrance: the title row, then each band rises in reading order, a section's stagger apart. */}
      <Reveal delay={staggerDelay(1, tokens.motion.stagger.section)}>
        {day.isLoading && !active ? (
          <Skeleton variant="rounded" sx={{ ...cardSkeleton, height: { xs: 220, md: 288 } }} />
        ) : day.error && !day.data && !active ? (
          <LoadProblem what="Today's session" error={day.error} onRetry={() => void day.refetch()} />
        ) : (
          <TodayCard
            day={day.data}
            active={active}
            activeCounts={activeCounts}
            templates={templates.data ?? []}
            lastDone={lastDone}
            onStart={start}
          />
        )}
      </Reveal>

      <Reveal delay={staggerDelay(2, tokens.motion.stagger.section)}>
        {/* 2 : 1 from lg; below that each takes the full width, so the templates keep two cards a row. */}
        <Columns md={1} lg={3}>
          <Column span={2}>
            <Box component="section" aria-labelledby="templates-title">
              <SectionHeader
                id="templates"
                title="Templates"
                action={
                  <Button component={Link} to="/train/builder" size="small" startIcon={<AddRounded />} sx={headerLink}>
                    New template
                  </Button>
                }
              />
              {templates.isLoading ? (
                <Box sx={templateGrid}>
                  <Skeleton variant="rounded" height={166} sx={cardSkeleton} />
                  <Skeleton variant="rounded" height={166} sx={cardSkeleton} />
                </Box>
              ) : templates.error && !templates.data ? (
                <LoadProblem
                  what="Your templates"
                  error={templates.error}
                  onRetry={() => void templates.refetch()}
                />
              ) : templates.data?.length ? (
                <Box sx={templateGrid}>
                  {templates.data.map((t) => (
                    <TemplateCard
                      key={t.id}
                      template={t}
                      onStart={startTemplate}
                      today={t.id === todayTemplate}
                      lastDone={lastDone.get(t.id)}
                    />
                  ))}
                </Box>
              ) : (
                <EmptyState
                  title="No templates yet"
                  body="Build one from the exercise library."
                  action={{ label: 'Build a template', onClick: () => void navigate('/train/builder') }}
                />
              )}
            </Box>
          </Column>

          <Column span={1}>
            <Box component="section" aria-labelledby="recent-title">
              <SectionHeader id="recent" title="Recent" />
              {sessions.isLoading ? (
                <Skeleton variant="rounded" height={160} sx={cardSkeleton} />
              ) : sessions.error && !sessions.data ? (
                <LoadProblem
                  what="Recent sessions"
                  error={sessions.error}
                  onRetry={() => void sessions.refetch()}
                />
              ) : (sessions.data?.length ?? 0) + unsynced.length > 0 ? (
                <RecentSessions sessions={sessions.data ?? []} unsynced={unsynced} templates={templates.data} week={week} />
              ) : (
                <EmptyState title="No sessions yet" body="Finished sessions show here." />
              )}
            </Box>
          </Column>
        </Columns>
      </Reveal>

      <Reveal delay={staggerDelay(3, tokens.motion.stagger.section)}>
        <Box
          component="nav"
          aria-label="Training tools"
          data-testid="train-tools"
          sx={{
            display: 'grid',
            gap: 4,
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
          }}
        >
          {TOOLS.map(({ to, label, help, Icon, testId }) => (
            <ListRow
              key={to}
              variant="card"
              icon={Icon}
              iconTile
              label={label}
              help={testId === 'link-library' ? libraryHelp : help}
              component={Link}
              to={to}
              testId={testId}
            />
          ))}
        </Box>
      </Reveal>
    </Stack>
  )
}
