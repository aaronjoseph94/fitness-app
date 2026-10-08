// Owns: deleting a confirmed scan (a wrong one would otherwise drive the milestones, the lean-loss guard and the next
// due date for good) — a confirm that says what goes with it, then back to the scans list. Needs a connection.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useNavigate } from 'react-router'
import { problemText } from '../../../api'
import { useOnline } from '../../../offline'
import { tokens } from '../../../theme'
import { useDeleteScan } from './hooks'

export function DeleteScanDialog({ scanId, date, onClose }: { scanId: string; date: string; onClose: () => void }) {
  const online = useOnline()
  const navigate = useNavigate()
  const remove = useDeleteScan()
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="delete-scan-title">
      <DialogTitle id="delete-scan-title">Delete the scan of {date}?</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Box sx={{ fontSize: tokens.font.size.body, color: tokens.ink.muted, lineHeight: tokens.font.leading.body }}>
          Its values, segments and sheet are removed for good. Milestones it reached are re-checked against your other scans, and
          proposals from its debrief that still wait for a tap are withdrawn.
        </Box>
        {!online && <Box sx={{ fontSize: tokens.font.size.small, color: tokens.ink.muted }}>Deleting needs a connection.</Box>}
        {remove.isError && (
          <Box role="alert" sx={{ color: 'error.main', fontSize: tokens.font.size.small }}>
            {problemText(remove.error)}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={!online || remove.isPending}
          onClick={() => remove.mutate({ params: { id: scanId } }, { onSuccess: () => void navigate('/scans', { replace: true }) })}
          data-testid="scan-delete-confirm"
        >
          {remove.isPending ? 'Deleting…' : 'Delete scan'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
