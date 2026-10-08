// Owns: the day's water on the Log tab — the quick-add form inline (one tap from the tab) and the entries logged on
// this phone that are still waiting to sync, each with its time.
import WaterDropRounded from '@mui/icons-material/WaterDropRounded'
import Box from '@mui/material/Box'
import { formatClock, formatNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { useWater, WaterForm } from '../../quick-log'
import { LogCard } from './LogCard'

export function WaterCard({ date }: { date: string }) {
  const water = useWater(date)
  const queued = water.pending.filter((p) => p.queued)
  return (
    <LogCard title="Water" icon={WaterDropRounded} iconColor={tokens.metric.water} testId="log-water">
      <WaterForm date={date} />
      {queued.length > 0 && (
        <Box component="ul" aria-label="Water entries waiting to sync" sx={{ listStyle: 'none', p: 0, m: 0, mt: '10px', fontSize: tokens.font.size.caption, color: tokens.ink.label }}>
          {queued.map((p) => (
            <Box component="li" key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, py: '6px', borderTop: `1px solid ${tokens.ink.hairline}`, fontVariantNumeric: 'tabular-nums' }}>
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
