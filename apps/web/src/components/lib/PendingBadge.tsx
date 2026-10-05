// Owns: the small "pending" pill (offline-queued logs, proposals awaiting a tap): status dot + label + optional count.
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
        gap: 1.5,
        height: 24,
        px: 2.5,
        borderRadius: tokens.radius.chip,
        border: `1px solid ${tokens.ink.border}`,
        bgcolor: tokens.ink.card,
        fontSize: 12,
        fontWeight: tokens.font.weight.label,
        color: tokens.ink.text,
        whiteSpace: 'nowrap',
        flex: 'none',
      }}
    >
      <Box
        aria-hidden
        sx={{ width: 6, height: 6, borderRadius: tokens.radius.chip, bgcolor: tokens.status.warning }}
      />
      {text}
    </Box>
  )
}
