// Owns: adding one of Aaron's own exercises (SPEC §7, e.g. a gym-specific machine) — name, equipment (library values
// and his named machines), primary and secondary muscles by tap, level, and a photo (camera or gallery, downscaled and
// re-encoded on the phone so no EXIF leaves it) — sent as POST /api/exercises, then POST /api/exercises/:id/photo.
// Both go through the shared client and its offline queue, which replays them in order.
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
import AddAPhotoRounded from '@mui/icons-material/AddAPhotoRounded'
import { useEffect, useMemo, useState } from 'react'
import { problemText, useApiMutation, useApiQuery } from '../../../api'
import { MUSCLE_LABELS } from '../../../muscle-map'
import { equipmentLabel, LEVELS, LIBRARY_EQUIPMENT, sentence } from './labels'
import { preparePhoto, releasePhoto, type PreparedPhoto } from '../../quick-log'
import { useRefreshLibrary } from './useExercises'
import { tokens } from '../../../theme'

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
  const upload = useApiMutation(endpoints.training.uploadExercisePhoto)
  // One id per dialog: after a failed photo upload, "Add exercise" again replays the create (idempotent) and retries it.
  const [id] = useState(() => crypto.randomUUID())
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  useEffect(() => () => void (photo && releasePhoto(photo)), [photo])
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

  const pick = async (file: File | undefined) => {
    if (!file) return
    setPhotoError(null)
    try {
      setPhoto(await preparePhoto(file))
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "That photo couldn't be read.")
    }
  }

  const submit = () => {
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
        onSuccess: async (outcome) => {
          if (photo) {
            // Queued behind the create when offline; the photo replays after the exercise exists.
            const body = await photo.blob.arrayBuffer()
            const sent = await upload.mutateAsync({ params: { id }, query: { content_type: photo.contentType }, body }).then(
              () => true,
              () => false,
            )
            if (!sent) return // the error shows; the exercise is stored, so tapping again only retries the photo
          }
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
            <Box sx={{ fontSize: tokens.font.size.small, fontWeight: 500, mb: 1 }}>Muscles</Box>
            <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', mb: 2 }}>Tap once for primary, twice for secondary.</Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {Muscle.options.map((m) => (
                <Chip
                  key={m}
                  label={roles[m] ? `${MUSCLE_LABELS[m]} · ${roles[m] === 'primary' ? 'primary' : 'secondary'}` : MUSCLE_LABELS[m]}
                  color={roles[m] === 'primary' ? 'primary' : 'default'}
                  variant={roles[m] ? 'filled' : 'outlined'}
                  onClick={() => cycle(m)}
                />
              ))}
            </Box>
          </Box>
          <Box>
            <Box sx={{ fontSize: tokens.font.size.small, fontWeight: 500, mb: 1 }}>Photo</Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              {photo && (
                <Box
                  component="img"
                  src={photo.previewUrl}
                  alt="The machine"
                  sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: `${tokens.radius.control}px`, border: `1px solid ${tokens.ink.border}` }}
                />
              )}
              <Button component="label" variant="outlined" startIcon={<AddAPhotoRounded />} data-testid="new-exercise-photo">
                {photo ? 'Replace photo' : 'Add photo'}
                <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => void pick(e.target.files?.[0])} />
              </Button>
            </Box>
          </Box>
          {photoError && <Alert severity="warning">{photoError}</Alert>}
          {create.error && <Alert severity="error">{problemText(create.error)}</Alert>}
          {upload.error && <Alert severity="error">{problemText(upload.error)}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 6, pb: 4 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || create.isPending || upload.isPending} onClick={submit}>
          Add exercise
        </Button>
      </DialogActions>
    </Dialog>
  )
}
