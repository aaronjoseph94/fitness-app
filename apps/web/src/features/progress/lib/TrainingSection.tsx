// Owns: Progress's Training section (SPEC §7, §11; 1d's 1 : 1.3 : 1.2 row, wrapping) — the volume map with a slider
// choosing which 7 days of the range it covers, strength per exercise (e1RM and the top set over time, the most-logged
// exercises first, the change since the first session in teal), and the weekly reviews; then weekly volume stacked by
// muscle group (real kg lifted, sets × reps × kg) beside the week plan. Data: the range's sessions (GET
// /api/sessions), the library's muscle tags, GET /api/history/exercises/:id for the picked exercise, and the reviews
// and week plan cards' own reads.
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
import {
  ChartCard,
  formatNumber,
  formatShortDate,
  formatSigned,
  QueryStateCard,
  SectionHeader,
  WindowSlider,
  wrapCol,
  WrapRow,
} from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { strengthSessions, useExerciseIndex, type ExerciseIndex } from '../../library'
import { exercisesByUse, sessionVolumeWeeks, volumeBetween, VOLUME_GROUPS } from './series'
import { WeeklyReviewsSection } from './WeeklyReviewsSection'
import { WeekViewSection } from './WeekViewSection'

/** The volume map's window: one week. */
const WINDOW_DAYS = 7
/** Exercises offered in the strength picker. */
const PICKER_SIZE = 12
/** 1d's volume map on Progress: 200 px. */
const MAP_SIZE = 200

interface TrainingSectionProps {
  sessions: UseQueryResult<WorkoutSession[], ApiError>
  from: LocalDate
  to: LocalDate
  /** Today: the week plan opens on this week. */
  date: LocalDate
}

/** README §4: a section heading sits 40 px under the row above it (rows are 26 px apart). */
const HEADING_GAP = 40 - tokens.rhythm.section

export function TrainingSection({ sessions, from, to, date }: TrainingSectionProps) {
  const index = useExerciseIndex()
  return (
    <Box
      component="section"
      aria-labelledby="progress-training-title"
      data-testid="progress-training"
      sx={{ mt: `${HEADING_GAP}px`, minWidth: 0 }}
    >
      <SectionHeader
        id="progress-training"
        title="Training"
        subtitle="The volume map, strength per exercise, the weekly reviews and the week"
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: `${tokens.rhythm.section}px` }}>
        <WrapRow>
          <Box sx={wrapCol(1)}>
            {sessions.data ? (
              <VolumeMapCard sessions={sessions.data} index={index} from={from} to={to} />
            ) : (
              <QueryStateCard query={sessions} what="your sessions" height={360} titleSize="card" />
            )}
          </Box>
          <Box sx={wrapCol(1.3)}>
            {sessions.data ? (
              <StrengthCard sessions={sessions.data} index={index} />
            ) : (
              <QueryStateCard query={sessions} what="your sessions" height={360} titleSize="card" />
            )}
          </Box>
          <Box sx={wrapCol(1.2)}>
            <WeeklyReviewsSection />
          </Box>
        </WrapRow>
        <WrapRow>
          <Box sx={wrapCol(1)}>
            {sessions.data ? (
              <VolumeCard sessions={sessions.data} index={index} from={from} to={to} />
            ) : (
              <QueryStateCard query={sessions} what="your sessions" height={260} titleSize="card" />
            )}
          </Box>
          <Box sx={wrapCol(1.3)}>
            <WeekViewSection date={date} />
          </Box>
        </WrapRow>
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
  const weeks = useMemo(
    () => sessionVolumeWeeks(sessions, index.all, from, to),
    [sessions, index.all, from, to],
  )
  const lifted = weeks.some((w) => Object.values(w.volume).some((kg) => kg > 0))
  const thisWeek = Object.values(weeks.at(-1)?.volume ?? {}).reduce((sum, kg) => sum + kg, 0)
  return (
    <ChartCard
      fill
      title="Weekly volume"
      titleSize="card"
      subtitle={`Sets × reps × kg, by muscle group · ${formatNumber(thisWeek)} kg this week`}
      empty={
        lifted
          ? undefined
          : {
              title: 'No sets logged yet',
              body: 'Finish a session with loads and reps and its week fills in.',
            }
      }
      testId="progress-volume"
    >
      <TrainingVolumeChart weeks={weeks} groups={VOLUME_GROUPS} height={210} />
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
  const volume = useMemo(
    () => volumeBetween(sessions, index.all, start, end),
    [sessions, index.all, start, end],
  )
  const levels = muscleLevels(volume.volume_by_muscle)
  return (
    <ChartCard
      fill
      title="Volume map"
      titleSize="card"
      subtitle={`Volume per muscle, ${formatShortDate(start)} – ${formatShortDate(end)} · ${formatNumber(volume.volume_kg)} kg`}
      testId="progress-volume-map"
    >
      <Box sx={{ width: MAP_SIZE, maxWidth: '100%', mx: 'auto' }}>
        <MuscleMap levels={levels} size={MAP_SIZE} title={`Weekly volume per muscle, ${start} to ${end}`} />
      </Box>
      <Box sx={{ mt: '10px' }}>
        <MuscleMapLegend variant="scale" />
      </Box>
      {span > 0 && (
        <Box sx={{ mt: '12px' }}>
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
        </Box>
      )}
    </ChartCard>
  )
}

