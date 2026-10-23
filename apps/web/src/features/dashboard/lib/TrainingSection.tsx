// Owns: the Dashboard's Training section (1d, a 1.2 : 1 : 1.1 row that wraps, open at every width) — training volume
// per week stacked by muscle group (real kg lifted, sets × reps × kg) as wide bars with the week's total above, the
// volume map of the muscles a week of the window reached (a slider chooses which 7 days it covers), and strength: the
// most-used exercises' estimated 1RM from their first session in the window to the latest with the change as a chip,
// then one exercise's top-set load and e1RM over time. The sessions come from the window the Dashboard already
// loaded; only the strength chart's per-exercise history is its own read (GET /api/history/exercises/:id).
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { addDays, daysBetween, e1rm, muscleLevels } from '@fitness/shared/engine'
import type { LocalDate, WorkoutSession } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { StrengthChart, TrainingVolumeChart } from '../../../charts'
import {
  ChartCard,
  formatNumber,
  formatShortDate,
  formatSigned,
  StatusChip,
  WindowSlider,
  wrapCol,
  WrapRow,
} from '../../../components'
import { MuscleMap, MuscleMapLegend } from '../../../muscle-map'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { strengthSessions, useExerciseIndex, type ExerciseIndex } from '../../library'
import { exercisesByUse, sessionVolumeWeeks, volumeBetween, VOLUME_GROUPS } from '../../progress/series'
import { DashboardSection } from './Section'
import type { DashboardData } from './useDashboardData'

/** The volume map's window: one week. */
const WINDOW_DAYS = 7
/** Exercises offered in the strength picker. */
const PICKER_SIZE = 12
/** Exercises listed as strength rows (1d: four). */
const STRENGTH_ROWS = 4
/** The volume chart's plot height (1d: 170 px of bars plus their labels). */
const VOLUME_HEIGHT = 250
/** The strength chart's plot height under the rows. */
const STRENGTH_HEIGHT = 130
/** 1d's volume map: 240 px. */
const MAP_SIZE = 240
/** A uuid that matches no exercise, so the history read stays disabled until one is picked. */
const NO_EXERCISE = '00000000-0000-4000-8000-000000000000'
/** A change under this share of the first e1RM reads "flat". */
const FLAT_PCT = 0.5

