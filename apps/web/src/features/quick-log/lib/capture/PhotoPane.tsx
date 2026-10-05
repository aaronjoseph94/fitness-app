// Owns: the photo part of the meal form — thumbnails of the picked photos (remove, add more), an optional note for what
// a photo can't show, and "Analyse" (create the meal, upload, then the review takes over). Offline it says photos need
// a connection and points to describing the meal instead.
import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import { alpha } from '@mui/material/styles'
import { useState } from 'react'
import { useOnline } from '../../../../offline'
import { tokens } from '../../../../theme'
import { MAX_MEAL_PHOTOS, type PhotoMeal } from './photo-meal'

interface PhotoPaneProps {
  capture: PhotoMeal
  /** Open the camera / photo library (the form's hidden file input). */
  onPick: () => void
  onSend: (note: string) => void
  onDescribe: () => void
}

const THUMB = 96

export function PhotoPane({ capture, onPick, onSend, onDescribe }: PhotoPaneProps) {
  const online = useOnline()
  const [note, setNote] = useState('')
  const { photos, preparing, sending, error, created } = capture
  const busy = sending !== null || preparing > 0
  const canAdd = photos.length + preparing < MAX_MEAL_PHOTOS && !created

  return (
    <Box sx={{ display: 'grid', gap: 3 }} data-testid="photo-pane">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }} aria-label="Photos">
        {photos.map((photo, i) => (
          <Box key={photo.id} sx={{ position: 'relative', width: THUMB, height: THUMB }}>
            <Box
              component="img"
              src={photo.previewUrl}
              alt={`Photo ${i + 1}`}
              sx={{ width: THUMB, height: THUMB, objectFit: 'cover', borderRadius: `${tokens.radius.control}px`, border: `1px solid ${tokens.ink.border}` }}
            />
            {!created && (
              <IconButton
                aria-label={`Remove photo ${i + 1}`}
                onClick={() => capture.remove(photo.id)}
                disabled={busy}
                size="small"
                sx={{
                  position: 'absolute',
                  top: -10,
                  right: -10,
                  bgcolor: tokens.ink.card,
                  border: `1px solid ${tokens.ink.border}`,
                  '&:hover': { bgcolor: tokens.ink.card },
                }}
              >
                <CloseRounded fontSize="small" />
              </IconButton>
            )}
          </Box>
        ))}
        {Array.from({ length: preparing }, (_, i) => (
          <Box key={`preparing-${i}`} sx={{ width: THUMB, height: THUMB, display: 'grid', placeItems: 'center', borderRadius: `${tokens.radius.control}px`, bgcolor: tokens.ink.page }}>
            <CircularProgress size={20} aria-label="Preparing photo" />
          </Box>
        ))}
        {canAdd && (
          <ButtonBase
            onClick={onPick}
            disabled={busy}
            aria-label={photos.length === 0 ? 'Take or choose a photo' : 'Add another photo'}
            sx={{
              width: THUMB,
              height: THUMB,
              borderRadius: `${tokens.radius.control}px`,
              border: `1px dashed ${tokens.ink.border}`,
              color: tokens.ink.secondary,
              display: 'grid',
              placeItems: 'center',
              gap: 0.5,
              fontSize: 12,
              '&:hover': { bgcolor: alpha(tokens.ink.text, 0.03) },
            }}
          >
            <AddAPhotoOutlined />
            {photos.length === 0 ? 'Photo' : 'Add'}
          </ButtonBase>
        )}
      </Box>

      <TextField
        label="Anything the photo can't show? (optional)"
        placeholder="cooked in butter, 2 tbsp dressing"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy || created}
        multiline
        maxRows={3}
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />

      <Box sx={{ fontSize: 13, color: 'text.secondary', lineHeight: 1.5 }}>
        Photos are shrunk to 1,024 px and their location data is removed on this phone before they're sent.
      </Box>

      {!online && (
        <Box role="status" sx={{ fontSize: 14, color: 'text.secondary' }}>
          You're offline. Photos need a connection to be analysed;{' '}
          <Button variant="text" size="small" onClick={onDescribe} sx={{ minHeight: 0, p: 0, verticalAlign: 'baseline' }}>
            describe the meal
          </Button>{' '}
          instead and it's analysed when you're back.
        </Box>
      )}
      {error && (
        <Box role="alert" sx={{ color: 'error.main', fontSize: 14 }}>
          {error}
        </Box>
      )}

      <Button
        variant="contained"
        size="large"
        disabled={!online || busy || photos.length === 0}
        onClick={() => onSend(note)}
        data-testid="meal-send-photos"
      >
        {sending
          ? sending.done < sending.total
            ? `Uploading ${sending.done + 1} of ${sending.total}…`
            : 'Starting analysis…'
          : created
            ? 'Try the upload again'
            : photos.length > 1
              ? `Analyse ${photos.length} photos`
              : 'Analyse photo'}
      </Button>
    </Box>
  )
}
