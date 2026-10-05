// Owns: one photo opened full screen — the whole image, when it was taken, the day's trend weight, the nearest scan
// and the note — with "Compare" (opens the compare view with this photo first) and a confirmed delete.
import Close from '@mui/icons-material/Close'
import CompareOutlined from '@mui/icons-material/CompareOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { ProgressPhoto } from '@fitness/shared/schemas'
import { useState } from 'react'
import { formatNumber } from '../../../components'
import { theme, tokens } from '../../../theme'
import { POSE_LABEL, useRemovePhoto } from './data'
import { PhotoImage, TrendWeight } from './PhotoParts'
import { problemText } from '../../../api'

const takenAtFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Edmonton',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

interface PhotoViewerProps {
  photo: ProgressPhoto | null
  onClose: () => void
  onCompare: (photo: ProgressPhoto) => void
}

export function PhotoViewer({ photo, onClose, onCompare }: PhotoViewerProps) {
  const phone = useMediaQuery(theme.breakpoints.down('sm'))
  const remove = useRemovePhoto()
  const [confirming, setConfirming] = useState(false)
  const close = () => {
    setConfirming(false)
    remove.reset()
    onClose()
  }

  return (
    <Dialog open={photo !== null} onClose={close} fullScreen={phone} maxWidth="sm" fullWidth aria-label="Progress photo">
      {photo && (
        <Stack sx={{ height: '100%', pb: 'env(safe-area-inset-bottom, 0px)' }} data-testid="photo-viewer">
          <Stack direction="row" sx={{ alignItems: 'center', px: 2, pt: 'calc(8px + env(safe-area-inset-top, 0px))', pb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0, pl: 2 }}>
              <Box sx={{ fontWeight: tokens.font.weight.heading, fontSize: 17 }}>{POSE_LABEL[photo.pose]}</Box>
              <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>{takenAtFormat.format(new Date(photo.taken_at))}</Box>
            </Box>
            <IconButton aria-label="Close" onClick={close}>
              <Close />
            </IconButton>
          </Stack>
          <Box sx={{ flex: 1, minHeight: 0, px: 4, display: 'flex', justifyContent: 'center' }}>
            <Box sx={{ width: '100%', maxHeight: phone ? 'none' : '60vh', aspectRatio: '3 / 4', borderRadius: `${tokens.radius.card}px`, overflow: 'hidden' }}>
              <PhotoImage photo={photo} fit="contain" eager />
            </Box>
          </Box>
          <Stack spacing={1} sx={{ px: 5, pt: 3 }}>
            <Box sx={{ display: 'flex', gap: 3, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary }}>Trend weight</Box>
              {photo.weight_kg === null ? <Box sx={{ fontSize: tokens.font.size.emphasis }}>—</Box> : <TrendWeight kg={photo.weight_kg} size={17} />}
            </Box>
            <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.text }}>
              {photo.nearest_scan ? (
                <>
                  Nearest scan {photo.nearest_scan.date}
                  {photo.nearest_scan.body_fat_pct !== null && (
                    <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
                      {' '}
                      · {formatNumber(photo.nearest_scan.body_fat_pct, 1)} % body fat
                    </Box>
                  )}
                  {photo.nearest_scan.weight_kg !== null && ` · ${formatNumber(photo.nearest_scan.weight_kg, 1)} kg`}
                </>
              ) : (
                <Box component="span" sx={{ color: tokens.ink.secondary }}>
                  No confirmed scan yet
                </Box>
              )}
            </Box>
            {photo.note && <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.secondary }}>{photo.note}</Box>}
          </Stack>
          {remove.isError && (
            <Alert severity="warning" variant="outlined" sx={{ mx: 5, mt: 3 }}>
              Couldn't delete. {problemText(remove.error)}
            </Alert>
          )}
          <Stack direction="row" spacing={3} sx={{ px: 5, py: 4 }}>
            {confirming ? (
              <>
                <Button variant="outlined" onClick={() => setConfirming(false)} sx={{ flex: 1 }}>
                  Keep
                </Button>
                <Button
                  variant="contained"
                  color="error"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ params: { id: photo.id } }, { onSuccess: close })}
                  sx={{ flex: 1 }}
                >
                  Delete photo
                </Button>
              </>
            ) : (
              <>
                <Button variant="outlined" startIcon={<DeleteOutlined />} onClick={() => setConfirming(true)} sx={{ flex: 1 }}>
                  Delete
                </Button>
                <Button variant="contained" startIcon={<CompareOutlined />} onClick={() => onCompare(photo)} sx={{ flex: 1 }}>
                  Compare
                </Button>
              </>
            )}
          </Stack>
        </Stack>
      )}
    </Dialog>
  )
}
