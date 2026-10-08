// Owns: the small "pending" pill (offline-queued logs, proposals awaiting a tap) — 2a's neutral pill: #F4F4F5, 11/500
// #52525B, radius 999 — with an optional count ("Pending · 2"). It is a live `status`, so a count change is announced.
import Box from '@mui/material/Box'
import { tokens } from '../../theme'

export interface PendingBadgeProps {
  /** Default "Pending". */
  label?: string
  /** Shown after the label when > 0, e.g. "Pending · 2". */
  count?: number
}

export function PendingBadge({ label = 'Pending', count }: PendingBadgeProps) {
  const text = count && count > 0 ? `${label} · ${count}` : label
  return (
    <Box
      component="span"
      role="status"
      data-testid="pending-badge"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        px: '8px',
        py: '2px',
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: tokens.tone.neutral.bg,
        fontSize: tokens.font.size.micro,
        fontWeight: tokens.font.weight.label,
        lineHeight: '16px',
        color: tokens.tone.neutral.text,
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
        flex: 'none',
      }}
    >
      {text}
    </Box>
  )
}
