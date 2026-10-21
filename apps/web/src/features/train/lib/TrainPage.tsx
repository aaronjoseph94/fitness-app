// Owns: the Train tab (SPEC §7, §11; 1d Summit "Train") — the sky hero (which training day of the week it is and the
// sessions done this week as the eyebrow, the date as the page's h1, today's plan as the subtitle, the readiness pill
// and "Blank session"), the today card (the session in progress, today's finished session, the planned one — the week
// plan's or today's split template — or the way to generate), then the deep-sky "This week" card (pick the training
// days, generate the week's drafts, Keep all; done days and fast days marked), then templates (cards two up with mini
// muscle maps and Start, followed in the same row by the split's AI drafts: waiting for Keep, or kept here with their
// outcome and Undo) beside recent sessions and this week's totals at 2 : 1, and a row of four tool cards into the
// library, the equipment profile, the builder and AI workouts. Every row wraps rather than squeezes (README §4); on a
// phone everything is one column in this order.
import AddRounded from '@mui/icons-material/AddRounded'
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import EditNoteRounded from '@mui/icons-material/EditNoteRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Skeleton from '@mui/material/Skeleton'
import type { SvgIconComponent } from '@mui/icons-material'
import { addDays, fastDay, today, weekdayOf, weekStart } from '@fitness/shared/engine'
import type { Template } from '@fitness/shared/schemas'
import { useCallback, useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  cardSurface,
  dateToTime,
  EmptyState,
  formatShortDate,
  LoadProblem,
  PageHeader,
  Reveal,
  SectionHeader,
  staggerDelay,
  wrapCol,
  WrapRow,
} from '../../../components'
import { COARSE_POINTER_QUERY, tokens, transitionOf } from '../../../theme'
import { useExerciseIndex } from '../../library'
import { dateOf, useFasts, useLogSettings, useNow } from '../../quick-log'
import { DraftTemplateCard } from './DraftTemplateCard'
import { ReadinessChip } from './ReadinessChip'
import { finishedByDate, lastDoneByTemplate, RecentSessions, weekTotals } from './RecentSessions'
import { useStartSession } from './session'
import { TemplateCard } from './TemplateCard'
import { GENERATE_PATH, TodayCard } from './TodayCard'
import { useTrainData } from './useTrainData'
import { WeekSplitCard } from './WeekSplitCard'

interface Tool {
  to: string
  label: string
  help?: string
  Icon: SvgIconComponent
  testId: string
  /** The glyph tile's tint and colour; the AI workout card is the coach gradient instead. */
  tile?: { bg: string; fg: string }
}

/** The four ways out of this tab, as a row of tool cards. */
const TOOLS: Tool[] = [
  {
    to: '/train/library',
    label: 'Exercise library',
    Icon: MenuBookOutlined,
    testId: 'link-library',
    tile: { bg: tokens.accent.soft, fg: tokens.accent.deep },
  },
  {
    to: '/train/equipment',
    label: 'Equipment',
    help: 'The machines at your gym',
    Icon: FitnessCenterRounded,
    testId: 'link-equipment',
    tile: { bg: tokens.tone.success.bg, fg: tokens.tone.success.text },
  },
  {
    to: '/train/builder',
    label: 'Workout builder',
    help: 'Create or edit a template',
    Icon: EditNoteRounded,
    testId: 'link-builder',
    tile: { bg: tokens.tone.warning.bg, fg: tokens.tone.warning.text },
  },
  {
    to: GENERATE_PATH,
    label: 'AI workout',
    help: 'From your equipment and readiness',
    Icon: AutoAwesomeRounded,
    testId: 'link-ai',
  },
]

const weekdayLong = new Intl.DateTimeFormat('en-CA', { weekday: 'long', timeZone: 'UTC' })

const cardSkeleton = { borderRadius: `${tokens.radius.card}px` } as const

/** Template cards two up (README §4: X 280), one per row once two no longer fit. */
const templateRow = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: `${tokens.summit.space.gap.tile}px`,
  '& > *': { ...wrapCol(1) },
} as const

/**
 * "+ New template" reads as a link in the section header (violet 14/600): its 10 px padding hangs past the column's edge
 * and its height (a small button's 36 px, 44 on touch) past the title's line box, so the Templates and Recent headers
 * keep one height.
 */
const titleLine = tokens.font.size.sectionTitle * tokens.font.leading.sectionTitle
const headerLink = {
  mr: '-10px',
  my: `${(titleLine - 36) / 2}px`,
  fontSize: tokens.font.size.body,
  fontWeight: tokens.font.weight.heading,
  '&:hover': { bgcolor: 'transparent', color: tokens.summit.accent.linkHover },
  [COARSE_POINTER_QUERY]: { my: `${(titleLine - tokens.tapTarget) / 2}px` },
} as const