function StrengthCard({ sessions, index }: Pick<CardProps, 'sessions' | 'index'>) {
  const options = useMemo(
    () =>
      exercisesByUse(sessions)
        .slice(0, PICKER_SIZE)
        .map((e) => ({ ...e, name: index.byId.get(e.exercise_id)?.name ?? 'Exercise' })),
    [sessions, index.byId],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const id =
    picked && options.some((o) => o.exercise_id === picked) ? picked : (options[0]?.exercise_id ?? null)
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
      fill
      title="Strength"
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
          ? {
              title: 'No loaded sets yet',
              body: 'Each exercise gets its load and e1RM line once sets are logged.',
            }
          : history.data && points.length === 0
            ? { title: 'No loaded sets yet', body: 'This exercise has no set with a load yet.' }
            : undefined
      }
      testId="progress-strength"
    >
      {history.data ? (
        <StrengthChart sessions={points} height={190} />
      ) : (
        <QueryStateCard query={history} what="this exercise's history" height={220} />
      )}
      {first && last && points.length > 1 && (
        <Box
          sx={{
            mt: '12px',
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.label,
            lineHeight: tokens.font.leading.small,
            color: tokens.ink.secondary,
          }}
        >
          <Box
            component="span"
            sx={{ color: last.e1rm >= first.e1rm ? tokens.tone.success.text : tokens.tone.warning.text }}
          >
            {formatSigned(last.e1rm - first.e1rm, 0)} kg
          </Box>{' '}
          in {points.length} sessions · {formatNumber(first.e1rm, 0)} → {formatNumber(last.e1rm, 0)}
        </Box>
      )}
    </ChartCard>
  )
}

/** 1d's soft picker in a card header: soft violet, deep ink, 34 px, radius 10; 44 px on a touch screen. */
const pickerSx = {
  maxWidth: 200,
  '& .MuiInputBase-root': {
    borderRadius: `${tokens.radius.inner}px`,
    bgcolor: tokens.summit.surface.soft,
    color: tokens.summit.ink.deep,
    [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
  },
  '& .MuiOutlinedInput-notchedOutline': { border: 0 },
  '& .MuiInputBase-input.MuiSelect-select': {
    py: '7px',
    pl: '12px',
    minHeight: 0,
    fontSize: tokens.font.size.small,
    fontWeight: tokens.font.weight.label,
    lineHeight: '20px',
    // 16 px on touch so iOS does not zoom.
    [COARSE_POINTER_QUERY]: { fontSize: 16 },
  },
} as const
