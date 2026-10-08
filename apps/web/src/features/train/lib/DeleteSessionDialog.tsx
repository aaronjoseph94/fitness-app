// Owns: "Delete session" — the confirm (what goes: the ticked sets and the session's summary), then back to the Train
// tab and the delete through the write chain (sync.deleteSession: queued offline, after the session's earlier writes).
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import { useNavigate } from 'react-router'
import { deleteSession } from './sync'

export interface DeleteSessionDialogProps {
  open: boolean
  sessionId: string
  /** Ticked sets, named in the confirm. */
  setsDone: number
  onClose: () => void
}

export function DeleteSessionDialog({ open, sessionId, setsDone, onClose }: DeleteSessionDialogProps) {
  const navigate = useNavigate()
  const confirm = () => {
    onClose()
    // Leave the page first, so nothing re-reads the session while it goes.
    void navigate('/train', { replace: true })
    void deleteSession(sessionId)
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="delete-session-title">
      <DialogTitle id="delete-session-title">Delete this session?</DialogTitle>
      <DialogContent sx={{ color: 'text.secondary' }}>
        {setsDone > 0
          ? `Its ${setsDone} ticked set${setsDone === 1 ? '' : 's'} and its summary go for good; progression and readiness forget it.`
          : 'Nothing was ticked, so only the session goes.'}
      </DialogContent>
      <DialogActions>
        <Button variant="outlined" onClick={onClose}>
          Keep it
        </Button>
        <Button color="error" onClick={confirm} data-testid="confirm-delete-session">
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  )
}
