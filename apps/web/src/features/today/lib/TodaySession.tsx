// Owns: Today's session card (1d README §5.1) — the session today's plan holds: today's readiness ring (0–100, teal /
// amber / red as on the Train tab; a dumbbell glyph until its reads answer), "Session · 4:30 PM" (the workout
// reminder's time; a planned session has no time of its own), its name, "Readiness 74 · 6 exercises · 18 sets", the
// exercises with sets × reps · load (names from the exercise library; the first four and "+ N more" past five), then
// the coral "Start session" (the Train tab, where it starts) and "Edit" (aria "Edit template": its template in the
// builder). Once a session is under way it shows that one with a ring of sets done against the plan's and "Resume
// session"; once done, a check and "View session"; otherwise "Training day" (the readiness ring, "Choose a workout")
// or "Rest day". A fast day adds a note.
import CheckRounded from '@mui/icons-material/CheckRounded'
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded'
import SelfImprovementRounded from '@mui/icons-material/SelfImprovementRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import { weekdayOf, type ReadinessScore } from '@fitness/shared/engine'
import type {
  DayView,
  LocalDate,
  Reminder,
  TemplateExerciseInput,
  Weekday,
  WeekPlan,
} from '@fitness/shared/schemas'
import { useId, type ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import {
  cardSurface,
  displayTitle,
  eyebrow,
  formatClockTime,
  formatNumber,
  MetricRing,
} from '../../../components'
import { tokens } from '../../../theme'
import { useExerciseIndex } from '../../library'
import { readinessColor } from './readiness'

const { summit, font } = tokens

/** Exercises listed in full; past this many the list shows one fewer and "+ N more". */
const LISTED = 5
/** The badge's size (the mock's readiness ring). */
const BADGE = 62

interface TodaySessionProps {
  date: LocalDate
  day: DayView | undefined
  plan: WeekPlan | null
  trainingDays: readonly Weekday[] | null
  /** The workout reminder (its time stands in for the session's: a planned session has no time of day). */
  reminder: Reminder | undefined
  /** Today's readiness, once its reads answer. */
  readiness: ReadinessScore | null
}

/** "3 × 10–12 · 45 kg". */
function prescription(e: TemplateExerciseInput): string {
  const reps = e.rep_min === e.rep_max ? `${e.rep_min}` : `${e.rep_min}–${e.rep_max}`
  return `${e.sets} × ${reps}${e.target_load_kg !== null ? ` · ${formatNumber(e.target_load_kg, e.target_load_kg % 1 === 0 ? 0 : 1)} kg` : ''}`
}

/** A round glyph badge in place of a ring. */
function Badge({ icon: Icon, tint, color }: { icon: SvgIconComponent; tint: string; color: string }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: BADGE,
        height: BADGE,
        flex: 'none',
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        bgcolor: tint,
        color,
      }}
    >
      <Icon sx={{ fontSize: 28 }} />
    </Box>
  )
}

/** The readiness ring (the mock's: 62 px, 6 px stroke, the score in Outfit 300 at 16 px). */
function ReadinessRing({ readiness }: { readiness: ReadinessScore }) {
  return (
    <MetricRing
      value={readiness.score}
      target={100}
      metric="lean"
      color={readinessColor(readiness.score)}
      trackColor={summit.surface.softHover}
      size={BADGE}
      thickness={6}
      label="Readiness"
      centre={
        <Box component="span" sx={{ fontSize: font.size.itemTitle, fontWeight: font.weight.display }}>
          {readiness.score}
        </Box>
      }
      delay={300}
    />
  )
}

