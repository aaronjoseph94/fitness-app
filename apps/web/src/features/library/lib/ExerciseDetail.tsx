// Owns: the body of an exercise's detail view (SPEC §7) — animated demo when matched, both step images, tags, the
// muscle map (primary at level 4, secondary at level 2), instructions, the YouTube form-video search, the strength chart
// with PRs and next session's suggestion from GET /api/history/exercises/:id, and "Hide forever". Shared by the
// detail sheet and the /train/library/:id page.
import BlockRounded from '@mui/icons-material/BlockRounded'
import OndemandVideoRounded from '@mui/icons-material/OndemandVideoRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { Exercise, ExerciseHistory, Muscle } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { useApiQuery } from '../../../api'
import { StrengthChart, type StrengthSession } from '../../../charts'
import { ChartCard, formatNumber, formatShortDate } from '../../../components'
import { MUSCLE_LABELS, MuscleMap, type MuscleLevel } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { HideForeverDialog } from './HideForeverDialog'
import { categoryLabel, equipmentLabel, sentence } from './labels'

/** Map levels for one exercise: primary muscles heavy (4), secondary moderate (2). */
export function exerciseLevels(e: Pick<Exercise, 'primary_muscles' | 'secondary_muscles'>): Partial<Record<Muscle, MuscleLevel>> {
  const levels: Partial<Record<Muscle, MuscleLevel>> = {}
  for (const m of e.secondary_muscles) levels[m] = 2
  for (const m of e.primary_muscles) levels[m] = 4
  return levels
}

/** One point per session with a loaded set, oldest first: top-set load, the reps done at it, best Epley e1RM. */
export function strengthSessions(history: ExerciseHistory): StrengthSession[] {
  const points: StrengthSession[] = []
  for (const entry of history.entries) {
    if (entry.top_load_kg === null) continue
    const atTop = entry.sets.filter((s) => s.load_kg === entry.top_load_kg && s.reps !== null)
    const reps = atTop.length ? Math.max(...atTop.map((s) => s.reps ?? 0)) : null
    points.push({ date: entry.date, load: entry.top_load_kg, reps, e1rm: entry.best_e1rm_kg ?? entry.top_load_kg })
  }
  return points.sort((a, b) => a.date.localeCompare(b.date))
}

