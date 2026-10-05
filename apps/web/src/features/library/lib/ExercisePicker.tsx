// Owns: the exercise picker sheet (SPEC §7) — search and filter the library (allowed exercises only unless "Show
// hidden"), tap a row to pick, ⓘ to look at the exercise first. With `sameMuscleAs` it becomes the swap list: allowed
// exercises sharing a primary muscle with that exercise, closest first. With `keepOpen` it stays up for several picks.
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import type { ExerciseSummary, Muscle } from '@fitness/shared/schemas'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { EmptyState, LoadProblem } from '../../../components'
import { ExerciseDetailSheet } from './ExerciseDetailSheet'
import { ExerciseList } from './ExerciseList'
import { equipmentValues, filterExercises, sameMuscleCandidates, type ExerciseFilter } from './filter'
import { FilterBar } from './FilterBar'
import { Sheet } from './Sheet'
import { useExerciseIndex } from './useExercises'

export type { ExerciseFilter } from './filter'

export interface ExercisePickerProps {
  open: boolean
  onClose: () => void
  onPick: (exercise: ExerciseSummary) => void
  /** Filters set when the picker opens. */
  initialFilter?: { muscle?: Muscle; equipment?: string }
  /** Swap mode: only allowed exercises sharing a primary muscle with this exercise. */
  sameMuscleAs?: string
  /** Stay open after a pick (builder: add several in a row). Default false: a pick closes the picker. */
  keepOpen?: boolean
  /** Exercises already chosen, marked "Added". */
  pickedIds?: ReadonlySet<string>
  /** Sheet title. Default "Add exercise" ("Swap exercise" in swap mode). */
  title?: string
}

export function ExercisePicker({ open, onClose, onPick, initialFilter, sameMuscleAs, keepOpen = false, pickedIds, title }: ExercisePickerProps) {
  const index = useExerciseIndex()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<ExerciseFilter>({})
  const [includeHidden, setIncludeHidden] = useState(false)
  const [info, setInfo] = useState<string | null>(null)
  const [added, setAdded] = useState(0)
  const query = useDeferredValue(q)

  // Each opening starts from the caller's filters.
  const initialMuscle = initialFilter?.muscle
  const initialEquipment = initialFilter?.equipment
  useEffect(() => {
    if (!open) return
    setQ('')
    setFilter({ muscle: initialMuscle, equipment: initialEquipment })
    setIncludeHidden(false)
    setAdded(0)
  }, [open, initialMuscle, initialEquipment, sameMuscleAs])

  const target = sameMuscleAs ? index.byId.get(sameMuscleAs) : undefined
  const swap = sameMuscleAs !== undefined
  const equipment = useMemo(() => equipmentValues(index.allowed), [index.allowed])

  const results = useMemo(() => {
    if (swap) {
      if (!target) return []
      const pool = sameMuscleCandidates(index.all, target)
      const narrowed = filterExercises(pool, { ...filter, muscle: undefined, q: query })
      // Keep the closeness order unless a search re-ranks it.
      return query.trim() ? narrowed : pool.filter((e) => narrowed.includes(e))
    }
    return filterExercises(index.all, { ...filter, q: query, includeHidden })
  }, [swap, target, index.all, filter, query, includeHidden])

  const pick = (e: ExerciseSummary) => {
    onPick(e)
    if (keepOpen) setAdded((n) => n + 1)
    else onClose()
  }

  const heading = title ?? (swap ? 'Swap exercise' : 'Add exercise')
  const subtitle = swap
    ? target
      ? `Same primary muscle as ${target.name}`
      : undefined
    : `${results.length} ${includeHidden ? 'exercises' : 'allowed exercises'}`

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={heading}
        subtitle={subtitle}
        testId="exercise-picker"
        header={
          <FilterBar
            q={q}
            onQ={setQ}
            filter={filter}
            onFilter={setFilter}
            equipment={equipment}
            hide={swap ? ['muscle'] : []}
            extra={
              swap ? undefined : (
                <Chip
                  label="Show hidden"
                  variant={includeHidden ? 'filled' : 'outlined'}
                  color={includeHidden ? 'warning' : 'default'}
                  onClick={() => setIncludeHidden((v) => !v)}
                />
              )
            }
          />
        }
        footer={
          keepOpen ? (
            <Button variant="contained" fullWidth size="large" onClick={onClose} data-testid="picker-done">
              {added > 0 ? `Done · ${added} added` : 'Done'}
            </Button>
          ) : undefined
        }
      >
        {index.isLoading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
            <CircularProgress aria-label="Loading exercises" />
          </Box>
        ) : index.error && index.all.length === 0 ? (
          <LoadProblem what="The exercise library" error={index.error} onRetry={index.refetch} />
        ) : results.length === 0 ? (
          <EmptyState
            compact
            illustration="training"
            title={swap ? 'No other exercise for that muscle' : 'No exercise matches'}
            body={swap ? 'Your equipment profile and exclusions leave nothing else here.' : 'Try fewer words or clear a filter.'}
          />
        ) : (
          <ExerciseList
            exercises={results}
            onSelect={pick}
            pickedIds={pickedIds}
            trailing={(e) => (
              <IconButton aria-label={`About ${e.name}`} onClick={() => setInfo(e.id)}>
                <InfoOutlined />
              </IconButton>
            )}
          />
        )}
      </Sheet>
      {info && (
        <ExerciseDetailSheet
          exerciseId={info}
          open
          nested
          onClose={() => setInfo(null)}
          action={{
            label: swap ? 'Swap to this' : 'Add',
            onClick: () => {
              const e = index.byId.get(info)
              setInfo(null)
              if (e) pick(e)
            },
          }}
        />
      )}
    </>
  )
}
