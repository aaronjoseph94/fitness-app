// Owns: the dialog that edits one profile field — the control for its kind (a number with its unit, a date picker, a
// short choice, a searchable time-zone list, or free text), the bounds/schema check as it is typed (Save stays off
// while it is invalid; the goal is checked against the start weight and back), and the same inline error style and
// 44 px targets as the rest of the settings dialogs. Nothing here is read-only: every field it is given is Aaron's to change.
import Autocomplete from '@mui/material/Autocomplete'
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
import { useMemo, useState } from 'react'
import { tokens } from '../../../theme'
import {
  checkProfileValue,
  formatProfileValue,
  parseProfileInput,
  zoneOptions,
  type ProfileField,
} from './fields'

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
  const value = parseProfileInput(field, text)
  const problem = checkProfileValue(field, value, profile)
  const unchanged =
    stored === null || stored === undefined ? value === null : String(stored) === String(value)
  // The list opens on typing or the chevron, not on focus: Escape then closes the dialog like every other editor.
  const zones = useMemo(() => (field.kind === 'zone' ? zoneOptions() : []), [field.kind])

  const save = () => {
    if (problem || unchanged) return
    onSave(value)
  }
  const helperText = problem ?? `Now ${formatProfileValue(field, profile)}`

  return (
    <Dialog
      open
      onClose={saving ? undefined : onClose}
      fullWidth
      maxWidth="xs"
      aria-labelledby="edit-profile-title"
    >
      <DialogTitle id="edit-profile-title">{field.label}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
          {field.help && (
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5 }}>
              {field.help}
            </Box>
          )}
          {field.kind === 'choice' ? (
            <TextField
              select
              label={field.label}
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              slotProps={{ htmlInput: { 'data-testid': `profile-${field.key}-input` } }}
            >
              {(field.options ?? []).map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
          ) : field.kind === 'zone' ? (
            <Autocomplete
              options={zones}
              value={zones.find((option) => option.zone === text) ?? null}
              onChange={(_e, option) => setText(option?.zone ?? '')}
              getOptionLabel={(option) => option.label}
              isOptionEqualToValue={(option, selected) => option.zone === selected.zone}
              renderOption={({ key, ...props }, option) => (
                <Box component="li" key={key} {...props} sx={{ minHeight: 44 }}>
                  <Box>
                    <Box>{option.label}</Box>
                    <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>
                      {option.friendly}
                    </Box>
                  </Box>
                </Box>
              )}
              autoHighlight
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={field.label}
                  autoFocus
                  error={problem !== null}
                  helperText={helperText}
                  slotProps={{
                    ...params.slotProps,
                    htmlInput: { ...params.slotProps.htmlInput, 'data-testid': `profile-${field.key}-input` },
                  }}
                />
              )}
            />
          ) : (
            <TextField
              label={field.label}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') save()
              }}
              autoFocus
              type={field.kind === 'date' ? 'date' : 'text'}
              error={problem !== null}
              helperText={helperText}
              slotProps={{
                inputLabel: field.kind === 'date' ? { shrink: true } : undefined,
                htmlInput: {
                  ...(field.kind === 'number' ? { inputMode: 'decimal', pattern: '[0-9.,]*' } : {}),
                  'data-testid': `profile-${field.key}-input`,
                },
                input: field.unit
                  ? { endAdornment: <InputAdornment position="end">{field.unit}</InputAdornment> }
                  : undefined,
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
      <DialogActions>
        <Button variant="outlined" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          disabled={saving || unchanged || problem !== null}
          data-testid={`profile-${field.key}-save`}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
