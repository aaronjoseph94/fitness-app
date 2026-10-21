// Owns: the gold chip of the Train screens (1d Summit: the gold CTA gradient with deep ink text, 16:1 at its lightest)
// — "Today" on today's template, "Current" on the exercise in hand, "PR" on a recent session. Non-interactive.
import Box from '@mui/material/Box'
import { tokens } from '../../../theme'

export function GoldChip({ label, size = 'medium' }: { label: string; size?: 'medium' | 'small' }) {
  const small = size === 'small'
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        flex: 'none',
        px: small ? '8px' : '9px',
        py: small ? '1px' : '3px',
        borderRadius: `${tokens.radius.pill}px`,
        backgroundImage: tokens.summit.cta.gold.bg,
        color: tokens.summit.cta.gold.text,
        fontSize: small ? tokens.font.size.micro : tokens.font.size.caption,
        fontWeight: tokens.font.weight.heading,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  )
}
