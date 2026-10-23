// Owns: the dialog that edits one number setting — a numeric field with its unit, checked as it is typed (the range in
// every message; Continue stays off while it is invalid), then, for a rail, a confirmation step that names the old and
// new value and reminds that rails are agreed with the doctor and dietitian. A calorie floor under the agreed 1,400
// kcal is Aaron's to set, but the step warns and needs a second, explicit confirm (a tick) before it saves. An Undo
// back to such a value reopens the dialog at that step, prefilled, so it never skips the confirm or the tick.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Alert from '@mui/material/Alert'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import { AGREED_CALORIE_FLOOR, type Settings } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { formatNumber } from '../../../components'
import { belowAgreedFloor, checkValue, formatValue, helpFor, parseWhole, type NumberField } from './fields'

interface EditDialogProps {
  field: NumberField
  settings: Settings
  saving: boolean
  error: string | null
  /** Opens at the rail confirm step with this value typed (an Undo that must not skip the confirm and the tick). */
  prefill?: number
  onSave: (value: number) => void
  onClose: () => void
}

export function EditDialog({ field, settings, saving, error, prefill, onSave, onClose }: EditDialogProps) {
  const current = settings[field.key]
  const [text, setText] = useState(String(prefill ?? current))
  const [confirming, setConfirming] = useState(prefill !== undefined && field.rail)
  const [agreed, setAgreed] = useState(false)
  const value = parseWhole(text)
  const problem = checkValue(field, text, settings)
  const unchanged = value === current
  const help = helpFor(field, settings)
  const belowFloor = belowAgreedFloor(field, value)
  const blocked = problem !== null || unchanged || (confirming && belowFloor && !agreed)

  const next = () => {
    if (blocked || value === null) return
    if (field.rail && !confirming) setConfirming(true)
    else onSave(value)
  }

  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="edit-setting-title"
    >
      <DialogTitle id="edit-setting-title">
        {confirming ? `Change the ${field.label.toLowerCase()}?` : field.label}
      </DialogTitle>
      <DialogContent>
        {confirming && value !== null ? (
          <Box data-testid="rail-confirm" sx={{ display: 'grid', gap: 3 }}>
            <Box
              sx={{
                fontSize: tokens.font.size.cardTitle,
                fontWeight: tokens.font.weight.heading,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <Box
                component="span"
                sx={{ color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}
              >
                {formatValue(field, current)}
              </Box>
              {' → '}
              {formatValue(field, value)}
            </Box>
            {belowFloor && (
              <Alert severity="warning" data-testid="floor-warning">
                Below the {formatNumber(AGREED_CALORIE_FLOOR)} kcal floor set with your doctor and dietitian.
              </Alert>
            )}
            <Box sx={{ fontSize: tokens.font.size.emphasis, lineHeight: 1.55, color: tokens.ink.text }}>
              This is a rail you set with your doctor and dietitian. Change it only if they agree. The AI and
              the Coach work inside it and can never change it.
            </Box>
            {belowFloor && (
              <FormControlLabel
                sx={{ minHeight: 44, mr: 0 }}
                control={
                  <Checkbox
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    data-testid="floor-agree"
                  />
                }
                label={`My doctor and dietitian agreed to ${formatValue(field, value)}`}
              />
            )}
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            {help && (
              <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5 }}>
                {help}
              </Box>
            )}
            <TextField
              label={field.label}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') next()
              }}
              autoFocus
              error={problem !== null}
              helperText={
                problem ??
                (belowFloor
                  ? `Below the ${formatNumber(AGREED_CALORIE_FLOOR)} kcal floor set with your doctor and dietitian`
                  : `Now ${formatValue(field, current)}`)
              }
              slotProps={{
                htmlInput: { inputMode: 'numeric', pattern: '[0-9]*', 'data-testid': `edit-${field.key}` },
                input: field.unit
                  ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> }
                  : undefined,
              }}
            />
          </Box>
        )}
        {error && (
          <Box role="alert" sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
            {error}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {confirming ? (
          <Button
            variant="outlined"
            onClick={() => {
              setConfirming(false)
              setAgreed(false)
            }}
            disabled={saving}
          >
            Back
          </Button>
        ) : (
          <Button variant="outlined" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
        )}
        <Button variant="contained" onClick={next} disabled={saving || blocked} data-testid="edit-save">
          {saving ? 'Saving…' : confirming ? 'Change rail' : field.rail ? 'Continue' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
