// Owns: the dialog that picks training days — seven day segments in week order (the kit's segmented control, 44 px on
// touch), saved together.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import type { Weekday } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { formatDays, WEEKDAYS } from './fields'

interface TrainingDaysDialogProps {
  days: readonly Weekday[]
  saving: boolean
  error: string | null
  onSave: (days: Weekday[]) => void
  onClose: () => void
}

export function TrainingDaysDialog({ days, saving, error, onSave, onClose }: TrainingDaysDialogProps) {
  const [picked, setPicked] = useState<Weekday[]>([...days])
  const ordered = WEEKDAYS.filter((d) => picked.includes(d.key)).map((d) => d.key)
  const unchanged = ordered.join() === WEEKDAYS.filter((d) => days.includes(d.key)).map((d) => d.key).join()
  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="training-days-title">
      <DialogTitle id="training-days-title">Training days</DialogTitle>
      <DialogContent>
        <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5, mb: 3 }}>
          The days the plan puts a session on. The default split is upper / lower / upper / lower, Mon–Thu.
        </Box>
        <ToggleButtonGroup
          value={picked}
          onChange={(_, next: Weekday[]) => setPicked(next)}
          aria-label="Training days"
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
            // Several days are on at once, so a picked day is dark (the kit's dark segment, like the row's day tiles)
            // rather than the white-on-track that only marks the one choice of a single-select.
            '& .MuiToggleButton-root': {
              '&.Mui-selected, &.Mui-selected:hover': { bgcolor: tokens.dark.bg, color: tokens.dark.text, boxShadow: 'none' },
            },
          }}
        >
          {WEEKDAYS.map((d) => (
            <ToggleButton key={d.key} value={d.key} aria-label={d.long}>
              {d.short.slice(0, 2)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>
          {ordered.length} {ordered.length === 1 ? 'day' : 'days'}: {formatDays(ordered)}
        </Box>
        {error && (
          <Box role="alert" sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
            {error}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => onSave(ordered)} disabled={saving || unchanged}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
