// Owns: Progress's Training section (SPEC §7, §11; 2a's 1.5 : 1 : 1.2 row) — weekly volume stacked by muscle group
// (real kg lifted, sets × reps × kg), the volume map with a slider choosing which 7 days of the range it covers (the
// days shown are drawn blue on the track), and strength per exercise (top-set load and e1RM over time, the most-logged
// exercises first). Data: the range's sessions (GET /api/sessions), the library's muscle tags, and
// GET /api/history/exercises/:id for the picked exercise.
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { addDays, daysBetween, muscleLevels } from '@fitness/shared/engine'
import type { LocalDate, WorkoutSession } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useApiQuery, type ApiError } from '../../../api'
import { StrengthChart, TrainingVolumeChart } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate, formatSigned, QueryStateCard, SectionHeader, WindowSlider } from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { strengthSessions, useExerciseIndex, type ExerciseIndex } from '../../library'
import { exercisesByUse, sessionVolumeWeeks, volumeBetween, VOLUME_GROUPS } from './series'

/** The volume map's window: one week. */
const WINDOW_DAYS = 7
/** Exercises offered in the strength picker. */
const PICKER_SIZE = 12
/** 2a's volume map is 180 px wide. */
const MAP_SIZE = 180

interface TrainingSectionProps {
  sessions: UseQueryResult<WorkoutSession[], ApiError>
  from: LocalDate
  to: LocalDate
}

export function TrainingSection({ sessions, from, to }: TrainingSectionProps) {
  const index = useExerciseIndex()
  const header = <SectionHeader title="Training" subtitle="Weekly volume by muscle group, the volume map, strength per exercise" />
  if (!sessions.data)
    return (
      <Box>
        {header}
        <QueryStateCard query={sessions} what="your sessions" height={220} />
      </Box>
    )
  return (
    <Box data-testid="progress-training">
      {header}
      <Box
        sx={{
          display: 'grid',
          gap: 4,
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1.2fr)' },
          // Between 900 and 1200 px the strength card takes the second row's full width.
          '& > :nth-of-type(3)': { gridColumn: { md: '1 / -1', lg: 'auto' } },
        }}
      >
        <VolumeCard sessions={sessions.data} index={index} from={from} to={to} />
        <VolumeMapCard sessions={sessions.data} index={index} from={from} to={to} />
        <StrengthCard sessions={sessions.data} index={index} />
      </Box>
    </Box>
  )
}

interface CardProps {
  sessions: readonly WorkoutSession[]
  index: ExerciseIndex
  from: LocalDate
  to: LocalDate
}

function VolumeCard({ sessions, index, from, to }: CardProps) {
  const weeks = useMemo(() => sessionVolumeWeeks(sessions, index.all, from, to), [sessions, index.all, from, to])
  const lifted = weeks.some((w) => Object.values(w.volume).some((kg) => kg > 0))
  const thisWeek = Object.values(weeks.at(-1)?.volume ?? {}).reduce((sum, kg) => sum + kg, 0)
  return (
    <ChartCard
      title="Weekly volume"
      titleSize="card"
      subtitle={`kg lifted, stacked by muscle group · ${formatNumber(thisWeek)} kg this week`}
      empty={lifted ? undefined : { title: 'No sets logged yet', body: 'Finish a session with loads and reps and its week fills in.' }}
      testId="progress-volume"
    >
      <TrainingVolumeChart weeks={weeks} groups={VOLUME_GROUPS} height={200} />
    </ChartCard>
  )
}