/** One tool card (README §4: four up at 220 px, wrapping): a 44 px tinted glyph tile, the label and its help, a chevron. */
function ToolCard({ tool, help }: { tool: Tool; help?: string }) {
  const { to, label, Icon, testId, tile } = tool
  const coach = !tile
  return (
    <ButtonBase
      component={Link}
      to={to}
      data-testid={testId}
      sx={{
        ...cardSurface,
        ...(coach && { background: tokens.summit.coach.bg, boxShadow: tokens.summit.coach.shadow }),
        flex: '100 1 220px',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '14px',
        px: '20px',
        py: '18px',
        borderRadius: `${tokens.summit.radius.small}px`,
        textAlign: 'left',
        color: coach ? tokens.summit.coach.text : tokens.ink.text,
        transition: transitionOf('box-shadow'),
        '@media (hover: hover)': {
          '&:hover': { boxShadow: coach ? tokens.summit.coach.shadow : tokens.elevation.cardHover },
        },
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 44,
          height: 44,
          flex: 'none',
          display: 'grid',
          placeItems: 'center',
          borderRadius: `${tokens.summit.radius.wellSmall}px`,
          bgcolor: tile ? tile.bg : tokens.summit.glass.tile,
          color: tile ? tile.fg : tokens.summit.gold.main,
        }}
      >
        <Icon sx={{ fontSize: 24 }} />
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
        <Box
          component="span"
          sx={{
            display: 'block',
            fontSize: tokens.font.size.emphasis,
            fontWeight: tokens.font.weight.heading,
          }}
        >
          {label}
        </Box>
        {help && (
          <Box
            component="span"
            sx={{
              display: 'block',
              fontSize: tokens.font.size.caption,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.caption,
              color: coach ? tokens.summit.coach.muted : tokens.ink.muted,
            }}
          >
            {help}
          </Box>
        )}
      </Box>
      <ChevronRightRounded
        aria-hidden
        sx={{ fontSize: 20, flex: 'none', color: coach ? tokens.summit.coach.muted : tokens.ink.faint }}
      />
    </ButtonBase>
  )
}

