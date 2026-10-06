// Owns: the dialog that edits one profile field — the control for its kind (a number with its unit, a date picker, a
// short choice, or free text), the bounds/schema check, and the same inline error style and 44 px targets as the rest
// of the settings dialogs. Nothing here is read-only: every field it is given is Aaron's to change.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import InputAdornment from '@mui/material/InputAdornment'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import type { Profile } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { checkProfileValue, formatProfileValue, parseProfileInput, type ProfileField } from './fields'

/** What a saved profile field carries: a number, a string, or null to clear a nullable one. */
export type ProfileValue = string | number | null

interface ProfileDialogProps {
  field: ProfileField
  profile: Profile
  saving: boolean
  error: string | null
  onSave: (value: ProfileValue) => void
  onClose: () => void
}

/** The control's starting text for the stored value. */
function initialText(field: ProfileField, profile: Profile): string {
  const value = profile[field.key]
  return value === null || value === undefined ? '' : String(value)
}

export function ProfileDialog({ field, profile, saving, error, onSave, onClose }: ProfileDialogProps) {
  const stored = profile[field.key]
  const [text, setText] = useState(() => initialText(field, profile))
  const [touched, setTouched] = useState(false)
  const value = parseProfileInput(field, text)
  const problem = checkProfileValue(field, value)
  const unchanged = stored === null || stored === undefined ? value === null : String(stored) === String(value)

  const save = () => {
    setTouched(true)
    if (problem || unchanged) return
    onSave(value)
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="edit-profile-title">
      <DialogTitle id="edit-profile-title">{field.label}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          {field.help && <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5 }}>{field.help}</Box>}
          {field.kind === 'choice' ? (
            <TextField
              select
              label={field.label}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setTouched(true)
              }}
              autoFocus
              slotProps={{ htmlInput: { 'data-testid': `profile-${field.key}-input` } }}
            >
              {(field.options ?? []).map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label={field.label}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              autoFocus
              type={field.kind === 'date' ? 'date' : 'text'}
              error={touched && problem !== null}
              helperText={touched && problem ? problem : `Now ${formatProfileValue(field, profile)}`}
              slotProps={{
                inputLabel: field.kind === 'date' ? { shrink: true } : undefined,
                htmlInput: {
                  ...(field.kind === 'number' ? { inputMode: 'decimal', pattern: '[0-9.,]*' } : {}),
                  'data-testid': `profile-${field.key}-input`,
                },
                input: field.unit ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> } : undefined,
              }}
            />
          )}
        </Box>
        {error && (
          <Box role="alert" sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
            {error}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || unchanged || (touched && problem !== null)}
          data-testid={`profile-${field.key}-save`}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
