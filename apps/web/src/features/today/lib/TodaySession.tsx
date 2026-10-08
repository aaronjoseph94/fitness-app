// Owns: Today's session card (2a) — the session today's plan holds (name, exercises, sets, and the workout reminder's
// time as its chip), the muscles it trains as a muscle map with the hardest-worked muscles listed beside it, and
// "Start session" (the Train tab, where it starts) and "Edit" (its template in the builder); once a session is under
// way or done, that session instead (resume or view it); otherwise "Training day" or "Rest day". Reads only what the
// day and the week plan already carry: exercise names live in the library, which Today does not load.
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import { muscleLevels, weekdayOf } from '@fitness/shared/engine'
import type { DayView, LocalDate, Muscle, MuscleScores, Reminder, Weekday, WeekPlan } from '@fitness/shared/schemas'
import { Link as RouterLink } from 'react-router'
import { formatNumber, Panel, PanelRow, StatusChip } from '../../../components'
import { levelLabel, MUSCLE_LABELS, MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { clockLabel } from './event-view'

/** Muscles listed beside the map. */
const MUSCLES_SHOWN = 5

interface TodaySessionProps {
  date: LocalDate
  day: DayView | undefined
  plan: WeekPlan | null
  trainingDays: readonly Weekday[] | null
  /** The workout reminder (its time stands in for the session's: a planned session has no time of day). */
  reminder: Reminder | undefined
}

/** The map and the hardest-worked muscles from a muscle-score snapshot. */
function Muscles({ scores, title }: { scores: MuscleScores; title: string }) {
  const levels = muscleLevels(scores)
  const top = (Object.entries(scores) as [Muscle, number][])
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MUSCLES_SHOWN)
  if (top.length === 0) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <MuscleMap levels={levels} size={128} title={title} body="light" />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {top.map(([muscle]) => (
          <PanelRow key={muscle} label={MUSCLE_LABELS[muscle]} value={levelLabel(levels[muscle])} />
        ))}
      </Box>
    </Box>
  )
}

export function TodaySession({ date, day, plan, trainingDays, reminder }: TodaySessionProps) {
  const wd = weekdayOf(date)
  const session = day?.session ?? null
  const planned = day?.planned_session ?? plan?.plan.sessions[wd] ?? null
  const training = day?.targets ? day.targets.training_planned : plan ? plan.plan.sessions[wd] !== null : (trainingDays?.includes(wd) ?? false)
  const fastDay = day?.fast.is_fast_day === true || day?.targets?.is_fast_day === true || (plan?.plan.fast_dates.includes(date) ?? false)
  const time = reminder?.enabled && reminder.time ? clockLabel(reminder.time) : null
  const fastNote = fastDay && (
    <Box sx={{ mt: '12px', fontSize: tokens.font.size.small, color: tokens.ink.muted }}>Fast day: keep any training light.</Box>
  )

  if (session) {
    const done = session.ended_at !== null
    const name = session.template_name ?? 'Session'
    return (
      <Panel
        title="Today’s session"
        description={
          <>
            <Box component="span" data-testid="training-today">
              {done ? 'Done' : 'In progress'}: {name}
            </Box>{' '}
            · {session.sets_done} sets · {formatNumber(session.volume_kg)} kg
          </>
        }
        actions={<StatusChip tone={done ? 'success' : 'info'} dot={!done} label={done ? 'Done' : 'In progress'} />}
      >
        {session.muscle_scores && <Muscles scores={session.muscle_scores} title={`Muscles in ${name}`} />}
        <Button
          component={RouterLink}
          to={`/train/session/${session.id}`}
          variant={done ? 'outlined' : 'contained'}
          fullWidth
          sx={{ mt: '14px' }}
        >
          {done ? 'View session' : 'Resume session'}
        </Button>
        {fastNote}
      </Panel>
    )
  }

  if (planned) {
    const sets = planned.exercises.reduce((n, e) => n + e.sets, 0)
    const count = planned.exercises.length
    return (
      <Panel
        title="Today’s session"
        description={
          <>
            <Box component="span" data-testid="training-today">
              {planned.name}
            </Box>{' '}
            · {count} {count === 1 ? 'exercise' : 'exercises'} · {sets} sets
          </>
        }
        actions={time && <StatusChip tone="outline" label={time} ariaLabel={`Workout reminder at ${time}`} />}
      >
        {planned.muscle_scores && <Muscles scores={planned.muscle_scores} title={`Muscles in ${planned.name}`} />}
        <Box sx={{ display: 'flex', gap: 2, mt: '14px' }}>
          <Button component={RouterLink} to="/train" variant="contained" startIcon={<PlayArrowRounded />} sx={{ flex: 1 }}>
            Start session
          </Button>
          {planned.template_id && (
            <Button component={RouterLink} to={`/train/builder/${planned.template_id}`} variant="outlined">
              Edit
            </Button>
          )}
        </Box>
        {fastNote}
      </Panel>
    )
  }

  return (
    <Panel
      title="Today’s session"
      description={
        <Box component="span" data-testid="training-today">
          {training ? 'Training day' : 'Rest day'}
        </Box>
      }
    >
      {training ? (
        <>
          <Button component={RouterLink} to="/train" variant="outlined" fullWidth>
            Choose a workout
          </Button>
          {fastNote}
        </>
      ) : (
        fastNote || undefined
      )}
    </Panel>
  )
}
