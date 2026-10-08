// Owns: the sync indicators — the phone bar's quiet chip ("Offline" and/or "N pending" while writes wait in the offline
// queue; nothing when all is sent) and the desktop sidebar's account block (2a: avatar, "Aaron", and a dot with
// "Synced" / "Offline" / "N pending"). When the oldest waiting write has failed, either one opens what went wrong, with
// "Try now" and "Discard entry" (the only way a pending write is ever dropped).
import CloudOffOutlined from '@mui/icons-material/CloudOffOutlined'
import CloudSyncOutlined from '@mui/icons-material/CloudSyncOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Chip from '@mui/material/Chip'
import Popover from '@mui/material/Popover'
import Tooltip from '@mui/material/Tooltip'
import { useId, useRef, useState, type MouseEvent } from 'react'
import { visuallyHidden } from '../../../components'
import {
  discardPendingWrite,
  flushNow,
  useOnline,
  usePendingWrites,
  type PendingWrite,
} from '../../../offline'
import { tokens } from '../../../theme'

const loggedAt = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** Whose tracker this is (2a's brand row and account block). Shown on screen only; never sent anywhere. */
export const OWNER = { name: 'Aaron', initial: 'A' } as const

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
  beside,
}: {
  id: string
  anchor: HTMLElement | null
  onClose: () => void
  state: SyncState
  /** Open to the right of the anchor (the sidebar) rather than under it (the phone bar). */
  beside?: boolean
}) {
  const { failing, pending, online } = state
  if (!failing) return null
  return (
    <Popover
      open={anchor !== null}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={
        beside ? { vertical: 'bottom', horizontal: 'left' } : { vertical: 'top', horizontal: 'right' }
      }
      slotProps={{
        paper: {
          id,
          role: 'dialog',
          'aria-label': 'Waiting to send',
          'data-testid': 'sync-status-details',
          sx: { p: 4, maxWidth: 320, ...(beside && { ml: 2 }) },
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

/** The phone bar's chip: nothing while everything is sent. */
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
        sx={{ flex: 'none', '& .MuiChip-icon': { color: tokens.ink.muted } }}
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

/** The status dot: green when everything is sent, amber while something waits, red when a write keeps failing. */
function dotColour({ synced, failing }: SyncState): string {
  if (failing) return tokens.tone.danger.text
  return synced ? tokens.tone.success.solid : tokens.tone.warning.text
}

/**
 * The sidebar's account block: avatar tile, name, and the sync state behind a coloured dot. Collapsed to the icon rail
 * it keeps the avatar with the dot on its corner (the words stay for assistive tech and in a tooltip). A failing write
 * makes the state a button that opens the details.
 */
export function AccountStatus({ collapsed }: { collapsed: boolean }) {
  const state = useSyncState()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const detailsId = useId()
  // The details open beside the whole block, clear of the sidebar, whichever part was pressed.
  const block = useRef<HTMLDivElement>(null)
  const { failing, synced } = state
  const open = anchor !== null && failing !== null
  const dot = dotColour(state)
  // The test id marks the state only while there is something to say, as the chip always has.
  const statusProps = {
    'data-testid': synced ? undefined : 'sync-status',
    ...(failing && {
      'aria-haspopup': 'dialog' as const,
      'aria-expanded': open,
      'aria-controls': open ? detailsId : undefined,
      onClick: (e: MouseEvent<HTMLElement>) => setAnchor(block.current ?? e.currentTarget),
    }),
  }

  const avatar = (
    <Box
      sx={{
        position: 'relative',
        width: 32,
        height: 32,
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        borderRadius: `${tokens.radius.control}px`,
        bgcolor: tokens.ink.border,
        color: tokens.ink.text,
        fontSize: tokens.font.size.small,
        fontWeight: tokens.font.weight.heading,
      }}
    >
      <span aria-hidden>{OWNER.initial}</span>
      {collapsed && (
        <Box
          aria-hidden
          sx={{
            position: 'absolute',
            right: -3,
            bottom: -3,
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: dot,
            border: `2px solid ${tokens.ink.card}`,
          }}
        />
      )}
    </Box>
  )

  if (collapsed) {
    const name = `${OWNER.name} · ${state.label}${failing ? ' · not sent, show details' : ''}`
    return (
      <>
        <Tooltip title={`${OWNER.name} · ${state.label}`} placement="right">
          <Box
            ref={block}
            component={failing ? ButtonBase : 'div'}
            aria-label={failing ? name : undefined}
            {...statusProps}
            sx={{
              mt: 2,
              mx: 'auto',
              p: '9px',
              display: 'grid',
              placeItems: 'center',
              borderRadius: `${tokens.radius.panel}px`,
              border: `1px solid ${tokens.ink.border}`,
              bgcolor: tokens.ink.card,
            }}
          >
            {avatar}
            {!failing && <Box sx={visuallyHidden}>{name}</Box>}
          </Box>
        </Tooltip>
        {/* Outside the button: a click inside the (portalled) popover still bubbles through React to its parents. */}
        <SyncDetails
          id={detailsId}
          anchor={open ? anchor : null}
          onClose={() => setAnchor(null)}
          state={state}
          beside
        />
      </>
    )
  }

  return (
    <Box
      ref={block}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        mt: 2,
        p: 2,
        minWidth: 0,
        borderRadius: `${tokens.radius.panel}px`,
        border: `1px solid ${tokens.ink.border}`,
        bgcolor: tokens.ink.card,
      }}
    >
      {avatar}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.heading, lineHeight: 1.2 }}
        >
          {OWNER.name}
        </Box>
        <Box
          component={failing ? ButtonBase : 'div'}
          {...statusProps}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            maxWidth: '100%',
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.caption,
            color: failing ? tokens.tone.danger.text : tokens.ink.muted,
            borderRadius: '4px',
            ...(failing && { textDecoration: 'underline', textUnderlineOffset: '2px' }),
          }}
        >
          <Box aria-hidden sx={{ width: 6, height: 6, flex: 'none', borderRadius: '50%', bgcolor: dot }} />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {state.label}
            {failing && (
              <Box component="span" sx={visuallyHidden}>
                {' '}
                · not sent, show details
              </Box>
            )}
          </Box>
        </Box>
      </Box>
      <SyncDetails
        id={detailsId}
        anchor={open ? anchor : null}
        onClose={() => setAnchor(null)}
        state={state}
        beside
      />
    </Box>
  )
}
