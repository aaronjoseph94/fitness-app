// Owns: Progress's Training section (SPEC §7, §11; 2a's 1.5 : 1 : 1.2 row) — weekly volume stacked by muscle group
// (real kg lifted, sets × reps × kg), the volume map with a slider choosing which 7 days of the range it covers (the
// days shown are drawn blue on the track), and strength per exercise (top-set load and e1RM over time, the most-logged
// exercises first). Data: the range's sessions (GET /api/sessions), the library's muscle tags, and
// GET /api/history/exercises/:id for the picked exercise.
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Slider from '@mui/material/Slider'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { addDays, daysBetween, muscleLevels } from '@fitness/shared/engine'
import type { LocalDate, WorkoutSession } from '@fitness/shared/schemas'
import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useApiQuery, type ApiError } from '../../../api'
import { StrengthChart, TrainingVolumeChart } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate, formatSigned, QueryStateCard, SectionHeader } from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens, withAlpha } from '../../../theme'
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
  // The days the map shows, as a share of the track: [start, end] over [from, to].
  const pct = (date: LocalDate) => (span > 0 ? (daysBetween(from, date) / span) * 100 : 100)
  return (
    <ChartCard
      title="Volume map"
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: '10px' }}>
          <Box component="span" sx={trackLabel}>
            {formatShortDate(from)}
          </Box>
          <Box sx={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <Box aria-hidden sx={{ ...trackBar, left: 0, right: 0, bgcolor: tokens.ink.border }} />
            <Box aria-hidden sx={{ ...trackBar, left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%`, bgcolor: tokens.accent.main }} />
            <Slider
              value={endOffset}
              min={0}
              max={span}
              step={1}
              track={false}
              onChange={(_, v) => setOffset(v as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => `7 days to ${formatShortDate(addDays(from, v))}`}
              getAriaValueText={(v) => `7 days to ${addDays(from, v)}`}
              aria-label="Week shown on the map"
              data-testid="volume-map-slider"
              sx={sliderSx}
            />
          </Box>
          <Box component="span" sx={trackLabel}>
            {formatShortDate(to)}
          </Box>
        </Box>
      )}
    </ChartCard>
  )
}

const trackLabel = { flex: 'none', fontSize: tokens.font.size.micro, color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' } as const
/** 2a's 4 px track: grey for the range, blue for the 7 days on the map (under the slider, whose own rail is hidden). */
const trackBar = { position: 'absolute', top: '50%', height: 4, mt: '-2px', borderRadius: '2px' } as const

const KNOB = 14

/**
 * The week slider with 44 px touch targets (SPEC §11): the slider's hit area and the thumb are tapTarget tall, while
 * the thumb draws 2a's 14 px white knob with a 2 px blue ring (its ::before), a soft halo on hover and drag, and a
 * focus ring on keyboard focus.
 */
const sliderSx = {
  display: 'block',
  color: tokens.accent.main,
  py: `${(tokens.tapTarget - 4) / 2}px`,
  '& .MuiSlider-rail': { opacity: 0 },
  '& .MuiSlider-thumb': {
    width: tokens.tapTarget,
    height: tokens.tapTarget,
    bgcolor: 'transparent',
    '&::before': {
      width: KNOB,
      height: KNOB,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      boxSizing: 'border-box',
      bgcolor: tokens.ink.card,
      border: `2px solid ${tokens.accent.main}`,
      boxShadow: 'none',
    },
    '&::after': { width: tokens.tapTarget, height: tokens.tapTarget },
    '&:hover, &.Mui-focusVisible, &.Mui-active': { boxShadow: 'none' },
    '&:hover::before': { boxShadow: `0 0 0 6px ${withAlpha(tokens.accent.main, 0.16)}` },
    '&.Mui-active::before': { boxShadow: `0 0 0 10px ${withAlpha(tokens.accent.main, 0.16)}` },
    '&.Mui-focusVisible::before': { boxShadow: `0 0 0 2px ${tokens.ink.card}, 0 0 0 4px ${tokens.accent.main}` },
    // The knob's own ring is the focus indicator; the theme's outline around the 44 px hit box would be a second ring.
    '&.Mui-focusVisible': { outline: 'none' },
  },
  // 2a's dark tooltip, over the knob (the thumb box is taller than the knob it draws).
  '& .MuiSlider-valueLabel': {
    top: (tokens.tapTarget - KNOB) / 2 - 10,
    bgcolor: tokens.dark.bg,
    color: tokens.dark.text,
    borderRadius: `${tokens.radius.control}px`,
    py: '6px',
    px: '10px',
    fontSize: tokens.font.size.caption,
    fontWeight: tokens.font.weight.label,
  },
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
  const first = points[0]
  const last = points.at(-1)
  return (
    <ChartCard
      title="Strength per exercise"
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
