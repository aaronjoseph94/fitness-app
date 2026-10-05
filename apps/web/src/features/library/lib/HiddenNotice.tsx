// Owns: what a hidden exercise's detail view says and offers — why it is outside the allowed exercise set (the
// Worker's reason: an exclusion, the body-only rail, an equipment status), "Un-hide" (DELETE /api/exclusions/:id with
// the exercise's id, then the library refreshes), and the way to the equipment profile. The body-only rail has no
// un-hide; an equipment status is changed on the Equipment page, so after an un-hide the reason left (if any) shows.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { endpoints } from '@fitness/shared/api'
import type { ExerciseSummary } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { problemText, useApiMutation } from '../../../api'
import { tokens } from '../../../theme'
import { useRefreshLibrary } from './useExercises'

/** Library rule 3 (Worker): equipment 'body only', or none at all, is outside the allowed set whatever Aaron un-hides. */
const isRail = (e: Pick<ExerciseSummary, 'equipment'>) => (e.equipment ?? 'body only').toLowerCase() === 'body only'

export function HiddenNotice({ exercise }: { exercise: Pick<ExerciseSummary, 'id' | 'name' | 'equipment' | 'excluded_reason'> }) {
  const refresh = useRefreshLibrary()
  const unhide = useApiMutation(endpoints.training.deleteExclusion)
  const [queued, setQueued] = useState(false)
  const rail = isRail(exercise)

  return (
    <Alert severity="warning" variant="outlined" data-testid="hidden-notice">
      <Stack spacing={2}>
        <Box>
          Hidden: {exercise.excluded_reason ?? 'outside your allowed exercise set'}. The picker and the AI leave it out.
        </Box>
        {unhide.error && <Box sx={{ color: tokens.status.flag }}>{problemText(unhide.error)}</Box>}
        {queued && <Box>Un-hides when you&apos;re back online.</Box>}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {!rail && (
            <Button
              variant="outlined"
              color="inherit"
              disabled={unhide.isPending || queued}
              onClick={() =>
                unhide.mutate(
                  { params: { id: exercise.id } },
                  {
                    onSuccess: (outcome) => {
                      setQueued(outcome.status === 'queued')
                      refresh(outcome)
                    },
                  },
                )
              }
              data-testid="unhide"
            >
              Un-hide
            </Button>
          )}
          <Button component={RouterLink} to="/train/equipment" color="inherit">
            Equipment
          </Button>
        </Box>
      </Stack>
    </Alert>
  )
}
