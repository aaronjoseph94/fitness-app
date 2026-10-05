// Owns: "Hide forever" (SPEC §7) — ask why (one tap on a common reason, or type one), then POST /api/exclusions for
// this exercise. The cached library marks it hidden at once, so it leaves the picker even while the write is queued.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import type { Exercise } from '@fitness/shared/schemas'
import { useState } from 'react'
import { problemText, useApiMutation } from '../../../api'
import { useMarkHidden, useRefreshLibrary } from './useExercises'
import { tokens } from '../../../theme'

const REASONS = ['Hurts / aggravates an injury', "My gym doesn't have it", "Don't like it", 'Floor exercise', 'Too technical'] as const

export interface HideForeverDialogProps {
  exercise: Pick<Exercise, 'id' | 'name'>
  onClose: () => void
  onHidden: () => void
}

export function HideForeverDialog({ exercise, onClose, onHidden }: HideForeverDialogProps) {
  const [reason, setReason] = useState('')
  const markHidden = useMarkHidden()
  const refresh = useRefreshLibrary()
  const hide = useApiMutation(endpoints.training.createExclusion)
  const text = reason.trim()

  const submit = () => {
    if (!text) return
    hide.mutate(
      { body: { id: crypto.randomUUID(), exercise_id: exercise.id, reason: text } },
      {
        onSuccess: (outcome) => {
          markHidden(exercise.id)
          refresh(outcome)
          onHidden()
        },
      },
    )
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" sx={{ zIndex: (t) => t.zIndex.modal + 2 }} aria-labelledby="hide-forever-title">
      <DialogTitle id="hide-forever-title">Hide {exercise.name}?</DialogTitle>
      <DialogContent>
        <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', mb: 3 }}>
          It leaves the library, the picker and every AI workout. The reason is kept with the exclusion.
        </Box>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3 }}>
          {REASONS.map((r) => (
            <Chip key={r} label={r} onClick={() => setReason(r)} color={reason === r ? 'primary' : 'default'} variant={reason === r ? 'filled' : 'outlined'} />
          ))}
        </Box>
        <TextField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
          placeholder="e.g. left shoulder"
        />
        {hide.error && (
          <Alert severity="error" sx={{ mt: 3 }}>
            {problemText(hide.error)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={!text || hide.isPending} onClick={submit} data-testid="hide-confirm">
          Hide forever
        </Button>
      </DialogActions>
    </Dialog>
  )
}
