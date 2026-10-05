// Owns: the day's water on the Log tab — the quick-add form inline (one tap from the tab) and the entries logged on
// this phone that are still waiting to sync, each with its time.
import Box from '@mui/material/Box'
import { formatNumber, PendingBadge } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, useWater, WaterForm } from '../../quick-log'
import { LogCard } from './LogCard'

export function WaterCard({ date }: { date: string }) {
  const water = useWater(date)
  const queued = water.pending.filter((p) => p.queued)
  return (
    <LogCard title="Water" color={tokens.metric.water} testId="log-water">
      <WaterForm date={date} />
      {queued.length > 0 && (
        <Box component="ul" aria-label="Water entries waiting to sync" sx={{ listStyle: 'none', p: 0, m: 0, mt: 3, display: 'grid', gap: 1 }}>
          {queued.map((p) => (
            <Box component="li" key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: tokens.font.size.small, minHeight: 32 }}>
              <Box sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{clockOf(p.loggedAt)}</Box>
              <Box sx={{ flex: 1 }}>{formatNumber(p.amountMl)} ml</Box>
              <PendingBadge />
            </Box>
          ))}
        </Box>
      )}
    </LogCard>
  )
}
