// Owns: the day's water on the Log tab (1d Summit rail card) — the quick-add form inline (one tap from the tab: its
// ring and total, then +250 / +500 / +750 as teal tiles and the custom amount) and the entries logged on this device
// that are still waiting to sync, each with its time.
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import Box from '@mui/material/Box'
import { formatClock, formatNumber, PendingBadge } from '../../../components'
import { metricTint, tokens } from '../../../theme'
import { useWater, WaterForm } from '../../quick-log'
import { LogCard } from './LogCard'

/**
 * The form's three quick amounts as 1d draws them on the Log tab: teal on the water tint, 12 px radius. Matched by the
 * form's own test ids (its public contract), so the quick-log sheet keeps its look.
 */
const quickAmountSx = {
  '& :is([data-testid="water-250"], [data-testid="water-500"], [data-testid="water-750"]).MuiButton-root': {
    bgcolor: metricTint('water'),
    color: tokens.tone.success.text,
    '&:hover': { bgcolor: tokens.tone.success.border },
  },
} as const

export function WaterCard({ date }: { date: string }) {
  const water = useWater(date)
  const queued = water.pending.filter((p) => p.queued)
  return (
    <LogCard title="Water" icon={WaterDropRounded} iconColor={tokens.tone.success.text} testId="log-water">
      <Box sx={quickAmountSx}>
        <WaterForm date={date} />
      </Box>
      {queued.length > 0 && (
        <Box
          component="ul"
          aria-label="Water entries waiting to sync"
          sx={{
            listStyle: 'none',
            p: 0,
            m: 0,
            mt: '12px',
            fontSize: tokens.font.size.small,
            color: tokens.ink.secondary,
          }}
        >
          {queued.map((p) => (
            <Box
              component="li"
              key={p.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                py: '6px',
                borderTop: `1px solid ${tokens.ink.hairline}`,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <Box sx={{ flex: 1 }}>{formatClock(p.loggedAt)}</Box>
              <PendingBadge />
              <Box>+{formatNumber(p.amountMl)} ml</Box>
            </Box>
          ))}
        </Box>
      )}
    </LogCard>
  )
}
