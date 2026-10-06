// Owns: the Dashboard's band of headline metrics — one white card per KPI with its metric-tinted icon tile, two across
// on a phone and up to three on a wide screen, each carrying its sparkline so the shape of the window is visible without
// opening a chart. It is the first thing on the page: main numbers first, history under them. The band rises into place
// as one unit (a single `Reveal`), which is why the cards themselves do not each carry an entrance of their own.
import Box from '@mui/material/Box'
import { Sparkline } from '../../../charts'
import { Reveal, StatCard } from '../../../components'
import type { Kpi } from './kpis'

export function KpiBand({ kpis }: { kpis: readonly Kpi[] }) {
  return (
    <Reveal delay={80}>
      <Box
        data-testid="dashboard-kpis"
        sx={{
          display: 'grid',
          gap: 3,
          gridTemplateColumns: {
            xs: 'repeat(2, minmax(0, 1fr))',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'repeat(3, minmax(0, 1fr))',
          },
        }}
      >
        {kpis.map((kpi) => (
          <StatCard
            key={kpi.key}
            label={kpi.label}
            value={kpi.value}
            unit={kpi.unit}
            precision={kpi.precision ?? 0}
            delta={kpi.delta}
            metric={kpi.metric}
            icon={kpi.icon}
            footnote={kpi.footnote}
            testId={`kpi-${kpi.key}`}
            sparkline={
              kpi.series && kpi.series.length > 1 ? (
                <Sparkline values={kpi.series} metric={kpi.metric ?? 'weight'} reference={kpi.reference} />
              ) : undefined
            }
          />
        ))}
      </Box>
    </Reveal>
  )
}
