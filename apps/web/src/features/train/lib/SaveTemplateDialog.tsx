// Owns: "Save as template" from the finish screen — name it, then POST /api/templates with the session's exercises
// (ticked sets, rep range, top load, rest, note); queued offline like any write. Reports the new template's id.
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import { useEffect, useState } from 'react'
import { problemText, useApiMutation } from '../../../api'
import { tokens } from '../../../theme'
import { asTemplateExercises, type LoggerSession } from './logger-model'

export interface SaveTemplateDialogProps {
  open: boolean
  session: LoggerSession
  defaultName: string
  onClose: () => void
  onSaved: (outcome: { templateId: string; queued: boolean }) => void
}

export function SaveTemplateDialog({
  open,
  session,
  defaultName,
  onClose,
  onSaved,
}: SaveTemplateDialogProps) {
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState<string | null>(null)
  const create = useApiMutation(endpoints.training.createTemplate, {
    invalidates: [endpoints.training.listTemplates],
  })
  const exercises = asTemplateExercises(session)

  useEffect(() => {
    if (open) {
      setName(defaultName)
      setError(null)
    }
  }, [open, defaultName])

  const save = async () => {
    const id = crypto.randomUUID()
    try {
      const outcome = await create.mutateAsync({
        body: { id, name: name.trim(), origin: 'custom', exercises },
      })
      onSaved({ templateId: id, queued: outcome.status === 'queued' })
    } catch (e) {
      setError(problemText(e))
    }
  }

  return (
    <Dialog open={open} onClose={() => !create.isPending && onClose()} fullWidth maxWidth="xs">
      <DialogTitle>Save as template</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{
            htmlInput: { maxLength: 100 },
            formHelperText: { sx: { color: error ? undefined : tokens.ink.secondary } },
          }}
          sx={{ mt: 2 }}
          error={error !== null}
          helperText={
            error ??
            (exercises.length
              ? `${exercises.length} exercise${exercises.length === 1 ? '' : 's'}, ${exercises.reduce((n, e) => n + e.sets, 0)} sets, with today's top loads as targets.`
              : 'Tick at least one set to save this session as a template.')
          }
        />
      </DialogContent>
      <DialogActions sx={{ px: 4, pb: 3 }}>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => void save()}
          disabled={create.isPending || !name.trim() || exercises.length === 0}
          data-testid="save-template"
        >
          {create.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
