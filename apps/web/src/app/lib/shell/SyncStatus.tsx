// Owns: the quiet sync indicator in the top bar — "Offline" and/or "N pending" while writes wait in the offline queue.
// When the oldest waiting write has failed, the chip opens what went wrong, with "Try now" and "Discard entry" (the
// only way a pending write is ever dropped).
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Popover from '@mui/material/Popover'
import { useId, useState } from 'react'
import { discardPendingWrite, flushNow, useOnline, usePendingWrites } from '../../../offline'
import { tokens } from '../../../theme'

const loggedAt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

export function SyncStatus() {
  const online = useOnline()
  const writes = usePendingWrites()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const detailsId = useId()
  const pending = writes.length
  const head = writes[0]
  const failing = head?.last_error ? head : null
  if (online && pending === 0) return null
  const label = [online ? null : 'Offline', pending > 0 ? `${pending} pending` : null].filter(Boolean).join(' · ')
  const open = anchor !== null && failing !== null
  const close = () => setAnchor(null)

  return (
    <>
      <Chip
        data-testid="sync-status"
        size="small"
        variant="outlined"
        icon={online ? <CloudSyncOutlined /> : <CloudOffOutlined />}
        label={label}
        onClick={failing ? (e) => setAnchor(e.currentTarget) : undefined}
        aria-haspopup={failing ? 'dialog' : undefined}
        aria-expanded={failing ? open : undefined}
        aria-controls={open ? detailsId : undefined}
        sx={{ color: 'text.secondary', '& .MuiChip-icon': { color: 'text.secondary' } }}
      />
      {failing && (
        <Popover
          open={open}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            paper: {
              id: detailsId,
              role: 'dialog',
              'aria-label': 'Waiting to send',
              'data-testid': 'sync-status-details',
              sx: { p: 4, maxWidth: 320 },
            } as object,
          }}
        >
          <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>Not sent yet</Box>
          <Box sx={{ mt: 1.5, fontSize: tokens.font.size.small, color: tokens.ink.text, lineHeight: 1.5 }}>
            The entry from {loggedAt.format(new Date(failing.created_at))} failed {failing.attempts}{' '}
            {failing.attempts === 1 ? 'time' : 'times'}: {failing.last_error}
          </Box>
          <Box sx={{ mt: 1, fontSize: tokens.font.size.label, color: tokens.ink.secondary, lineHeight: 1.45 }}>
            {pending > 1 ? `${pending - 1} more wait behind it. ` : ''}It keeps trying on its own; discarding it loses that entry.
          </Box>
          <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
            <Button
              color="error"
              data-testid="sync-discard"
              onClick={() => {
                close()
                void discardPendingWrite(failing.id).then(() => flushNow())
              }}
            >
              Discard entry
            </Button>
            <Button
              variant="contained"
              disabled={!online}
              onClick={() => {
                close()
                void flushNow()
              }}
            >
              Try now
            </Button>
          </Box>
        </Popover>
      )}
    </>
  )
}
