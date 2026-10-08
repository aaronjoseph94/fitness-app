// Owns: the exercise library page (/train/library) — the 2a title row (h1, "N allowed of M", Equipment and New exercise),
// the search-and-filter toolbar with the result count, and the list as a card of rows; search and filters kept in the
// URL (so Back returns to the same list), allowed exercises by default with "Show hidden", tap for the detail sheet —
// and the deep-linkable exercise page (/train/library/:id) under its own h1.
import AddRounded from '@mui/icons-material/AddRounded'
import TuneRounded from '@mui/icons-material/TuneRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Stack from '@mui/material/Stack'
import { ExerciseCategory, Muscle } from '@fitness/shared/schemas'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link as RouterLink, useParams, useSearchParams } from 'react-router'
import { EmptyState, LoadProblem, PageHeader, Panel, Reveal, staggerDelay } from '../../../components'
import { tokens } from '../../../theme'
import { ExerciseDetail } from './ExerciseDetail'
import { ExerciseDetailSheet } from './ExerciseDetailSheet'
import { ExerciseList, musclesLine } from './ExerciseList'
import { equipmentValues, filterExercises, type ExerciseFilter } from './filter'
import { FILTER_CHIP, FilterBar } from './FilterBar'
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

  const loaded = !index.isLoading && !index.paused && index.all.length > 0
  return (
    <Stack spacing={5} data-testid="library-page">
      <PageHeader
        title="Exercise library"
        subtitle={loaded ? `${index.allowed.length} allowed of ${index.all.length} · the picker and the AI use only the allowed set` : 'Machines and free weights at your gym'}
        action={
          <>
            <Button component={RouterLink} to="/train/equipment" variant="outlined" startIcon={<TuneRounded />}>
              Equipment
            </Button>
            <Button variant="outlined" startIcon={<AddRounded />} onClick={() => setCreating(true)}>
              New exercise
            </Button>
          </>
        }
      />
      {/* 2a's entrance: after the title row, the toolbar and then the list rise in, a section's stagger apart. */}
      <Reveal delay={staggerDelay(1, tokens.motion.stagger.section)}>
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
              sx={FILTER_CHIP}
            />
          }
        />
        <Box component="p" sx={{ m: 0, mt: 3, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.muted }}>
          {index.isLoading ? 'Loading…' : index.paused ? 'Offline' : `${results.length} of ${includeHidden ? index.all.length : index.allowed.length} ${includeHidden ? 'exercises' : 'allowed exercises'}`}
        </Box>
      </Reveal>
      <Reveal delay={staggerDelay(2, tokens.motion.stagger.section)}>
        {index.isLoading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
            <CircularProgress aria-label="Loading exercises" />
          </Box>
        ) : index.error && index.all.length === 0 ? (
          <LoadProblem what="The exercise library" error={index.error} onRetry={index.refetch} />
        ) : index.paused ? (
          <EmptyState title="Not loaded yet" body="The library isn't on this phone yet — connect once to load it." />
        ) : results.length === 0 ? (
          <EmptyState title="No exercise matches" body="Try fewer words or clear a filter." />
        ) : (
          <Panel padding="none" ariaLabel="Exercises" component="section">
            <ExerciseList exercises={results} onSelect={(e) => setOpen(e.id)} />
          </Panel>
        )}
      </Reveal>
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
  // Until the exercise is there (loading, a failed read, not found) the title row still stands, as "Exercise"; it is
  // the same first element either way, so it rises in once.
  if (!exercise)
    return (
      <Stack spacing={5}>
        <PageHeader title="Exercise" />
        {index.isLoading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
            <CircularProgress aria-label="Loading exercise" />
          </Box>
        ) : index.error && index.all.length === 0 ? (
          <LoadProblem what="The exercise" error={index.error} onRetry={index.refetch} />
        ) : index.paused ? (
          <EmptyState title="Not loaded yet" body="The library isn't on this phone yet — connect once to load it." />
        ) : (
          <EmptyState title="Exercise not found" body="It may have been removed from the library." action={<Button component={RouterLink} to="/train/library" variant="outlined">Open the library</Button>} />
        )}
      </Stack>
    )
  return (
    <Stack spacing={5} data-testid="exercise-page">
      <PageHeader title={exercise.name} subtitle={musclesLine(exercise)} />
      <ExerciseDetail exercise={exercise} headingComponent="h2" />
    </Stack>
  )
}
