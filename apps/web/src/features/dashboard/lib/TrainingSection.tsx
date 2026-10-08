// Owns: the Dashboard's Training section (2a) — a 1.6 : 1 : 1 row of training volume per week stacked by muscle group
// (real kg lifted, sets × reps × kg), the volume map of the muscles a week of the window actually reached (a slider
// chooses which 7 days it covers), and strength per exercise (top-set load and e1RM, the most-logged exercises first).
// The sessions come from the window the Dashboard already loaded; only the strength chart's per-exercise history is its
// own read (GET /api/history/exercises/:id).
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { addDays, daysBetween, muscleLevels } from '@fitness/shared/engine'
import type { LocalDate, WorkoutSession } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { StrengthChart, TrainingVolumeChart } from '../../../charts'
import { Column, Columns, formatNumber, formatShortDate } from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens, withAlpha } from '../../../theme'
import { strengthSessions, useExerciseIndex, type ExerciseIndex } from '../../library'
import { exercisesByUse, sessionVolumeWeeks, volumeBetween, VOLUME_GROUPS } from '../../progress/series'
import { DashCard } from './DashCard'
import { DashboardSection, WIDE_ROW } from './Section'
import type { DashboardData } from './useDashboardData'

/** The volume map's window: one week. */
const WINDOW_DAYS = 7
/** Exercises offered in the strength picker. */
const PICKER_SIZE = 12
/** The charts' plot height in this row: 2a's 150 px frame plus the x-axis band. */
const CHART_HEIGHT = 190
/** 2a's volume map: 200 px. */
const MAP_SIZE = 200
/** A uuid that matches no exercise, so the history read stays disabled until one is picked. */
const NO_EXERCISE = '00000000-0000-4000-8000-000000000000'

export function TrainingSection({ data }: { data: DashboardData }) {
  const index = useExerciseIndex()
  return (
    <DashboardSection id="training" title="Training" subtitle="Volume per week by muscle group, and where it landed">
      <Columns md={2} lg={WIDE_ROW.tracks} align="stretch">
        <Column span={WIDE_ROW.wide} mdSpan={2}>
          <VolumeCard sessions={data.sessions} index={index} from={data.from} to={data.to} />
        </Column>
        <Column span={WIDE_ROW.narrow} mdSpan={1}>
          <VolumeMapCard sessions={data.sessions} index={index} from={data.from} to={data.to} />
        </Column>
        <Column span={WIDE_ROW.narrow} mdSpan={1}>
          <StrengthCard sessions={data.sessions} index={index} />
        </Column>
      </Columns>
    </DashboardSection>
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
  const total = useMemo(() => weeks.reduce((sum, w) => sum + Object.values(w.volume).reduce((s, kg) => s + kg, 0), 0), [weeks])
  const count = sessions.length
  return (
    <DashCard
      title="Weekly volume"
      subtitle={`kg lifted (sets × reps × load), stacked by muscle group · ${count} ${count === 1 ? 'session' : 'sessions'}, ${formatNumber(total)} kg in this window`}
      empty={lifted ? null : { title: 'No sets logged yet', body: 'Finish a session with loads and reps and its week fills in.' }}
      testId="dashboard-volume"
    >
      <TrainingVolumeChart weeks={weeks} groups={VOLUME_GROUPS} height={CHART_HEIGHT} />
    </DashCard>
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
    <DashCard
      title="Volume map"
      subtitle={`Volume per muscle, ${formatShortDate(start)} – ${formatShortDate(end)} · ${formatNumber(volume.volume_kg)} kg`}
      testId="dashboard-volume-map"
    >
      <Stack spacing={2} sx={{ alignItems: 'center' }}>
        <MuscleMap levels={levels} size={MAP_SIZE} body="light" title={`Weekly volume per muscle, ${start} to ${end}`} />
        <MuscleMapLegend dense />
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
    </DashCard>
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
    { params: { id: id ?? NO_EXERCISE } },
    { enabled: id !== null, retry: false },
  )
  const points = useMemo(() => (history.data ? strengthSessions(history.data) : []), [history.data])
  return (
    <DashCard
      title="Strength"
      subtitle="Top set load and estimated 1RM (Epley), per session"
      empty={
        options.length === 0
          ? { title: 'No loaded sets yet', body: 'Each exercise gets its load and e1RM line once sets are logged.' }
          : history.data && points.length === 0
            ? { title: 'No loaded sets yet', body: 'This exercise has no set with a load yet.' }
            : null
      }
      testId="dashboard-strength"
    >
      {/* The picker opens the body rather than sitting beside the title, so the row's three titles share a baseline. It
          has no floating label: the select names itself ("Exercise") and shows the exercise it draws. */}
      {id && (
        <TextField
          select
          size="small"
          value={id}
          onChange={(e) => setPicked(e.target.value)}
          sx={{
            mb: 3,
            minWidth: 160,
            maxWidth: '100%',
            '& .MuiInputBase-input': { py: '7px', pl: '10px' },
            [COARSE_POINTER_QUERY]: { '& .MuiInputBase-root': { minHeight: tokens.tapTarget } },
          }}
          slotProps={{ htmlInput: { 'aria-label': 'Exercise', 'data-testid': 'strength-exercise' } }}
        >
          {options.map((o) => (
            <MenuItem key={o.exercise_id} value={o.exercise_id}>
              {o.name}
            </MenuItem>
          ))}
        </TextField>
      )}
      {history.data ? <StrengthChart sessions={points} height={CHART_HEIGHT} /> : <EmptyHistory loading={history.isPending} />}
    </DashCard>
  )
}

/** Holds the strength card's height while its per-exercise history is read. */
function EmptyHistory({ loading }: { loading: boolean }) {
  return (
    <Box
      sx={{
        height: CHART_HEIGHT,
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: tokens.ink.page,
        color: tokens.ink.secondary,
        fontSize: tokens.font.size.small,
      }}
    >
      {loading ? 'Loading…' : 'No history for this exercise yet'}
    </Box>
  )
}