function VolumeMapCard({ sessions, index, from, to }: CardProps) {
  // The window ends on any day of the range; it starts no earlier than the range does.
  const span = Math.max(0, daysBetween(from, to))
  const [offset, setOffset] = useState<number | null>(null)
  const endOffset = Math.min(span, offset ?? span)
  const end = addDays(from, endOffset)
  const start = addDays(end, -(WINDOW_DAYS - 1)) < from ? from : addDays(end, -(WINDOW_DAYS - 1))
  const volume = useMemo(() => volumeBetween(sessions, index.all, start, end), [sessions, index.all, start, end])
  const levels = muscleLevels(volume.volume_by_muscle)
  return (
    <ChartCard
      title="Volume map"
      titleSize="card"
      subtitle={`${formatShortDate(start)} – ${formatShortDate(end)} · ${formatNumber(volume.volume_kg)} kg lifted`}
      action={
        <Box component="span" sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, whiteSpace: 'nowrap' }}>
          {WINDOW_DAYS} days
        </Box>
      }
      testId="progress-volume-map"
    >
      <Box sx={{ width: MAP_SIZE, maxWidth: '100%', mx: 'auto' }}>
        <MuscleMap levels={levels} size={MAP_SIZE} title={`Weekly volume per muscle, ${start} to ${end}`} />
      </Box>
      <Box sx={{ mt: '8px', display: 'flex', justifyContent: 'center' }}>
        <MuscleMapLegend dense />
      </Box>
      {span > 0 && (
        <WindowSlider
          from={from}
          to={to}
          start={start}
          end={end}
          value={endOffset}
          onChange={setOffset}
          ariaLabel="Week shown on the map"
          testId="volume-map-slider"
        />
      )}
    </ChartCard>
  )
}

function StrengthCard({ sessions, index }: Pick<CardProps, 'sessions' | 'index'>) {
  const options = useMemo(
    () => exercisesByUse(sessions).slice(0, PICKER_SIZE).map((e) => ({ ...e, name: index.byId.get(e.exercise_id)?.name ?? 'Exercise' })),
    [sessions, index.byId],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const id = picked && options.some((o) => o.exercise_id === picked) ? picked : (options[0]?.exercise_id ?? null)
  const history = useApiQuery(
    endpoints.training.exerciseHistory,
    { params: { id: id ?? '00000000-0000-4000-8000-000000000000' } },
    { enabled: id !== null, retry: false },
  )
  const points = useMemo(() => (history.data ? strengthSessions(history.data) : []), [history.data])
  const first = points[0]
  const last = points.at(-1)
  return (
    <ChartCard
      title="Strength per exercise"
      titleSize="card"
      subtitle="Estimated 1RM (Epley) and the top set, per session"
      action={
        options.length > 0 && id ? (
          <TextField
            select
            size="small"
            value={id}
            onChange={(e) => setPicked(e.target.value)}
            sx={pickerSx}
            slotProps={{ htmlInput: { 'data-testid': 'strength-exercise', 'aria-label': 'Exercise' } }}
          >
            {options.map((o) => (
              <MenuItem key={o.exercise_id} value={o.exercise_id}>
                {o.name}
              </MenuItem>
            ))}
          </TextField>
        ) : undefined
      }
      empty={
        options.length === 0
          ? { title: 'No loaded sets yet', body: 'Each exercise gets its load and e1RM line once sets are logged.' }
          : history.data && points.length === 0
            ? { title: 'No loaded sets yet', body: 'This exercise has no set with a load yet.' }
            : undefined
      }
      testId="progress-strength"
    >
      {history.data ? <StrengthChart sessions={points} height={180} /> : <QueryStateCard query={history} what="this exercise's history" height={220} />}
      {first && last && points.length > 1 && (
        <Box
          sx={{
            mt: '12px',
            pt: '10px',
            borderTop: `1px solid ${tokens.ink.hairline}`,
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.caption,
            color: tokens.ink.secondary,
          }}
        >
          {formatSigned(last.e1rm - first.e1rm, 0)} kg est. 1RM over {points.length} sessions · {formatNumber(last.e1rm, 0)} kg now
        </Box>
      )}
    </ChartCard>
  )
}

/** 2a's compact picker in a card header: 12 px, 3 × 8 padding, radius 6; 44 px tall on a touch screen. */
const pickerSx = {
  maxWidth: 180,
  '& .MuiInputBase-root': { borderRadius: `${tokens.radius.inner}px`, [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget } },
  '& .MuiInputBase-input.MuiSelect-select': {
    py: '3px',
    pl: '8px',
    minHeight: 0,
    fontSize: tokens.font.size.caption,
    lineHeight: '18px',
    // 16 px on touch so iOS does not zoom (no touch-input size token yet; cardTitle is the 16 px step).
    [COARSE_POINTER_QUERY]: { fontSize: tokens.font.size.cardTitle },
  },
} as const
