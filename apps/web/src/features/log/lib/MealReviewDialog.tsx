// Owns: the Log tab's meal review dialog — full screen on a phone — around the quick-log MealReview (analysis progress,
// the editable item list and Confirm, then the day adjustment) for a meal that is analysing or waiting in review.
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import Snackbar from '@mui/material/Snackbar'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { Theme } from '@mui/material/styles'
import { useState } from 'react'
import { tokens } from '../../../theme'
import { clockOf, dateOf, MealReview, SLOT_LABEL, type LogNotice } from '../../quick-log'
import type { MealView } from './meals'

export function MealReviewDialog({ meal, onClose }: { meal: MealView; onClose: () => void }) {
  const fullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const [notice, setNotice] = useState<LogNotice | null>(null)
  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="meal-review-title" data-testid="meal-review-dialog">
      <DialogTitle id="meal-review-title" sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 2 }}>
        <Box sx={{ flex: 1 }}>
          Review {SLOT_LABEL[meal.slot].toLowerCase()}
          <Box component="span" sx={{ ml: 2, fontSize: 14, fontWeight: tokens.font.weight.body, color: 'text.secondary' }}>
            {clockOf(meal.eatenAt)}
          </Box>
        </Box>
        <IconButton aria-label="Close" onClick={onClose}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pb: `calc(${tokens.space(4)}px + env(safe-area-inset-bottom, 0px))` }}>
        <MealReview date={dateOf(meal.eatenAt)} mealId={meal.id} onClose={onClose} onLogged={setNotice} />
      </DialogContent>
      <Snackbar
        open={notice !== null}
        autoHideDuration={3500}
        onClose={(_, reason) => reason !== 'clickaway' && setNotice(null)}
        message={notice?.message}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
    </Dialog>
  )
}
