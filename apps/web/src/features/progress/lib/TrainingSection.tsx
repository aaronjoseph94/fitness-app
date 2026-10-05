// Owns: Progress's Training section (SPEC §7, §11) — training volume per week stacked by muscle group (real kg lifted,
// sets × reps × kg), the weekly volume muscle map with a slider choosing which 7 days of the range it covers, and
// strength per exercise (top-set load and e1RM over time, the most-logged exercises first). Data: the range's sessions
// (GET /api/sessions), the library's muscle tags, and GET /api/history/exercises/:id for the picked exercise.
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { addDays, daysBetween, muscleLevels } from '@fitness/shared/engine'
import type { LocalDate, WorkoutSession } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useApiQuery, type ApiError } from '../../../api'
import { StrengthChart, TrainingVolumeChart } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate, QueryStateCard, SectionHeader } from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { tokens, withAlpha } from '../../../theme'
import { strengthSessions, useExerciseIndex, type ExerciseIndex } from '../../library'
import { exercisesByUse, sessionVolumeWeeks, volumeBetween, VOLUME_GROUPS } from './series'

/** The volume map's window: one week. */
const WINDOW_DAYS = 7
/** Exercises offered in the strength picker. */
const PICKER_SIZE = 12

interface TrainingSectionProps {
  sessions: UseQueryResult<WorkoutSession[], ApiError>
  from: LocalDate
  to: LocalDate
}

export function TrainingSection({ sessions, from, to }: TrainingSectionProps) {
  const index = useExerciseIndex()
  const header = <SectionHeader title="Training" subtitle="Weekly volume by muscle group, the muscles a week reached, and strength per exercise." />
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
      <Box sx={{ display: 'grid', gap: 4, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
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
  return (
    <ChartCard
      title="Training volume per week"
      subtitle="Sets × reps × kg, stacked by muscle group"
      empty={lifted ? undefined : { title: 'No sets logged yet', body: 'Finish a session with loads and reps and its week fills in.', illustration: null }}
      testId="progress-volume"
    >
      <TrainingVolumeChart weeks={weeks} groups={VOLUME_GROUPS} />
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
      title="Muscles trained"
      subtitle={`${formatShortDate(start)} – ${formatShortDate(end)} · ${formatNumber(volume.volume_kg)} kg lifted`}
      testId="progress-volume-map"
    >
      <Stack spacing={3} sx={{ alignItems: 'center' }}>
        <MuscleMap levels={levels} size={260} title={`Weekly volume per muscle, ${start} to ${end}`} />
        <MuscleMapLegend />
        {span > 0 && (
          <Box sx={{ width: '100%', px: 2 }}>
            <Slider
              value={endOffset}
              min={0}
              max={span}
              step={1}
              onChange={(_, v) => setOffset(v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `7 days to ${formatShortDate(addDays(from, v))}`}
              getAriaValueText={(v) => `7 days to ${addDays(from, v)}`}
              aria-label="Week shown on the map"
              data-testid="volume-map-slider"
              sx={sliderSx}
            />
          </Box>
        )}
      </Stack>
    </ChartCard>
  )
}

const SLIDER_COLOR = tokens.muscleMap.steps[tokens.muscleMap.steps.length - 1]
const DOT = 20

/**
 * The week slider with 44 px touch targets (SPEC §11): the rail's hit area and the thumb are tapTarget tall, while
 * the thumb still draws MUI's 20 px dot (its ::before) with the hover, focus and drag halos around the dot.
 */
const sliderSx = {
  color: SLIDER_COLOR,
  py: `${(tokens.tapTarget - 4) / 2}px`,
  '& .MuiSlider-thumb': {
    width: tokens.tapTarget,
    height: tokens.tapTarget,
    bgcolor: 'transparent',
    '&::before': { width: DOT, height: DOT, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', bgcolor: 'currentColor' },
    '&::after': { width: tokens.tapTarget, height: tokens.tapTarget },
    '&:hover, &.Mui-focusVisible, &.Mui-active': { boxShadow: 'none' },
    '&:hover::before, &.Mui-focusVisible::before': { boxShadow: `0 0 0 8px ${withAlpha(SLIDER_COLOR, 0.16)}` },
    '&.Mui-active::before': { boxShadow: `0 0 0 14px ${withAlpha(SLIDER_COLOR, 0.16)}` },
  },
  // The value label sits over the dot as before (the thumb box grew by 12 px above it).
  '& .MuiSlider-valueLabel': { top: (tokens.tapTarget - DOT) / 2 - 10 },
} as const

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
  return (
    <ChartCard
      title="Strength per exercise"
      subtitle="Top set load and estimated 1RM"
      action={
        options.length > 0 && id ? (
          <TextField
            select
            label="Exercise"
            value={id}
            onChange={(e) => setPicked(e.target.value)}
            sx={{ minWidth: 160, maxWidth: 220 }}
            slotProps={{ htmlInput: { 'data-testid': 'strength-exercise' } }}
          >
            {options.map((o) => (
              <MenuItem key={o.exercise_id} value={o.exercise_id} sx={{ minHeight: tokens.tapTarget }}>
                {o.name}
              </MenuItem>
            ))}
          </TextField>
        ) : undefined
      }
      empty={
        options.length === 0
          ? { title: 'No loaded sets yet', body: 'Each exercise gets its load and e1RM line once sets are logged.', illustration: null }
          : history.data && points.length === 0
            ? { title: 'No loaded sets yet', body: 'This exercise has no set with a load yet.', illustration: null }
            : undefined
      }
      testId="progress-strength"
    >
      {history.data ? <StrengthChart sessions={points} /> : <QueryStateCard query={history} what="this exercise's history" height={220} />}
    </ChartCard>
  )
}
