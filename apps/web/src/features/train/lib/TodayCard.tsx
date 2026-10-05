// Owns: the Train tab's "today" card — the session in progress (resume), today's finished session, the week plan's
// planned session (start it), the AI's pending draft for today (the nightly workout_generate when no week plan covers
// the day: preview, swap, start or save it on the AI page, which accepts it), or, with none of those, the training
// flag's "Training day" / "Rest day" with "Generate today's workout" (the AI page runs POST /api/ai/workout
// {mode: 'generate'}) and a blank session.
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import type { DayView, Template } from '@fitness/shared/schemas'
import { muscleLevels } from '@fitness/shared/engine'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { formatNumber } from '../../../components'
import { MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { draftMuscleLevels, pendingWorkoutPath, usePendingWorkouts } from '../../builder'
import { useExerciseIndex } from '../../library'
import type { LoggerSession } from './logger-model'
import { sessionPath, type StartInput } from './session'

/** The AI workout page, generating at once. */
export const GENERATE_PATH = '/train/ai?auto=1'

export interface TodayCardProps {
  day: DayView | undefined
  active: LoggerSession | null
  activeCounts: { done: number; planned: number; volume_kg: number } | null
  templates: readonly Template[]
  onStart: (input: StartInput) => void
}

function Shell({
  eyebrow,
  title,
  body,
  aside,
  children,
  testId,
}: {
  eyebrow: string
  title: string
  body?: ReactNode
  aside?: ReactNode
  children?: ReactNode
  testId: string
}) {
  return (
    <Card sx={{ p: 4 }} data-testid={testId}>
      <Box sx={{ display: 'flex', gap: 3, alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>
            {eyebrow}
          </Box>
          <Box
            sx={{
              fontSize: tokens.font.size.sectionTitle,
              fontWeight: tokens.font.weight.heading,
              lineHeight: 1.3,
              mt: 0.5,
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </Box>
          {body && (
            <Box sx={{ mt: 1, fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.45 }}>{body}</Box>
          )}
        </Box>
        {aside}
      </Box>
      {children && <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>{children}</Box>}
    </Card>
  )
}

export function TodayCard({ day, active, activeCounts, templates, onStart }: TodayCardProps) {
  const navigate = useNavigate()
  const index = useExerciseIndex()
  const planned = day?.planned_session ?? null
  const serverSession = day?.session ?? null
  const pending = usePendingWorkouts()
  const suggested = day ? (pending.find((w) => w.date === day.date) ?? null) : null

  const blank = (
    <Button
      size="large"
      onClick={() => onStart({ origin: 'blank', template_id: null, name: null, exercises: [] })}
      data-testid="start-blank"
    >
      Blank session
    </Button>
  )
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
        eyebrow="In progress"
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
        eyebrow="Done today"
        title={serverSession.template_name ?? 'Workout'}
        body={`${serverSession.sets_done} sets · ${formatNumber(serverSession.volume_kg)} kg`}
        aside={<MuscleMap levels={levels} size={96} title="Muscles trained today" />}
        testId="today-done"
      >
        <Button variant="outlined" size="large" onClick={() => void navigate(sessionPath(serverSession.id))}>
          View summary
        </Button>
        {blank}
      </Shell>
    )
  }

  if (planned) {
    const training = draftMuscleLevels(planned.exercises, index.byId)
    const templateExists = planned.template_id !== null && templates.some((t) => t.id === planned.template_id)
    return (
      <Shell
        eyebrow="Today's plan"
        title={planned.name}
        body={`${planned.exercises.length} exercises · ${training.totalSets} sets`}
        aside={<MuscleMap levels={training.levels} size={96} title={`Muscles in ${planned.name}`} />}
        testId="today-planned"
      >
        <Button
          variant="contained"
          size="large"
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
          Start
        </Button>
        {generate(false)}
      </Shell>
    )
  }

  if (suggested) {
    const training = draftMuscleLevels(suggested.draft.exercises, index.byId)
    return (
      <Shell
        eyebrow="Suggested by the AI"
        title="Today's workout"
        body={`${suggested.draft.exercises.length} exercises · ${training.totalSets} sets. Preview it, swap anything, then start or save it.`}
        aside={<MuscleMap levels={training.levels} size={96} title="Muscles in the suggested workout" />}
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
        {blank}
      </Shell>
    )
  }

  const trainingDay = day?.targets?.training_planned ?? null
  return (
    <Shell
      eyebrow={day?.fast.is_fast_day ? 'Fast day' : 'Today'}
      title={trainingDay === false ? 'Rest day' : 'Training day'}
      body={
        trainingDay === false
          ? 'Nothing planned. Recovery counts too, but you can still train.'
          : 'No week plan yet. Let the AI build a session from your allowed exercises, or start a template below.'
      }
      testId="today-unplanned"
    >
      {generate(trainingDay !== false)}
      {blank}
    </Shell>
  )
}