export function TrainPage() {
  // Edmonton's date, re-read every minute (the app stays open across midnight).
  const now = useNow(60_000)
  const date = today(now)
  const navigate = useNavigate()
  const {
    day,
    sessions,
    templates,
    active,
    activeCounts,
    unsynced,
    readiness,
    splitTemplate,
    drafts,
    week: trainingWeek,
    markKept,
    clearKept,
  } = useTrainData(date)
  const start = useStartSession()
  const index = useExerciseIndex()
  const monday = weekStart(date)
  const sunday = addDays(monday, 6)
  const { fastHours } = useLogSettings()
  const fasting = useFasts({ from: monday, to: sunday }, now)

  const startTemplate = useCallback(
    (t: Template) => start({ origin: 'template', template_id: t.id, name: t.name, exercises: t.exercises }),
    [start],
  )
  const lastDone = useMemo(() => lastDoneByTemplate(sessions.data ?? []), [sessions.data])
  const week = useMemo(() => weekTotals(sessions.data ?? [], unsynced, date), [sessions.data, unsynced, date])
  const doneByDate = useMemo(
    () => finishedByDate(sessions.data ?? [], unsynced, monday, date),
    [sessions.data, unsynced, monday, date],
  )
  /** This week's fast days (planned or kept), by the day the fast covers. */
  const fastDays = useMemo(
    () =>
      new Set(
        fasting.fasts
          .filter((f) => f.status !== 'missed')
          .map(
            (f) =>
              fastDay({ started_at: f.startedAt, ended_at: f.endedAt }, fastHours) ?? dateOf(f.startedAt),
          ),
      ),
    [fasting.fasts, fastHours],
  )
  /** The split day each of this week's templates is for ("Mon"). */
  const weekdayOfTemplate = useMemo(
    () =>
      new Map(
        (trainingWeek.data?.slots ?? []).flatMap((s) =>
          s.template ? [[s.template.id, weekdayShort(s.weekday)] as const] : [],
        ),
      ),
    [trainingWeek.data],
  )

  const serverSession = day.data?.session ?? null
  const inProgress = Boolean(active || (serverSession && serverSession.ended_at === null))
  // Not before today's session is known: an open session started on another device would hide it again.
  const showBlank = !inProgress && !day.isLoading
  const todayTemplate = day.data?.planned_session?.template_id ?? splitTemplate?.id ?? null
  const trainingDays = trainingWeek.data?.training_days ?? []
  const todayIndex = trainingDays.indexOf(weekdayOf(date))
  const kind = day.data?.fast.is_fast_day
    ? 'Fast day'
    : day.data?.targets?.training_planned === false
      ? 'Rest day'
      : todayIndex >= 0
        ? `Training day ${todayIndex + 1} of ${trainingDays.length}`
        : day.data?.targets?.training_planned || day.data?.planned_session || splitTemplate
          ? 'Training day'
          : null
  const done = sessions.data
    ? `${week.sessions} session${week.sessions === 1 ? '' : 's'} done this week`
    : null
  const plannedName = day.data?.planned_session?.name ?? splitTemplate?.name ?? null
  const subtitle = inProgress
    ? `${active?.name ?? serverSession?.template_name ?? 'Workout'} in progress`
    : serverSession?.ended_at
      ? `${serverSession.template_name ?? 'Workout'} done today`
      : (plannedName ?? undefined)
  const libraryHelp =
    index.all.length > 0 ? `${index.allowed.length} allowed of ${index.all.length}` : undefined

  return (
    <Box
      data-testid="train-page"
      sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: `${tokens.rhythm.section}px` }}
    >
      <PageHeader
        eyebrow={[kind, done].filter(Boolean).join(' · ') || undefined}
        title={`${weekdayLong.format(dateToTime(date))}, ${formatShortDate(date)}`}
        pageName="Train"
        subtitle={subtitle}
        action={
          <>
            {readiness && <ReadinessChip readiness={readiness} onSky />}
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

      {/* 1d's entrance: the hero, then each band rises in reading order, a section's stagger apart. */}
      <Reveal delay={staggerDelay(1, tokens.motion.stagger.section)}>
        {day.isLoading && !active ? (
          <Skeleton variant="rounded" sx={{ ...cardSkeleton, height: { xs: 520, md: 340 } }} />
        ) : day.error && !day.data && !active ? (
          <LoadProblem what="Today's session" error={day.error} onRetry={() => void day.refetch()} />
        ) : (
          <TodayCard
            day={day.data}
            active={active}
            activeCounts={activeCounts}
            templates={templates.data ?? []}
            splitTemplate={splitTemplate}
            lastDone={lastDone}
            onStart={start}
          />
        )}
      </Reveal>

      <Reveal delay={staggerDelay(2, tokens.motion.stagger.section)}>
        {trainingWeek.isLoading ? (
          <Skeleton variant="rounded" sx={{ ...cardSkeleton, height: { xs: 620, md: 420 } }} />
        ) : trainingWeek.error && !trainingWeek.data ? (
          <LoadProblem
            what="This week"
            error={trainingWeek.error}
            onRetry={() => void trainingWeek.refetch()}
          />
        ) : trainingWeek.data ? (
          <WeekSplitCard
            week={trainingWeek.data}
            date={date}
            templates={templates.data ?? []}
            done={doneByDate}
            fastDays={fastDays}
            onKept={markKept}
            onGenerate={clearKept}
          />
        ) : null}
      </Reveal>

      <Reveal delay={staggerDelay(3, tokens.motion.stagger.section)}>
        {/* 2 : 1 at X 280 (README §4), wrapping to one column: templates first, then recent. */}
        <WrapRow align="flex-start">
          <Box component="section" aria-labelledby="templates-title" sx={wrapCol(2)}>
            <SectionHeader
              id="templates"
              title="Templates"
              subtitle={
                drafts.some((d) => !d.kept) ? 'AI drafts for your split: keep the ones you like' : undefined
              }
              action={
                <Button
                  component={Link}
                  to="/train/builder"
                  size="small"
                  startIcon={<AddRounded />}
                  sx={headerLink}
                >
                  New template
                </Button>
              }
            />
            {templates.isLoading ? (
              <Box sx={templateRow}>
                <Skeleton variant="rounded" height={150} sx={cardSkeleton} />
                <Skeleton variant="rounded" height={150} sx={cardSkeleton} />
              </Box>
            ) : templates.error && !templates.data ? (
              <LoadProblem
                what="Your templates"
                error={templates.error}
                onRetry={() => void templates.refetch()}
              />
            ) : (templates.data?.length ?? 0) + drafts.length > 0 ? (
              <Box sx={templateRow}>
                {templates.data?.map((t) => (
                  <TemplateCard
                    key={t.id}
                    template={t}
                    onStart={startTemplate}
                    today={t.id === todayTemplate}
                    weekday={weekdayOfTemplate.get(t.id)}
                    lastDone={lastDone.get(t.id)}
                  />
                ))}
                {drafts.map((d) => (
                  <DraftTemplateCard
                    key={d.workout.id}
                    draft={d.workout}
                    replaces={d.replaces}
                    kept={d.kept}
                    onKept={markKept}
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

          <Box component="section" aria-labelledby="recent-title" sx={wrapCol(1)}>
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
              <RecentSessions
                sessions={sessions.data ?? []}
                unsynced={unsynced}
                templates={templates.data}
                week={week}
                plannedSessions={trainingDays.length || undefined}
              />
            ) : (
              <EmptyState title="No sessions yet" body="Finished sessions show here." />
            )}
          </Box>
        </WrapRow>
      </Reveal>

      <Reveal delay={staggerDelay(4, tokens.motion.stagger.section)}>
        <Box
          component="nav"
          aria-label="Training tools"
          data-testid="train-tools"
          sx={{ display: 'flex', flexWrap: 'wrap', gap: `${tokens.summit.space.gap.tile}px` }}
        >
          {TOOLS.map((tool) => (
            <ToolCard
              key={tool.to}
              tool={tool}
              help={tool.testId === 'link-library' ? libraryHelp : tool.help}
            />
          ))}
        </Box>
      </Reveal>
    </Box>
  )
}

/** "mon" → "Mon". */
function weekdayShort(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1)
}
