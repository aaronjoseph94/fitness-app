// Owns: the Apple Watch manual route on Today (SPEC §8 route 1) — one small form for a day's steps and the hours asleep
// the night before (sleep date = wake date), posted to /api/steps and /api/sleep with client ids so a queued entry
// replays once. Either field may be left empty.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import type { LocalDate } from '@fitness/shared/schemas'
import { useState } from 'react'
import { useApiMutation } from '../../../api'
import { tokens } from '../../../theme'

const STALE = [endpoints.day.get, endpoints.day.range] as const

interface HealthDialogProps {
  open: boolean
  date: LocalDate
  onClose: () => void
  /** Called with 'saved' or 'queued' after both writes went through. */
  onDone: (status: 'saved' | 'queued') => void
}

export function HealthDialog({ open, date, onClose, onDone }: HealthDialogProps) {
  const [day, setDay] = useState(date)
  const [steps, setSteps] = useState('')
  const [hours, setHours] = useState('')
  const [error, setError] = useState<string | null>(null)
  const stepsWrite = useApiMutation(endpoints.health.createSteps, { invalidates: STALE })
  const sleepWrite = useApiMutation(endpoints.health.createSleep, { invalidates: STALE })
  const busy = stepsWrite.isPending || sleepWrite.isPending

  const stepsValue = steps.trim() === '' ? null : Number(steps.replace(/[\s,]/g, ''))
  const hoursValue = hours.trim() === '' ? null : Number(hours.replace(',', '.'))
  const stepsInvalid = stepsValue !== null && (!Number.isInteger(stepsValue) || stepsValue < 0 || stepsValue > 200_000)
  const hoursInvalid = hoursValue !== null && (!Number.isFinite(hoursValue) || hoursValue <= 0 || hoursValue > 24)
  const canSave = !busy && (stepsValue !== null || hoursValue !== null) && !stepsInvalid && !hoursInvalid && day !== ''

  const reset = () => {
    setSteps('')
    setHours('')
    setError(null)
    setDay(date)
  }

  const save = async () => {
    setError(null)
    try {
      const outcomes = await Promise.all([
        stepsValue === null ? null : stepsWrite.mutateAsync({ body: { id: crypto.randomUUID(), date: day, steps: stepsValue } }),
        hoursValue === null
          ? null
          : sleepWrite.mutateAsync({ body: { id: crypto.randomUUID(), date: day, asleep_min: Math.round(hoursValue * 60) } }),
      ])
      onDone(outcomes.some((o) => o?.status === 'queued') ? 'queued' : 'saved')
      reset()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Try again.')
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="health-dialog-title">
      <DialogTitle id="health-dialog-title">Steps and sleep</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 4, pt: 1 }}>
          <Box sx={{ fontSize: 14, color: tokens.ink.secondary, lineHeight: 1.5 }}>
            From the Health app. Sleep is the night that ended on this date.
          </Box>
          <TextField
            label="Date"
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: date } }}
          />
          <TextField
            label="Steps"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            error={stepsInvalid}
            helperText={stepsInvalid ? 'A whole number up to 200,000' : ' '}
            autoFocus
            slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', 'data-testid': 'health-steps' } }}
          />
          <TextField
            label="Hours asleep"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            error={hoursInvalid}
            helperText={hoursInvalid ? 'Between 0 and 24 hours' : ' '}
            slotProps={{
              htmlInput: { inputMode: 'decimal', 'data-testid': 'health-sleep' },
              input: { endAdornment: <InputAdornment position="end">h</InputAdornment> },
            }}
          />
          {error && (
            <Box role="alert" sx={{ fontSize: 14, color: tokens.status.flag }}>
              {error}
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={() => void save()} disabled={!canSave}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
