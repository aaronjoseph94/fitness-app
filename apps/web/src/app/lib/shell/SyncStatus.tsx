// Owns: the sync indicator — a compact glass chip in the Summit nav ("Offline" and/or "N pending" while writes wait in
// the offline queue; nothing when all is sent), at every width. When the oldest waiting write has failed, it opens what
// went wrong, with "Try now" and "Discard entry" (the only way a pending write is ever dropped).
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Popover from '@mui/material/Popover'
import { useId, useState } from 'react'
import {
  discardPendingWrite,
  flushNow,
  useOnline,
  usePendingWrites,
  type PendingWrite,
} from '../../../offline'
import { tokens } from '../../../theme'

const loggedAt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

const { summit } = tokens

interface SyncState {
  online: boolean
  pending: number
  /** The oldest waiting write, when its last attempt failed. */
  failing: PendingWrite | null
  /** "Offline", "2 pending", "Offline · 2 pending" — or "Synced" when nothing waits. */
  label: string
  synced: boolean
}

function useSyncState(): SyncState {
  const online = useOnline()
  const writes = usePendingWrites()
  const pending = writes.length
  const head = writes[0]
  const synced = online && pending === 0
  const label = synced
    ? 'Synced'
    : [online ? null : 'Offline', pending > 0 ? `${pending} pending` : null].filter(Boolean).join(' · ')
  return { online, pending, failing: head?.last_error ? head : null, label, synced }
}

/** The details a failing write opens: what went wrong, "Discard entry" and "Try now". */
function SyncDetails({
  id,
  anchor,
  onClose,
  state,
}: {
  id: string
  anchor: HTMLElement | null
  onClose: () => void
  state: SyncState
}) {
  const { failing, pending, online } = state
  if (!failing) return null
  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{
        paper: {
          id,
          role: 'dialog',
          'aria-label': 'Waiting to send',
          'data-testid': 'sync-status-details',
          sx: { p: 5, mt: 2, maxWidth: 320 },
        } as object,
      }}
    >
      <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>Not sent yet</Box>
      <Box
        sx={{
          mt: 1.5,
          fontSize: tokens.font.size.small,
          color: tokens.ink.text,
          lineHeight: tokens.font.leading.small,
        }}
      >
        The entry from {loggedAt.format(new Date(failing.created_at))} failed {failing.attempts}{' '}
        {failing.attempts === 1 ? 'time' : 'times'}: {failing.last_error}
      </Box>
      <Box
        sx={{
          mt: 1,
          fontSize: tokens.font.size.caption,
          color: tokens.ink.muted,
          lineHeight: tokens.font.leading.caption,
        }}
      >
        {pending > 1 ? `${pending - 1} more wait behind it. ` : ''}It keeps trying on its own; discarding it
        loses that entry.
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
        <Button
          color="error"
          size="small"
          data-testid="sync-discard"
          onClick={() => {
            onClose()
            void discardPendingWrite(failing.id).then(() => flushNow())
          }}
        >
          Discard entry
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!online}
          onClick={() => {
            onClose()
            void flushNow()
          }}
        >
          Try now
        </Button>
      </Box>
    </Popover>
  )
}

/** The nav's glass chip: nothing while everything is sent. */
export function SyncStatus() {
  const state = useSyncState()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const detailsId = useId()
  if (state.synced) return null
  const { failing, online } = state
  const open = anchor !== null && failing !== null

  return (
    <>
      <Chip
        data-testid="sync-status"
        size="small"
        variant="outlined"
        icon={online ? <CloudSyncOutlined /> : <CloudOffOutlined />}
        label={state.label}
        onClick={failing ? (e) => setAnchor(e.currentTarget) : undefined}
        aria-haspopup={failing ? 'dialog' : undefined}
        aria-expanded={failing ? open : undefined}
        aria-controls={open ? detailsId : undefined}
        sx={{
          flex: 'none',
          minHeight: 32,
          px: '12px',
          bgcolor: summit.glass.tile,
          border: `1px solid ${summit.glass.tileBorder}`,
          backdropFilter: `blur(${summit.glass.tileBlur}px)`,
          color: summit.onSky.text,
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.heading,
          '& .MuiChip-icon': { color: summit.onSky.subtitle, fontSize: 16 },
          '&.MuiChip-clickable:hover': { bgcolor: summit.glass.fillHover },
        }}
      />
      <SyncDetails
        id={detailsId}
        anchor={open ? anchor : null}
        onClose={() => setAnchor(null)}
        state={state}
      />
    </>
  )
}