function Media({ exercise }: { exercise: Exercise }) {
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set())
  const fail = (src: string) => setBroken((s) => new Set(s).add(src))
  const gif = exercise.gif_url && !broken.has(exercise.gif_url) ? exercise.gif_url : null
  const steps = exercise.image_paths.filter((p) => !broken.has(p)).slice(0, 2)
  if (!gif && steps.length === 0) return null
  const frame = {
    borderRadius: `${tokens.radius.control}px`,
    border: `1px solid ${tokens.ink.border}`,
    bgcolor: '#FFFFFF',
    width: '100%',
    display: 'block',
    objectFit: 'contain' as const,
  }
  return (
    <Stack spacing={2} data-testid="exercise-media">
      {gif && <Box component="img" src={gif} alt={`${exercise.name} demonstration`} onError={() => fail(gif)} sx={{ ...frame, aspectRatio: '1 / 1', maxHeight: 320 }} />}
      {steps.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, 1fr)`, gap: 2 }}>
          {steps.map((src, i) => (
            <Box key={src} sx={{ position: 'relative' }}>
              <Box component="img" src={src} alt={`${exercise.name}, step ${i + 1}`} loading="lazy" onError={() => fail(src)} sx={{ ...frame, aspectRatio: '4 / 3' }} />
              <Box
                sx={{
                  position: 'absolute',
                  left: 8,
                  top: 8,
                  px: 1.5,
                  borderRadius: tokens.radius.chip,
                  bgcolor: 'rgba(255,255,255,0.9)',
                  fontSize: 12,
                  fontWeight: tokens.font.weight.label,
                  color: tokens.ink.secondary,
                }}
              >
                {i === 0 ? 'Start' : 'Finish'}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Stack>
  )
}

function History({ exerciseId }: { exerciseId: string }) {
  const history = useApiQuery(endpoints.training.exerciseHistory, { params: { id: exerciseId } }, { retry: false })
  const points = useMemo(() => (history.data ? strengthSessions(history.data) : []), [history.data])
  if (!history.data || points.length === 0) return null
  const best = history.data.prs.find((p) => p.kind === 'best_e1rm')
  const next = history.data.next
  return (
    <ChartCard
      title="Strength"
      subtitle={`${points.length} session${points.length === 1 ? '' : 's'}${best ? ` · best e1RM ${formatNumber(best.e1rm_kg, 1)} kg (${formatShortDate(best.date)})` : ''}`}
      testId="exercise-strength"
    >
      <StrengthChart sessions={points} />
      {next && (
        <Box sx={{ mt: 3, fontSize: 14, color: tokens.ink.secondary }}>
          <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
            Next time:{' '}
          </Box>
          {next.load_kg !== null ? `${formatNumber(next.load_kg, 1)} kg · ` : ''}
          {next.reason}
        </Box>
      )}
    </ChartCard>
  )
}

function MuscleList({ label, muscles }: { label: string; muscles: readonly Muscle[] }) {
  if (muscles.length === 0) return null
  return (
    <Box sx={{ fontSize: 14 }}>
      <Box component="span" sx={{ color: tokens.ink.secondary }}>
        {label}:{' '}
      </Box>
      {muscles.map((m) => MUSCLE_LABELS[m]).join(', ')}
    </Box>
  )
}

export interface ExerciseDetailProps {
  exercise: Exercise
  /** Called after the exercise was hidden (e.g. close the sheet). */
  onHidden?: () => void
}

export function ExerciseDetail({ exercise, onHidden }: ExerciseDetailProps) {
  const [hiding, setHiding] = useState(false)
  const tags = [
    categoryLabel(exercise.category),
    equipmentLabel(exercise.equipment),
    sentence(exercise.level),
    exercise.mechanic && sentence(exercise.mechanic),
    exercise.force && sentence(exercise.force),
  ].filter((t): t is string => !!t)

  return (
    <Stack spacing={5} data-testid="exercise-detail">
      {!exercise.allowed && (
        <Alert severity="warning" variant="outlined">
          Hidden: outside your allowed exercise set (equipment profile or an exclusion). The AI never suggests it.
        </Alert>
      )}
      <Media exercise={exercise} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
        {tags.map((t) => (
          <Chip key={t} label={t} size="small" variant="outlined" />
        ))}
      </Box>

      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <MuscleMap levels={exerciseLevels(exercise)} size={280} title={`Muscles trained by ${exercise.name}`} />
        </Box>
        <Stack spacing={1} sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 13, color: tokens.ink.secondary }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: tokens.muscleMap.steps[3] }} /> Primary
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: tokens.muscleMap.steps[1], ml: 2 }} /> Secondary
          </Box>
          <MuscleList label="Primary" muscles={exercise.primary_muscles} />
          <MuscleList label="Secondary" muscles={exercise.secondary_muscles} />
        </Stack>
      </Box>

      <Button
        variant="outlined"
        size="large"
        startIcon={<OndemandVideoRounded />}
        href={exercise.video_search_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        Watch form videos
      </Button>

      {exercise.instructions.length > 0 && (
        <Box>
          <Box component="h3" sx={{ m: 0, mb: 2, fontSize: 16, fontWeight: tokens.font.weight.heading }}>
            How to
          </Box>
          <Box component="ol" sx={{ m: 0, pl: 5, '& li': { mb: 2, lineHeight: 1.5, fontSize: 15 } }}>
            {exercise.instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </Box>
        </Box>
      )}

      <History exerciseId={exercise.id} />

      {exercise.allowed && (
        <Button color="error" startIcon={<BlockRounded />} onClick={() => setHiding(true)} sx={{ alignSelf: 'flex-start' }} data-testid="hide-forever">
          Hide forever
        </Button>
      )}
      {hiding && (
        <HideForeverDialog
          exercise={exercise}
          onClose={() => setHiding(false)}
          onHidden={() => {
            setHiding(false)
            onHidden?.()
          }}
        />
      )}
    </Stack>
  )
}