export function TrainingSection({ data }: { data: DashboardData }) {
  const index = useExerciseIndex()
  // The window's day rows start no earlier than the plan (GET /api/days clips them to the profile's start date): the
  // volume weeks and the map's slider start there too, rather than with weeks that cannot hold a session.
  const from = data.days[0]?.date && data.days[0].date > data.from ? data.days[0].date : data.from
  return (
    <DashboardSection
      id="training"
      title="Training"
      subtitle="Volume per week by muscle group, where it landed, and strength"
      fold={false}
    >
      {/* Each card its own height: the volume charts are shorter than Strength with its picker and notes. */}
      <WrapRow align="flex-start">
        <Box sx={wrapCol(1.2)}>
          <VolumeCard sessions={data.sessions} index={index} from={from} to={data.to} />
        </Box>
        <Box sx={wrapCol(1)}>
          <VolumeMapCard sessions={data.sessions} index={index} from={from} to={data.to} />
        </Box>
        <Box sx={wrapCol(1.1)}>
          <StrengthCard sessions={data.sessions} index={index} />
        </Box>
      </WrapRow>
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
  const weeks = useMemo(
    () => sessionVolumeWeeks(sessions, index.all, from, to),
    [sessions, index.all, from, to],
  )
  const lifted = weeks.some((w) => Object.values(w.volume).some((kg) => kg > 0))
  const total = useMemo(
    () => weeks.reduce((sum, w) => sum + Object.values(w.volume).reduce((s, kg) => s + kg, 0), 0),
    [weeks],
  )
  const count = sessions.length
  return (
    <ChartCard
      fill
      title="Weekly volume"
      subtitle={`Sets × reps × kg, by muscle group · ${count} ${count === 1 ? 'session' : 'sessions'}, ${formatNumber(total)} kg in this window`}
      empty={
        lifted
          ? null
          : {
              title: 'No sets logged yet',
              body: 'Finish a session with loads and reps and its week fills in.',
            }
      }
      testId="dashboard-volume"
    >
      <TrainingVolumeChart weeks={weeks} groups={VOLUME_GROUPS} height={VOLUME_HEIGHT} />
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
      subtitle={`${formatShortDate(start)} – ${formatShortDate(end)} · ${formatNumber(volume.volume_kg)} kg`}
      testId="dashboard-volume-map"
    >
      <Box
        sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', justifyItems: 'center', gap: '12px' }}
      >
        <Box sx={{ width: MAP_SIZE, maxWidth: '100%' }}>
          <MuscleMap levels={levels} size={MAP_SIZE} title={`Weekly volume per muscle, ${start} to ${end}`} />
        </Box>
        <MuscleMapLegend variant="scale" />
        {span > 0 && (
          <Box sx={{ width: '100%' }}>
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
      </Box>
    </ChartCard>
  )
}

interface StrengthRow {
  exercise_id: string
  name: string
  first: number
  latest: number
}

/**
 * Each exercise's best Epley e1RM = load × (1 + reps / 30) over its completed, loaded sets, in its first session of
 * the window and in its latest: the 1d strength rows, most-used exercises first. Pure.
 */
function strengthRows(
  sessions: readonly WorkoutSession[],
  ids: readonly string[],
  nameOf: (id: string) => string,
): StrengthRow[] {
  const ordered = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const best = (s: WorkoutSession, id: string) => {
    let top: number | null = null
    for (const x of s.sets)
      if (x.exercise_id === id && x.completed && x.load_kg !== null && x.load_kg > 0 && x.reps)
        top = Math.max(top ?? 0, e1rm(x.load_kg, x.reps))
    return top
  }
  return ids.flatMap((id) => {
    const values = ordered.map((s) => best(s, id)).filter((v): v is number => v !== null)
    const first = values[0]
    const latest = values.at(-1)
    return first === undefined || latest === undefined
      ? []
      : [{ exercise_id: id, name: nameOf(id), first, latest }]
  })
}

/** "+5.6 %" in teal, "flat" in soft violet, a drop in amber. */
function ChangeChip({ first, latest }: { first: number; latest: number }) {
  const pct = first > 0 ? ((latest - first) / first) * 100 : 0
  const flat = Math.abs(pct) < FLAT_PCT
  return (
    <StatusChip
      tone={flat ? 'neutral' : pct > 0 ? 'success' : 'warning'}
      label={flat ? 'flat' : `${formatSigned(pct, 1)} %`}
    />
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
  const rows = useMemo(
    () =>
      strengthRows(
        sessions,
        options.slice(0, STRENGTH_ROWS).map((o) => o.exercise_id),
        (id) => index.byId.get(id)?.name ?? 'Exercise',
      ),
    [sessions, options, index.byId],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const id =
    picked && options.some((o) => o.exercise_id === picked) ? picked : (options[0]?.exercise_id ?? null)
  const history = useApiQuery(
    endpoints.training.exerciseHistory,
    { params: { id: id ?? NO_EXERCISE } },
    { enabled: id !== null, retry: false },
  )
  const points = useMemo(() => (history.data ? strengthSessions(history.data) : []), [history.data])
  return (
    <ChartCard
      fill
      title="Strength"
      subtitle="Estimated 1RM, first session → latest"
      empty={
        options.length === 0
          ? {
              title: 'No loaded sets yet',
              body: 'Each exercise gets its load and e1RM line once sets are logged.',
            }
          : null
      }
      caption="Double progression: when every set hits the top of its rep range, the next session adds load (2.5 kg on dumbbells and upper-body free weights, 5 kg on machines and the lower body)."
      testId="dashboard-strength"
    >
      {rows.length > 0 && (
        <Box
          component="ul"
          aria-label="Estimated one-rep max, first session to latest"
          sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)' }}
        >
          {rows.map((r) => (
            <Box
              component="li"
              key={r.exercise_id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                columnGap: '10px',
                rowGap: '2px',
                py: '10px',
                fontSize: tokens.font.size.emphasis,
                '& + &': { borderTop: `1px solid ${tokens.ink.hairline}` },
              }}
            >
              <Box
                sx={{
                  flex: '1 1 120px',
                  minWidth: 0,
                  fontWeight: tokens.font.weight.label,
                  color: tokens.ink.text,
                }}
              >
                {r.name}
              </Box>
              <Box
                sx={{ color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
              >
                {formatNumber(r.first)} → {formatNumber(r.latest)} kg
              </Box>
              <ChangeChip first={r.first} latest={r.latest} />
            </Box>
          ))}
        </Box>
      )}
      {/* One exercise's history as a line, picked from the most-used ones (no floating label: the select names
          itself "Exercise" and shows the exercise it draws). */}
      {id && (
        <Box sx={{ mt: '14px', pt: '14px', borderTop: `1px solid ${tokens.ink.hairline}` }}>
          <TextField
            select
            size="small"
            value={id}
            onChange={(e) => setPicked(e.target.value)}
            sx={pickerSx}
            slotProps={{ htmlInput: { 'aria-label': 'Exercise', 'data-testid': 'strength-exercise' } }}
          >
            {options.map((o) => (
              <MenuItem key={o.exercise_id} value={o.exercise_id}>
                {o.name}
              </MenuItem>
            ))}
          </TextField>
          {history.data ? (
            points.length > 0 ? (
              <StrengthChart sessions={points} height={STRENGTH_HEIGHT} />
            ) : (
              <EmptyHistory loading={false} />
            )
          ) : (
            <EmptyHistory loading={history.isPending} />
          )}
        </Box>
      )}
    </ChartCard>
  )
}

/** 1d's soft picker in a card (a soft violet button-like select, 34 px; 44 px on touch). */
const pickerSx = {
  mb: '10px',
  maxWidth: '100%',
  '& .MuiInputBase-root': {
    borderRadius: `${tokens.summit.radius.button - 2}px`,
    bgcolor: tokens.summit.surface.soft,
    color: tokens.summit.ink.deep,
    // A 44 px target on every pointer (finding #35: 34 px with a mouse was too small).
    minHeight: tokens.tapTarget,
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

/** Holds the strength chart's height while its per-exercise history is read. */
function EmptyHistory({ loading }: { loading: boolean }) {
  return (
    <Box
      sx={{
        height: STRENGTH_HEIGHT,
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${tokens.summit.radius.wellLarge}px`,
        bgcolor: tokens.ink.panel,
        color: tokens.ink.secondary,
        fontSize: tokens.font.size.small,
      }}
    >
      {loading ? 'Loading…' : 'No loaded sets for this exercise yet'}
    </Box>
  )
}
