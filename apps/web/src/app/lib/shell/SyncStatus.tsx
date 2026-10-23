// Owns: the sync indicator — a compact glass chip in the Summit nav ("Offline" and/or "N pending" while writes wait in
// the offline queue; nothing when all is sent), at every width, with a 44 px hit area. A tap opens the queue (what
// waits, and since when); when the oldest waiting write has failed, also what went wrong, with "Try now" and "Discard
// entry" (the only way a pending write is ever dropped).
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
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
import { formatRecentTime, skyFocus } from '../../../components'
import { tokens } from '../../../theme'

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

/** What a queued write is, from its path: "/api/meals/…" → "Meal". Anything unlisted reads "Change". */
const WRITE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['/api/weights', 'Weigh-in'],
  ['/api/meals', 'Meal'],
  ['/api/water', 'Water'],
  ['/api/fasts', 'Fast'],
  ['/api/sessions', 'Workout'],
  ['/api/steps', 'Steps'],
  ['/api/sleep', 'Sleep'],
  ['/api/measurements', 'Measurements'],
  ['/api/photos', 'Photo'],
  ['/api/notes', 'Note'],
  ['/api/favorites', 'Favourite'],
  ['/api/days', 'Day'],
]

function writeLabel(write: PendingWrite): string {
  const base = WRITE_LABELS.find(([prefix]) => write.path.startsWith(prefix))?.[1] ?? 'Change'
  return write.method === 'DELETE' ? `${base} (removed)` : base
}

/** The most rows the queue list shows; the rest are counted. */
const LIST_MAX = 6

/**
 * What the chip opens: the queue (each waiting write and when it was made), offline or not; and when the oldest write
 * has failed, what went wrong with "Discard entry" and "Try now".
 */
function SyncDetails({
  id,
  anchor,
  onClose,
  state,
  writes,
}: {
  id: string
  anchor: HTMLElement | null
  onClose: () => void
  state: SyncState
  writes: readonly PendingWrite[]
}) {
  const { failing, pending, online } = state
  const shown = writes.slice(0, LIST_MAX)
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
      <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading }}>
        {failing ? 'Not sent yet' : online ? 'Sending…' : 'You’re offline'}
      </Box>
      <Box
        sx={{
          mt: 1.5,
          fontSize: tokens.font.size.small,
          color: tokens.ink.text,
          lineHeight: tokens.font.leading.small,
        }}
      >
        {pending === 0
          ? 'Anything you log is kept on this device and sent once you’re back online.'
          : `${pending} ${pending === 1 ? 'entry waits' : 'entries wait'} on this device${
              online ? '.' : ' and will send once you’re back online.'
            }`}
      </Box>
      {shown.length > 0 && (
        <Box
          component="ul"
          data-testid="sync-queue"
          sx={{
            listStyle: 'none',
            m: 0,
            mt: 2,
            p: 0,
            fontSize: tokens.font.size.small,
            lineHeight: tokens.font.leading.small,
          }}
        >
          {shown.map((write) => (
            <Box
              component="li"
              key={write.id}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 2,
                py: 0.75,
                borderTop: `1px solid ${tokens.ink.hairline}`,
              }}
            >
              <span>{writeLabel(write)}</span>
              <Box
                component="span"
                sx={{ color: tokens.ink.muted, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
              >
                {formatRecentTime(write.created_at)}
              </Box>
            </Box>
          ))}
          {writes.length > LIST_MAX && (
            <Box component="li" sx={{ py: 0.75, color: tokens.ink.muted }}>
              and {writes.length - LIST_MAX} more
            </Box>
          )}
        </Box>
      )}
      {failing && (
        <>
          <Box
            sx={{
              mt: 2,
              fontSize: tokens.font.size.small,
              color: tokens.ink.text,
              lineHeight: tokens.font.leading.small,
            }}
          >
            The {writeLabel(failing).toLowerCase()} from {formatRecentTime(failing.created_at)} failed{' '}
            {failing.attempts} {failing.attempts === 1 ? 'time' : 'times'}: {failing.last_error}
          </Box>
          <Box
            sx={{
              mt: 1,
              fontSize: tokens.font.size.caption,
              color: tokens.ink.muted,
              lineHeight: tokens.font.leading.caption,
            }}
          >
            It keeps trying on its own; discarding it loses that entry.
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
        </>
      )}
      {!failing && online && pending > 0 && (
        <Box sx={{ display: 'flex', mt: 3, justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              onClose()
              void flushNow()
            }}
          >
            Send now
          </Button>
        </Box>
      )}
    </Popover>
  )
}

/** The nav's glass chip: nothing while everything is sent. Tapping it opens the queue. */
export function SyncStatus() {
  const state = useSyncState()
  const writes = usePendingWrites()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const detailsId = useId()
  if (state.synced) return null
  const { online } = state
  const open = anchor !== null

  return (
    <>
      <Chip
        data-testid="sync-status"
        size="small"
        variant="outlined"
        icon={online ? <CloudSyncOutlined /> : <CloudOffOutlined />}
        label={state.label}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        sx={{
          flex: 'none',
          position: 'relative',
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
          // A 44 px tall hit area around the 32 px chip, so a thumb finds it (WCAG 2.5.8).
          '&::after': { content: '""', position: 'absolute', left: 0, right: 0, top: '-6px', bottom: '-6px' },
          ...skyFocus,
        }}
      />
      <SyncDetails
        id={detailsId}
        anchor={open ? anchor : null}
        onClose={() => setAnchor(null)}
        state={state}
        writes={writes}
      />
    </>
  )
}
