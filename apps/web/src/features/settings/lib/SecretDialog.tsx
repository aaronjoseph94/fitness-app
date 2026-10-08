// Owns: the dialog for one secret — paste a key, or generate a token where the app is the issuer, then save; or remove
// what the app stored (asking first). Nothing is shown once it is saved: the Worker returns status, never a value, so a
// key exists on this screen only while it is being typed.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'
import TextField from '@mui/material/TextField'
import type { SecretStatus } from '@fitness/shared/schemas'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { checkSecret, generateToken, sourceLabel, type SecretField } from './secrets'

interface SecretDialogProps {
  field: SecretField
  status: SecretStatus
  saving: boolean
  error: string | null
  onSave: (value: string) => void
  onRemove: () => void
  onClose: () => void
}

export function SecretDialog({ field, status, saving, error, onSave, onRemove, onClose }: SecretDialogProps) {
  const [text, setText] = useState('')
  const [touched, setTouched] = useState(false)
  const [removing, setRemoving] = useState(false)
  const check = checkSecret(field, text)
  const canSave = text.trim().length > 0 && check.problem === null
  const stored = status.source === 'app'

  const next = () => {
    setTouched(true)
    if (canSave) onSave(text.trim())
  }

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="secret-title">
      <DialogTitle id="secret-title">{removing ? `Remove the ${field.label} key?` : field.label}</DialogTitle>
      <DialogContent>
        {removing ? (
          <Box data-testid="secret-remove-confirm" sx={{ fontSize: tokens.font.size.emphasis, lineHeight: 1.55 }}>
            The key stored in the app is deleted and no longer used. AI features that need it switch off. This does not
            touch a Worker secret with the same name — set one with <code>wrangler secret put</code> and it applies again.
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary, lineHeight: 1.5 }}>{field.help}</Box>
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.text }}>
              Now: <strong>{sourceLabel(status)}</strong>.{' '}
              {field.url !== '' && (
                <Link href={field.url} target="_blank" rel="noreferrer noopener">
                  {field.where}
                </Link>
              )}
              {field.url === '' && field.where}
            </Box>
            <TextField
              label={field.label}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') next()
              }}
              autoFocus
              error={touched && check.problem !== null}
              helperText={touched && (check.problem ?? check.warning) ? (check.problem ?? check.warning) : `Paste the value (at least 8 characters).`}
              slotProps={{
                htmlInput: {
                  autoComplete: 'off',
                  autoCapitalize: 'none',
                  autoCorrect: 'off',
                  spellCheck: false,
                  'data-testid': `secret-input-${field.name}`,
                },
              }}
            />
            {field.generated && (
              <Box>
                <Button
                  onClick={() => {
                    setText(generateToken())
                    setTouched(false)
                  }}
                  disabled={saving}
                  data-testid={`secret-generate-${field.name}`}
                >
                  Generate a token
                </Button>
              </Box>
            )}
          </Box>
        )}
        {error && (
          <Box role="alert" sx={{ mt: 3, fontSize: tokens.font.size.small, color: tokens.status.flag }}>
            {error}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {removing ? (
          <>
            <Button variant="outlined" onClick={() => setRemoving(false)} disabled={saving}>
              Keep it
            </Button>
            <Button variant="contained" onClick={onRemove} disabled={saving} data-testid="secret-remove">
              {saving ? 'Removing…' : 'Remove'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outlined" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            {stored && (
              <Button color="error" onClick={() => setRemoving(true)} disabled={saving} data-testid="secret-ask-remove">
                Remove
              </Button>
            )}
            <Button variant="contained" onClick={next} disabled={saving || text.trim().length === 0 || check.problem !== null} data-testid="secret-save">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
