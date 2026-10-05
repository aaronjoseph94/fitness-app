// Owns: the exercise library page (/train/library) — search and filters kept in the URL (so Back returns to the same
// list), allowed exercises by default with "Show hidden", tap for the detail sheet, links to the equipment profile and
// "New exercise" — and the deep-linkable exercise page (/train/library/:id).
import AddRounded from '@mui/icons-material/AddRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ExerciseCategory, Muscle } from '@fitness/shared/schemas'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router'
import { EmptyState, LoadProblem } from '../../../components'
import { ExerciseDetail } from './ExerciseDetail'
import { ExerciseDetailSheet } from './ExerciseDetailSheet'
import { ExerciseList } from './ExerciseList'
import { equipmentValues, filterExercises, type ExerciseFilter } from './filter'
import { FilterBar } from './FilterBar'
import { LEVELS } from './labels'
import { NewExerciseDialog } from './NewExerciseDialog'
import { useExerciseIndex } from './useExercises'

function readFilter(params: URLSearchParams): ExerciseFilter {
  const muscle = Muscle.safeParse(params.get('muscle'))
  const category = ExerciseCategory.safeParse(params.get('category'))
  const level = params.get('level') as ExerciseFilter['level'] | null
  return {
    muscle: muscle.success ? muscle.data : undefined,
    equipment: params.get('equipment') ?? undefined,
    category: category.success ? category.data : undefined,
    level: level && (LEVELS as readonly string[]).includes(level) ? level : undefined,
  }
}

export function LibraryPage() {
  const index = useExerciseIndex()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const includeHidden = params.get('hidden') === '1'
  const filter = useMemo(() => readFilter(params), [params])
  const query = useDeferredValue(q)

  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined || v === '') next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  const equipment = useMemo(() => equipmentValues(index.all), [index.all])
  const results = useMemo(() => filterExercises(index.all, { ...filter, q: query, includeHidden }), [index.all, filter, query, includeHidden])

  return (
    <Stack spacing={4} data-testid="library-page">
      <Box sx={{ display: 'flex', gap: 2 }}>
        <Button component={RouterLink} to="/train/equipment" variant="outlined" startIcon={<TuneRounded />} sx={{ flex: 1 }}>
          Equipment
        </Button>
        <Button variant="outlined" startIcon={<AddRounded />} onClick={() => setCreating(true)} sx={{ flex: 1 }}>
          New exercise
        </Button>
      </Box>
      <FilterBar
        q={q}
        onQ={(next) => update({ q: next })}
        filter={filter}
        onFilter={(f) => update({ muscle: f.muscle, equipment: f.equipment, category: f.category, level: f.level })}
        equipment={equipment}
        extra={
          <Chip
            label="Show hidden"
            variant={includeHidden ? 'filled' : 'outlined'}
            color={includeHidden ? 'warning' : 'default'}
            onClick={() => update({ hidden: includeHidden ? undefined : '1' })}
          />
        }
      />
      <Typography variant="label" component="p" sx={{ m: 0 }}>
        {index.isLoading ? 'Loading…' : `${results.length} of ${includeHidden ? index.all.length : index.allowed.length} ${includeHidden ? 'exercises' : 'allowed exercises'}`}
      </Typography>
      {index.isLoading ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
          <CircularProgress aria-label="Loading exercises" />
        </Box>
      ) : index.error && index.all.length === 0 ? (
        <LoadProblem what="The exercise library" error={index.error} onRetry={index.refetch} />
      ) : results.length === 0 ? (
        <EmptyState illustration="training" title="No exercise matches" body="Try fewer words or clear a filter." />
      ) : (
        <ExerciseList exercises={results} onSelect={(e) => setOpen(e.id)} />
      )}
      <ExerciseDetailSheet exerciseId={open} open={open !== null} onClose={() => setOpen(null)} />
      {creating && <NewExerciseDialog onClose={() => setCreating(false)} onCreated={(id) => setOpen(id)} />}
    </Stack>
  )
}

/** /train/library/:id — one exercise as a page (deep links, e.g. from a session or Ask AI). */
export function ExercisePage() {
  const { id } = useParams()
  const index = useExerciseIndex()
  const exercise = id ? index.byId.get(id) : undefined
  if (index.isLoading)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
        <CircularProgress aria-label="Loading exercise" />
      </Box>
    )
  if (!exercise)
    return index.error && index.all.length === 0 ? (
      <LoadProblem what="The exercise" error={index.error} onRetry={index.refetch} />
    ) : (
      <EmptyState title="Exercise not found" body="It may have been removed from the library." action={<Button component={RouterLink} to="/train/library">Open the library</Button>} />
    )
  return (
    <Stack spacing={4} data-testid="exercise-page">
      <Typography variant="h2" component="h1">
        {exercise.name}
      </Typography>
      <ExerciseDetail exercise={exercise} />
    </Stack>
  )
}
