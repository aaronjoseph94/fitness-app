// Owns: the Train tab's "today" card (1d Summit: a full-width white card, its muscle map in a warm well beside the
// content at 1fr : 300 px, wrapping under it when they no longer fit; the exercises in rows that go two up from 300 px
// each; the coral Start session) — the
// session in progress (resume), today's finished session, the planned session — the week plan's, else today's split
// template ("Planned · your split", started as that template) — with its exercises, start it, or generate with AI
// instead, the AI's pending draft for today (the nightly workout_generate when neither covers the day: preview, swap,
// start or save it on the AI page, which accepts it), or, with none of those, the training flag's "Training day" /
// "Rest day" with "Generate today's workout" (the AI page runs POST /api/ai/workout {mode: 'generate'}). The blank
// session is the page header's button.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { DayView, Muscle, Template, TemplateExerciseInput } from '@fitness/shared/schemas'
import { muscleLevels } from '@fitness/shared/engine'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cardSurface, displayTitle, fixedCol, formatNumber, StatusChip } from '../../../components'
import { MUSCLE_LABELS, MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { draftMuscleLevels, pendingWorkoutPath, usePendingWorkouts } from '../../builder'
import { useExerciseIndex } from '../../library'
import type { LoggerSession } from './logger-model'
import { sessionDay, type SessionLine } from './RecentSessions'
import { sessionPath, type StartInput } from './session'

/** The AI workout page, generating at once. */
export const GENERATE_PATH = '/train/ai?auto=1'

export interface TodayCardProps {
  day: DayView | undefined
  active: LoggerSession | null
  activeCounts: { done: number; planned: number; volume_kg: number } | null
  templates: readonly Template[]
  /** The template named for today's day of the split ("Upper A"), when no week-plan session covers today. */
  splitTemplate: Template | null
  /** Each template's newest finished session (the planned one's "last done"). */
  lastDone: ReadonlyMap<string, SessionLine>
  onStart: (input: StartInput) => void
}

/** "Lats, middle back, biceps": the three most trained muscles, as a caption. */
function muscleCaption(top: readonly Muscle[]): string {
  const names = top
    .slice(0, 3)
    .map((m) => MUSCLE_LABELS[m].toLowerCase())
    .join(', ')
  return names.charAt(0).toUpperCase() + names.slice(1)
}

/** What the planned branch shows and starts. */
interface PlannedToday {
  chip: string
  name: string
  exercises: readonly TemplateExerciseInput[]
  /** The template whose "last done" shows, if any. */
  template_id: string | null
  start: StartInput
  testId: string
  startTestId: string
}

/** The week plan's session for today, else today's split template (started as that template), else null. */
function plannedToday(
  planned: DayView['planned_session'],
  split: Template | null,
  templates: readonly Template[],
): PlannedToday | null {
  if (planned) {
    const templateExists = planned.template_id !== null && templates.some((t) => t.id === planned.template_id)
    return {
      chip: 'Planned · week plan',
      name: planned.name,
      exercises: planned.exercises,
      template_id: planned.template_id,
      start: {
        origin: 'week_plan',
        template_id: templateExists ? planned.template_id : null,
        name: planned.name,
        exercises: planned.exercises,
      },
      testId: 'today-planned',
      startTestId: 'start-planned',
    }
  }
  if (!split) return null
  return {
    chip: 'Planned · your split',
    name: split.name,
    exercises: split.exercises,
    template_id: split.id,
    start: { origin: 'template', template_id: split.id, name: split.name, exercises: split.exercises },
    testId: 'today-split',
    startTestId: 'start-split',
  }
}

/** The muscle map panel on the card's right (under the content when the row wraps). */
function MapPanel({
  levels,
  title,
  caption,
}: {
  levels: ReturnType<typeof muscleLevels>
  title: string
  caption?: string
}) {
  return (
    <>
      <MuscleMap levels={levels} size={220} title={title} />
      {caption && (
        <Box
          sx={{
            mt: '8px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.body,
            lineHeight: tokens.font.leading.small,
            color: tokens.ink.muted,
            textAlign: 'center',
          }}
        >
          {caption}
        </Box>
      )}
    </>
  )
}

function Shell({
  chip,
  meta,
  title,
  body,
  list,
  aside,
  children,
  testId,
}: {
  chip: ReactNode
  /** 13 px muted text beside the chip. */
  meta?: ReactNode
  title: string
  body?: ReactNode
  list?: ReactNode
  aside?: ReactNode
  children?: ReactNode
  testId: string
}) {
  return (
    <Box
      component="section"
      aria-labelledby="today-title"
      data-testid={testId}
      sx={{
        ...cardSurface,
        display: 'flex',
        flexWrap: 'wrap',
        gap: '26px',
        px: { xs: '22px', sm: '28px' },
        py: { xs: '22px', sm: '26px' },
        minWidth: 0,
      }}
    >
      <Box sx={{ flex: '100 1 280px', minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          {chip}
          {meta && (
            <Box
              sx={{
                fontSize: tokens.font.size.small,
                fontWeight: tokens.font.weight.heading,
                color: tokens.ink.muted,
              }}
            >
              {meta}
            </Box>
          )}
        </Box>
        <Box
          component="h2"
          id="today-title"
          sx={{
            m: 0,
            mt: '12px',
            ...displayTitle('card'),
            fontSize: tokens.font.size.bigNumber,
            letterSpacing: tokens.font.em.number,
            lineHeight: 1.15,
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </Box>
        {body && (
          <Box
            sx={{
              mt: '6px',
              fontSize: tokens.font.size.body,
              fontWeight: tokens.font.weight.body,
              lineHeight: tokens.font.leading.small,
              color: tokens.ink.muted,
            }}
          >
            {body}
          </Box>
        )}
        {list}
        {children && (
          <Box sx={{ mt: '20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            {children}
          </Box>
        )}
      </Box>
      {aside && (
        <Box
          sx={{
            ...fixedCol(300),
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            p: '18px',
            borderRadius: `${tokens.summit.radius.small}px`,
            bgcolor: tokens.ink.panel,
          }}
        >
          {aside}
        </Box>
      )}
    </Box>
  )
}

/**
 * The planned exercises as a numbered list: two up wherever two fit at 300 px each (README §4: repeat(auto-fit,
 * minmax(min(100%, 300px), 1fr))), read across then down; each row "name · sets × reps · kg" over a hairline. The list
 * clips its own last pixel, so the last row's rule never shows whatever the column count.
 */
function ExerciseList({
  exercises,
  name,
}: {
  exercises: readonly TemplateExerciseInput[]
  name: (id: string) => string
}) {
  return (
    <Box
      component="ol"
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        mt: '18px',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
        columnGap: '28px',
        rowGap: '2px',
        clipPath: 'inset(0 0 1px 0)',
        fontSize: tokens.font.size.emphasis,
        lineHeight: 1.35,
      }}
    >
      {exercises.map((e, i) => {
        const reps = e.rep_min === e.rep_max ? `${e.rep_min}` : `${e.rep_min}–${e.rep_max}`
        return (
          <Box
            component="li"
            key={`${e.exercise_id}-${i}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              py: '8px',
              minWidth: 0,
              borderBottom: `1px solid ${tokens.ink.hairline}`,
            }}
          >
            <Box
              component="span"
              aria-hidden
              sx={{
                width: 22,
                flex: 'none',
                fontFamily: tokens.font.display,
                fontSize: tokens.font.size.caption,
                color: tokens.ink.faint,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {i + 1}
            </Box>
            <Box
              component="span"
              sx={{ flex: 1, minWidth: 0, fontWeight: tokens.font.weight.label, overflowWrap: 'anywhere' }}
            >
              {name(e.exercise_id)}
            </Box>
            <Box
              component="span"
              sx={{
                flex: 'none',
                fontSize: tokens.font.size.body,
                color: tokens.ink.muted,
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {e.sets} × {reps}
              {e.target_load_kg !== null && ` · ${e.target_load_kg} kg`}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

/** A text button that reads as a link (violet 14/600), its padding hung outside the row's edge. */
const linkButtonSx = {
  ml: 'auto',
  mr: '-10px',
  fontWeight: tokens.font.weight.heading,
  '&:hover': { bgcolor: 'transparent', color: tokens.summit.accent.linkHover },
} as const

export function TodayCard({
  day,
  active,
  activeCounts,
  templates,
  splitTemplate,
  lastDone,
  onStart,
}: TodayCardProps) {
  const navigate = useNavigate()
  const index = useExerciseIndex()
  const planned = plannedToday(day?.planned_session ?? null, splitTemplate, templates)
  const serverSession = day?.session ?? null
  const pending = usePendingWorkouts()
  const suggested = day ? (pending.find((w) => w.date === day.date) ?? null) : null

  const generate = (primary: boolean) => (
    <Button
      variant={primary ? 'contained' : 'outlined'}
      size="large"
      startIcon={<AutoAwesomeRounded />}
      onClick={() => void navigate(GENERATE_PATH)}
      data-testid="generate-workout"
    >
      Generate today&apos;s workout
    </Button>
  )

  if (active || (serverSession && serverSession.ended_at === null)) {
    const id = active?.id ?? serverSession!.id
    const sets = activeCounts
      ? `${activeCounts.done} of ${activeCounts.planned} sets ticked`
      : `${serverSession?.sets_done ?? 0} set${serverSession?.sets_done === 1 ? '' : 's'} ticked`
    return (
      <Shell
        chip={<StatusChip tone="success" dot label="In progress" />}
        title={active?.name ?? serverSession?.template_name ?? 'Workout'}
        body={sets}
        testId="today-active"
      >
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowRounded />}
          onClick={() => void navigate(sessionPath(id))}
          data-testid="resume-session"
        >
          Resume
        </Button>
      </Shell>
    )
  }

  if (serverSession?.ended_at) {
    const levels = muscleLevels(serverSession.muscle_scores ?? {})
    return (
      <Shell
        chip={<StatusChip tone="success" label="Done today" />}
        title={serverSession.template_name ?? 'Workout'}
        body={`${serverSession.sets_done} set${serverSession.sets_done === 1 ? '' : 's'} · ${formatNumber(serverSession.volume_kg)} kg`}
        aside={<MapPanel levels={levels} title="Muscles trained today" />}
        testId="today-done"
      >
        <Button variant="outlined" size="large" onClick={() => void navigate(sessionPath(serverSession.id))}>
          View summary
        </Button>
      </Shell>
    )
  }

  if (planned) {
    // What Start will log: exercises outside the allowed set by now are left out (useStartSession).
    const startable = planned.exercises.filter((e) => index.byId.get(e.exercise_id)?.allowed !== false)
    const training = draftMuscleLevels(startable, index.byId)
    const last = planned.template_id ? lastDone.get(planned.template_id) : undefined
    return (
      <Shell
        chip={<StatusChip tone="info" label={planned.chip} />}
        title={planned.name}
        body={
          <>
            {startable.length} exercises · {training.totalSets} working sets
            {last && ` · last done ${sessionDay(last.date)} (${formatNumber(last.volume_kg)} kg)`}
          </>
        }
        list={<ExerciseList exercises={startable} name={(id) => index.byId.get(id)?.name ?? 'Exercise'} />}
        aside={
          <MapPanel
            levels={training.levels}
            title={`Muscles in ${planned.name}`}
            caption={training.top.length > 0 ? muscleCaption(training.top) : undefined}
          />
        }
        testId={planned.testId}
      >
        <Button
          variant="contained"
          size="large"
          startIcon={<PlayArrowRounded />}
          onClick={() => onStart(planned.start)}
          data-testid={planned.startTestId}
        >
          Start session
        </Button>
        <Button
          startIcon={<AutoAwesomeRounded />}
          onClick={() => void navigate(GENERATE_PATH)}
          data-testid="generate-workout"
          // A link-like text button: its 10 px padding hangs past the list's right edge so the label lines up with it.
          sx={linkButtonSx}
        >
          Generate with AI instead
        </Button>
      </Shell>
    )
  }

  if (suggested) {
    const training = draftMuscleLevels(suggested.draft.exercises, index.byId)
    return (
      <Shell
        chip={<StatusChip tone="info" label="Suggested by the AI" />}
        title="Today's workout"
        body={`${suggested.draft.exercises.length} exercises · ${training.totalSets} sets`}
        aside={
          <MapPanel
            levels={training.levels}
            title="Muscles in the suggested workout"
            caption={training.top.length > 0 ? muscleCaption(training.top) : undefined}
          />
        }
        testId="today-suggested"
      >
        <Button
          variant="contained"
          size="large"
          startIcon={<AutoAwesomeRounded />}
          onClick={() => void navigate(pendingWorkoutPath(suggested.id))}
          data-testid="open-suggested"
        >
          Preview and start
        </Button>
      </Shell>
    )
  }

  const trainingDay = day?.targets?.training_planned ?? null
  return (
    <Shell
      chip={
        <StatusChip
          tone={day?.fast.is_fast_day ? 'warning' : 'neutral'}
          label={day?.fast.is_fast_day ? 'Fast day' : 'Today'}
        />
      }
      title={trainingDay === false ? 'Rest day' : 'Training day'}
      body={trainingDay === false ? 'Nothing planned.' : 'No week plan yet.'}
      testId="today-unplanned"
    >
      {generate(trainingDay !== false)}
    </Shell>
  )
}
