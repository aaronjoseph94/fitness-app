// Owns: the Train tab's "today" card (2a: a full-width card, its muscle map in a tinted panel on the right) — the
// session in progress (resume), today's finished session, the week plan's planned session (its exercises, start it, or
// generate with AI instead), the AI's pending draft for today (the nightly workout_generate when no week plan covers
// the day: preview, swap, start or save it on the AI page, which accepts it), or, with none of those, the training
// flag's "Training day" / "Rest day" with "Generate today's workout" (the AI page runs POST /api/ai/workout
// {mode: 'generate'}). The blank session is the page header's button.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { DayView, Muscle, Template, TemplateExerciseInput } from '@fitness/shared/schemas'
import { muscleLevels } from '@fitness/shared/engine'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { cardSurface, formatNumber, StatusChip } from '../../../components'
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

/** The muscle map panel on the card's right (below the content on a phone). */
function MapPanel({ levels, title, caption }: { levels: ReturnType<typeof muscleLevels>; title: string; caption?: string }) {
  return (
    <>
      <MuscleMap levels={levels} size={200} title={title} />
      {caption && (
        <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.muted, textAlign: 'center' }}>
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
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: aside ? 'minmax(0, 1fr) 260px' : 'minmax(0, 1fr)' },
      }}
    >
      <Box sx={{ minWidth: 0, px: { xs: 4, sm: '22px' }, py: 5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          {chip}
          {meta && <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.muted }}>{meta}</Box>}
        </Box>
        <Box
          component="h2"
          id="today-title"
          sx={{
            m: 0,
            mt: '10px',
            fontSize: tokens.font.size.title1,
            fontWeight: tokens.font.weight.heading,
            lineHeight: tokens.font.leading.title1,
            letterSpacing: tokens.font.em.title,
            overflowWrap: 'anywhere',
          }}
        >
          {title}
        </Box>
        {body && (
          <Box sx={{ mt: 1, fontSize: tokens.font.size.small, lineHeight: 'normal', color: tokens.ink.muted }}>
            {body}
          </Box>
        )}
        {list}
        {children && <Box sx={{ mt: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>{children}</Box>}
      </Box>
      {aside && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
            p: 4,
            bgcolor: tokens.ink.panel,
            borderTop: { xs: `1px solid ${tokens.ink.border}`, md: 'none' },
            borderLeft: { md: `1px solid ${tokens.ink.border}` },
          }}
        >
          {aside}
        </Box>
      )}
    </Box>
  )
}

/**
 * The planned exercises as a numbered list: one column on a phone, two from `sm` (filled down, then across, so the
 * reading order stays 1 … n), each row "name · sets × reps · kg" over a hairline.
 */
function ExerciseList({ exercises, name }: { exercises: readonly TemplateExerciseInput[]; name: (id: string) => string }) {
  const rows = Math.ceil(exercises.length / 2)
  const hairline = `1px solid ${tokens.ink.hairline}`
  return (
    <Box
      component="ol"
      sx={{
        listStyle: 'none',
        p: 0,
        m: 0,
        mt: '14px',
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
        gridTemplateRows: { sm: `repeat(${rows}, auto)` },
        gridAutoFlow: { sm: 'column' },
        columnGap: 6,
        rowGap: 1,
        fontSize: tokens.font.size.small,
        // 2a's list rows take the font's own line height, as in the mock.
        lineHeight: 'normal',
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
              justifyContent: 'space-between',
              gap: 2,
              py: '7px',
              minWidth: 0,
              borderBottom: {
                xs: i < exercises.length - 1 ? hairline : 'none',
                sm: i % rows === rows - 1 || i === exercises.length - 1 ? 'none' : hairline,
              },
            }}
          >
            <Box component="span" sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Box component="span" aria-hidden sx={{ mr: 2, color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums' }}>
                {i + 1}
              </Box>
              {name(e.exercise_id)}
            </Box>
            <Box component="span" sx={{ flex: 'none', color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {e.sets} × {reps}
              {e.target_load_kg !== null && ` · ${e.target_load_kg} kg`}
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

export function TodayCard({ day, active, activeCounts, templates, lastDone, onStart }: TodayCardProps) {
  const navigate = useNavigate()
  const index = useExerciseIndex()
  const planned = day?.planned_session ?? null
  const serverSession = day?.session ?? null
  const pending = usePendingWorkouts()
  const suggested = day ? (pending.find((w) => w.date === day.date) ?? null) : null

  const generate = (primary: boolean) => (
    <Button
      variant={primary ? 'contained' : 'outlined'}
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
        <Button variant="outlined" onClick={() => void navigate(sessionPath(serverSession.id))}>
          View summary
        </Button>
      </Shell>
    )
  }

  if (planned) {
    // What Start will log: exercises outside the allowed set by now are left out (useStartSession).
    const startable = planned.exercises.filter((e) => index.byId.get(e.exercise_id)?.allowed !== false)
    const training = draftMuscleLevels(startable, index.byId)
    const templateExists = planned.template_id !== null && templates.some((t) => t.id === planned.template_id)
    const last = planned.template_id ? lastDone.get(planned.template_id) : undefined
    return (
      <Shell
        chip={<StatusChip tone="info" label="Planned · week plan" />}
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
        testId="today-planned"
      >
        <Button
          variant="contained"
          startIcon={<PlayArrowRounded />}
          onClick={() =>
            onStart({
              origin: 'week_plan',
              template_id: templateExists ? planned.template_id : null,
              name: planned.name,
              exercises: planned.exercises,
            })
          }
          data-testid="start-planned"
        >
          Start session
        </Button>
        <Button
          size="small"
          startIcon={<AutoAwesomeRounded />}
          onClick={() => void navigate(GENERATE_PATH)}
          data-testid="generate-workout"
          // A link-like text button: its 10 px padding hangs past the list's right edge so the label lines up with it.
          sx={{ ml: 'auto', mr: '-10px' }}
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
      chip={<StatusChip tone={day?.fast.is_fast_day ? 'warning' : 'neutral'} label={day?.fast.is_fast_day ? 'Fast day' : 'Today'} />}
      title={trainingDay === false ? 'Rest day' : 'Training day'}
      body={trainingDay === false ? 'Nothing planned.' : 'No week plan yet.'}
      testId="today-unplanned"
    >
      {generate(trainingDay !== false)}
    </Shell>
  )
}