/** The exercise rows: name (library) on the left, the prescription on the right, a hairline between. */
function ExerciseList({ exercises }: { exercises: readonly TemplateExerciseInput[] }) {
  const index = useExerciseIndex()
  const shown = exercises.length > LISTED ? exercises.slice(0, LISTED - 1) : exercises
  const rest = exercises.slice(shown.length)
  const restSets = rest.reduce((n, e) => n + e.sets, 0)
  const row = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: '12px',
    py: '7px',
    '&:not(:last-of-type)': { borderBottom: `1px solid ${tokens.ink.hairline}` },
  } as const
  return (
    <Box
      component="ol"
      aria-label="Exercises"
      sx={{
        listStyle: 'none',
        m: 0,
        mt: '14px',
        p: 0,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '2px',
        fontSize: font.size.emphasis,
      }}
    >
      {shown.map((e, i) => {
        const name = index.byId.get(e.exercise_id)?.name
        return (
          <Box component="li" key={`${e.exercise_id}-${i}`} sx={row}>
            <Box
              component="span"
              sx={{ minWidth: 0, fontWeight: font.weight.label, overflowWrap: 'anywhere' }}
            >
              {name ?? (index.isLoading ? <Skeleton width={120} /> : 'Exercise')}
            </Box>
            <Box
              component="span"
              sx={{ flex: 'none', color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums' }}
            >
              {prescription(e)}
            </Box>
          </Box>
        )
      })}
      {rest.length > 0 && (
        <Box component="li" sx={row}>
          <Box component="span" sx={{ fontWeight: font.weight.label }}>
            + {rest.length} more
          </Box>
          <Box component="span" sx={{ color: tokens.ink.muted, fontVariantNumeric: 'tabular-nums' }}>
            {restSets} sets
          </Box>
        </Box>
      )}
    </Box>
  )
}

interface ShellProps {
  badge: ReactNode
  /** The eyebrow's state after "Session". */
  when: string | null
  /** The session's name (or "Rest day"), carrying `training-today`. */
  name: ReactNode
  line?: ReactNode
  children?: ReactNode
}

/** The card: badge, eyebrow and name in one row, the summary line, then the body. */
function Shell({ badge, when, name, line, children }: ShellProps) {
  const titleId = useId()
  const eyebrowId = useId()
  return (
    <Box
      component="section"
      aria-labelledby={`${eyebrowId} ${titleId}`}
      data-testid="today-session"
      sx={{
        ...cardSurface,
        height: '100%',
        boxSizing: 'border-box',
        minWidth: 0,
        px: `${tokens.pad.card.x}px`,
        py: `${tokens.pad.card.y}px`,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
        {badge}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box id={eyebrowId} sx={eyebrow}>
            Session{when && ` · ${when}`}
          </Box>
          <Box
            component="h2"
            id={titleId}
            sx={{ ...displayTitle('section'), m: 0, mt: '2px', overflowWrap: 'anywhere' }}
          >
            {name}
          </Box>
        </Box>
      </Box>
      {line && (
        <Box
          sx={{ mt: '6px', fontSize: font.size.body, fontWeight: font.weight.body, color: tokens.ink.muted }}
        >
          {line}
        </Box>
      )}
      {children}
    </Box>
  )
}

/** The coral CTA, full width, 50 px. */
const CTA = { minHeight: 50, fontSize: font.size.itemTitle } as const

export function TodaySession({ date, day, plan, trainingDays, reminder, readiness }: TodaySessionProps) {
  const wd = weekdayOf(date)
  const session = day?.session ?? null
  const planned = day?.planned_session ?? plan?.plan.sessions[wd] ?? null
  const training = day?.targets
    ? day.targets.training_planned
    : plan
      ? plan.plan.sessions[wd] !== null
      : (trainingDays?.includes(wd) ?? false)
  const fastDay =
    day?.fast.is_fast_day === true ||
    day?.targets?.is_fast_day === true ||
    (plan?.plan.fast_dates.includes(date) ?? false)
  const time = reminder?.enabled && reminder.time ? formatClockTime(reminder.time) : null
  const fastNote = fastDay && (
    <Box sx={{ mt: '12px', fontSize: font.size.small, color: tokens.ink.muted }}>
      Fast day: keep any training light.
    </Box>
  )

  if (session) {
    const done = session.ended_at !== null
    const name = session.template_name ?? 'Session'
    const plannedSets = planned?.exercises.reduce((n, e) => n + e.sets, 0) ?? 0
    return (
      <Shell
        badge={
          done ? (
            <Badge icon={CheckRounded} tint={tokens.tone.success.bg} color={tokens.tone.success.text} />
          ) : plannedSets > 0 ? (
            <MetricRing
              value={session.sets_done}
              target={plannedSets}
              metric="lean"
              color={tokens.tone.success.solid}
              trackColor={summit.surface.softHover}
              size={BADGE}
              thickness={6}
              label="Sets done"
              unit="sets"
            />
          ) : (
            <Badge icon={PlayArrowRounded} tint={summit.surface.softHover} color={tokens.accent.main} />
          )
        }
        when={done ? 'Done' : 'In progress'}
        name={
          <Box component="span" data-testid="training-today">
            {done ? 'Done' : 'In progress'}: {name}
          </Box>
        }
        line={`${session.sets_done} sets · ${formatNumber(session.volume_kg)} kg`}
      >
        <Button
          component={RouterLink}
          to={`/train/session/${session.id}`}
          variant={done ? 'outlined' : 'contained'}
          fullWidth
          startIcon={done ? undefined : <PlayArrowRounded />}
          sx={{ ...CTA, mt: '16px' }}
        >
          {done ? 'View session' : 'Resume session'}
        </Button>
        {fastNote}
      </Shell>
    )
  }

  if (planned) {
    const sets = planned.exercises.reduce((n, e) => n + e.sets, 0)
    const count = planned.exercises.length
    return (
      <Shell
        badge={
          readiness ? (
            <ReadinessRing readiness={readiness} />
          ) : (
            <Badge icon={FitnessCenterRounded} tint={summit.surface.softHover} color={tokens.accent.main} />
          )
        }
        when={time}
        name={
          <Box component="span" data-testid="training-today">
            {planned.name}
          </Box>
        }
        line={`${readiness ? `Readiness ${readiness.score} · ` : ''}${count} ${count === 1 ? 'exercise' : 'exercises'} · ${sets} sets`}
      >
        <ExerciseList exercises={planned.exercises} />
        <Box sx={{ display: 'flex', gap: '8px', mt: '14px' }}>
          <Button
            component={RouterLink}
            to="/train"
            variant="contained"
            startIcon={<PlayArrowRounded />}
            sx={{ ...CTA, flex: 1 }}
          >
            Start session
          </Button>
          {planned.template_id && (
            <Button
              component={RouterLink}
              to={`/train/builder/${planned.template_id}`}
              variant="outlined"
              aria-label="Edit template"
              sx={{ minHeight: 50 }}
            >
              Edit
            </Button>
          )}
        </Box>
        {fastNote}
      </Shell>
    )
  }

  return (
    <Shell
      badge={
        training && readiness ? (
          <ReadinessRing readiness={readiness} />
        ) : (
          <Badge
            icon={training ? FitnessCenterRounded : SelfImprovementRounded}
            tint={summit.surface.softHover}
            color={tokens.accent.main}
          />
        )
      }
      when={training ? time : null}
      name={
        <Box component="span" data-testid="training-today">
          {training ? 'Training day' : 'Rest day'}
        </Box>
      }
      line={training && readiness ? `Readiness ${readiness.score}` : undefined}
    >
      {training && (
        <Button component={RouterLink} to="/train" variant="outlined" fullWidth sx={{ ...CTA, mt: '16px' }}>
          Choose a workout
        </Button>
      )}
      {fastNote}
    </Shell>
  )
}
