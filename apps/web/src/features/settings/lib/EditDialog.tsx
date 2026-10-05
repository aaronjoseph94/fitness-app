// Owns: the dialog that edits one number setting — a numeric field with its unit and bounds check, then, for a rail, a
// confirmation step that names the old and new value and reminds that rails are agreed with the doctor and dietitian.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import type { Settings } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { checkValue, formatValue, parseWhole, type NumberField } from './fields'

interface EditDialogProps {
  field: NumberField
  settings: Settings
  saving: boolean
  error: string | null
  onSave: (value: number) => void
  onClose: () => void
}

export function EditDialog({ field, settings, saving, error, onSave, onClose }: EditDialogProps) {
  const current = settings[field.key]
  const [text, setText] = useState(String(current))
  const [touched, setTouched] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const value = parseWhole(text)
  const problem = checkValue(field, value, settings)
  const unchanged = value === current

  const next = () => {
    setTouched(true)
    if (problem || unchanged || value === null) return
    if (field.rail && !confirming) setConfirming(true)
    else onSave(value)
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="edit-setting-title">
      <DialogTitle id="edit-setting-title">{confirming ? `Change the ${field.label.toLowerCase()}?` : field.label}</DialogTitle>
      <DialogContent>
        {confirming && value !== null ? (
          <Box data-testid="rail-confirm" sx={{ display: 'grid', gap: 3 }}>
            <Box sx={{ fontSize: 18, fontWeight: tokens.font.weight.heading, fontVariantNumeric: 'tabular-nums' }}>
              <Box component="span" sx={{ color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>
                {formatValue(field, current)}
              </Box>
              {' → '}
              {formatValue(field, value)}
            </Box>
            <Box sx={{ fontSize: 15, lineHeight: 1.55, color: tokens.ink.text }}>
              This is a rail you set with your doctor and dietitian. Change it only if they agree. The AI and the Coach
              work inside it and can never change it.
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <Box sx={{ fontSize: 14, color: tokens.ink.secondary, lineHeight: 1.5 }}>{field.help}</Box>
            <TextField
              label={field.label}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') next()
              }}
              autoFocus
              error={touched && problem !== null}
              helperText={touched && problem ? problem : `Now ${formatValue(field, current)}`}
              slotProps={{
                htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', 'data-testid': `edit-${field.key}` },
                input: field.unit ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> } : undefined,
              }}
            />
          </Box>
        )}
        {error && (
          <Box role="alert" sx={{ mt: 3, fontSize: 14, color: tokens.status.flag }}>
            {error}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        {confirming ? (
          <Button onClick={() => setConfirming(false)} disabled={saving}>
            Back
          </Button>
        ) : (
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button variant="contained" onClick={next} disabled={saving || unchanged || (touched && problem !== null)} data-testid="edit-save">
          {saving ? 'Saving…' : confirming ? 'Change rail' : field.rail ? 'Continue' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
