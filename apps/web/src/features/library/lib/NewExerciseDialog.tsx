// Owns: adding one of Aaron's own exercises (SPEC §7, e.g. a gym-specific machine) — name, equipment (library values
// and his named machines), primary and secondary muscles by tap, level — sent as POST /api/exercises.
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import { endpoints } from '@fitness/shared/api'
import { Muscle } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { useApiMutation, useApiQuery } from '../../../api'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { problemText } from '../../quick-log'
import { equipmentLabel, LEVELS, LIBRARY_EQUIPMENT, sentence } from './labels'
import { useRefreshLibrary } from './useExercises'

type Role = 'primary' | 'secondary'

export interface NewExerciseDialogProps {
  onClose: () => void
  /** Called with the new id once the Worker stored it. */
  onCreated: (id: string) => void
}

export function NewExerciseDialog({ onClose, onCreated }: NewExerciseDialogProps) {
  const fullScreen = useMediaQuery((t: Theme) => t.breakpoints.down('sm'))
  const profile = useApiQuery(endpoints.training.getEquipment, {})
  const refresh = useRefreshLibrary()
  const create = useApiMutation(endpoints.training.createExercise)
  const [name, setName] = useState('')
  const [equipment, setEquipment] = useState('machine')
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('beginner')
  const [roles, setRoles] = useState<Partial<Record<Muscle, Role>>>({})

  const options = useMemo(() => {
    const named = (profile.data ?? []).map((i) => i.equipment).filter((e) => !LIBRARY_EQUIPMENT.includes(e))
    return [...LIBRARY_EQUIPMENT.filter((e) => e !== 'body only'), ...named]
  }, [profile.data])

  const primary = Muscle.options.filter((m) => roles[m] === 'primary')
  const secondary = Muscle.options.filter((m) => roles[m] === 'secondary')
  const valid = name.trim().length > 0 && primary.length > 0

  // Tap cycles a muscle: off → primary → secondary → off.
  const cycle = (m: Muscle) =>
    setRoles((r) => ({ ...r, [m]: r[m] === undefined ? 'primary' : r[m] === 'primary' ? 'secondary' : undefined }))

  const submit = () => {
    const id = crypto.randomUUID()
    create.mutate(
      {
        body: {
          id,
          name: name.trim(),
          category: 'strength',
          equipment,
          level,
          primary_muscles: primary,
          secondary_muscles: secondary,
          instructions: [],
        },
      },
      {
        onSuccess: (outcome) => {
          refresh(outcome)
          onClose()
          if (outcome.status === 'saved') onCreated(id)
        },
      },
    )
  }

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="new-exercise-title">
      <DialogTitle id="new-exercise-title">New exercise</DialogTitle>
      <DialogContent>
        <Stack spacing={4} sx={{ pt: 1 }}>
          <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hammer Strength chest press" slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField select label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
            {options.map((o) => (
              <MenuItem key={o} value={o} sx={{ minHeight: 44 }}>
                {equipmentLabel(o)}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="Level" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
            {LEVELS.map((l) => (
              <MenuItem key={l} value={l} sx={{ minHeight: 44 }}>
                {sentence(l)}
              </MenuItem>
            ))}
          </TextField>
          <Box>
            <Box sx={{ fontSize: 14, fontWeight: 500, mb: 1 }}>Muscles</Box>
            <Box sx={{ fontSize: 13, color: 'text.secondary', mb: 2 }}>Tap once for primary, twice for secondary.</Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {Muscle.options.map((m) => (
                <Chip
                  key={m}
                  label={roles[m] ? `${MUSCLE_LABELS[m]} · ${roles[m] === 'primary' ? 'primary' : 'secondary'}` : MUSCLE_LABELS[m]}
                  color={roles[m] === 'primary' ? 'primary' : 'default'}
                  variant={roles[m] ? 'filled' : 'outlined'}
                  onClick={() => cycle(m)}
                  sx={{ height: 36 }}
                />
              ))}
            </Box>
          </Box>
          {create.error && <Alert severity="error">{problemText(create.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || create.isPending} onClick={submit}>
          Add exercise
        </Button>
      </DialogActions>
    </Dialog>
  )
}
