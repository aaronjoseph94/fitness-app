// Owns: the four headline numbers for the selected range — trend change, average intake, average protein against
// its target, and logging adherence — one big number per card, two per row on a phone and four across when wide.
// Before the range's data arrives (`summary` null) the cards show dashes with footnotes of the same length, so the
// grid has its final height from the first paint and the charts under it never move.
import Box from '@mui/material/Box'
import { formatSigned, StatCard } from '../../../components'
import type { RangeSummary } from './series'

interface SummaryStatsProps {
  /** Null while the range's days and trend load. */
  summary: RangeSummary | null
  proteinTarget: number | null
  days: number
}

export function SummaryStats({ summary, proteinTarget, days }: SummaryStatsProps) {
  const logged = summary?.loggedDays ?? null
  return (
    <Box
      data-testid="progress-summary"
      aria-busy={summary === null || undefined}
      sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}
    >
      <StatCard
        label="Trend change"
        value={summary?.trendChangeKg == null ? null : formatSigned(summary.trendChangeKg, 1)}
        unit="kg"
        metric="weight"
        footnote={`Over ${days} days`}
        testId="stat-trend-change"
      />
      <StatCard
        label="Average intake"
        value={summary?.avgKcal == null ? null : Math.round(summary.avgKcal)}
        unit="kcal"
        metric="calories"
        footnote={
          logged === null
            ? 'Logged days, fasts excluded'
            : logged
              ? `${logged} logged ${logged === 1 ? 'day' : 'days'}, fasts excluded`
              : 'No meals logged yet'
        }
        testId="stat-avg-kcal"
      />
      <StatCard
        label="Average protein"
        value={summary?.avgProteinG == null ? null : Math.round(summary.avgProteinG)}
        unit="g"
        metric="protein"
        footnote={proteinTarget ? `Target ${proteinTarget} g` : summary === null ? 'Target' : undefined}
        testId="stat-avg-protein"
      />
      <StatCard
        label="Logging adherence"
        value={summary?.adherence == null ? null : Math.round(summary.adherence * 100)}
        unit="%"
        footnote="Weigh-in, meals and water"
        testId="stat-adherence"
      />
    </Box>
  )
}
