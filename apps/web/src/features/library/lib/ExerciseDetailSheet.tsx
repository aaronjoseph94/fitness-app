// Owns: the exercise detail as a bottom sheet over any screen (library, picker, session logger) — the exercise from the
// cached library, its detail body, and an optional footer action (e.g. "Add" from the picker).
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { EmptyState } from '../../../components'
import { ExerciseDetail } from './ExerciseDetail'
import { Sheet } from './Sheet'
import { useExerciseIndex } from './useExercises'

export interface ExerciseDetailSheetProps {
  exerciseId: string | null
  open: boolean
  onClose: () => void
  /** A primary button in the sheet's footer. */
  action?: { label: string; onClick: () => void }
  /** Stack above another sheet. */
  nested?: boolean
}

export function ExerciseDetailSheet({ exerciseId, open, onClose, action, nested = false }: ExerciseDetailSheetProps) {
  const index = useExerciseIndex()
  const exercise = exerciseId ? index.byId.get(exerciseId) : undefined
  return (
    <Sheet
      open={open}
      onClose={onClose}
      nested={nested}
      title={exercise?.name ?? 'Exercise'}
      testId="exercise-detail-sheet"
      footer={
        action && exercise ? (
          <Button variant="contained" size="large" fullWidth onClick={action.onClick}>
            {action.label}
          </Button>
        ) : undefined
      }
    >
      <Box sx={{ pt: 2 }}>
        {exercise ? (
          <ExerciseDetail exercise={exercise} onHidden={onClose} />
        ) : index.isLoading ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 10 }}>
            <CircularProgress aria-label="Loading exercise" />
          </Box>
        ) : (
          <EmptyState compact title="Exercise not found" body="It may have been removed from the library." />
        )}
      </Box>
    </Sheet>
  )
}
