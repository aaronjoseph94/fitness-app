// Owns: the scan charts as one block (SPEC §11 inventory) — fat vs lean mass across scans, body fat % and visceral
// level across scans with gauges for the focused scan, and segmental fat at the baseline vs the focused scan. Used by
// the scan page (full size) and the Progress tab (compact). `width` passes through for print.
import Box from '@mui/material/Box'
import { BodyCompositionChart, BodyFatVisceralChart, Gauge, SegmentalFatChart } from '../../../charts'
import { ChartCard, formatNumber } from '../../../components'
import { BODY_FAT_GAUGE, compositionSeries, fatSeries, segmentalFat, TARGETS, VISCERAL_GAUGE, type ConfirmedScan } from './series'

interface ScanChartsProps {
  /** Confirmed scans, oldest first. */
  scans: readonly ConfirmedScan[]
  /** The scan the gauges and segment bars show (default: the latest). */
  focus?: ConfirmedScan
  compact?: boolean
  width?: number
  /** One card per row at every width (the scan page, in the shell's ~820 px reading column); else two across from `md`. */
  stacked?: boolean
  /** The cards' heading level: h2 where they sit straight under the page's h1 (the scan page), h3 under a section. */
  headingComponent?: 'h2' | 'h3'
}

export function ScanCharts({ scans, focus, compact = false, stacked = false, width, headingComponent = 'h3' }: ScanChartsProps) {
  const latest = focus ?? scans.at(-1)
  const baseline = scans[0]
  if (!latest || !baseline) return null
  const shown = scans.filter((s) => s.record.scanned_at <= latest.record.scanned_at)
  const gauge = compact ? 150 : 170
  return (
    <Box sx={{ display: 'grid', gap: 4, alignItems: 'start', gridTemplateColumns: { xs: '1fr', md: compact || stacked ? '1fr' : '1fr 1fr' }, minWidth: 0 }}>
      <ChartCard
        title="Fat and lean mass"
        subtitle={`Per scan; fat target ${formatNumber(TARGETS.fatMassKg, 1)} kg at goal`}
        headingComponent={headingComponent}
        testId="scan-chart-composition"
      >
        <BodyCompositionChart scans={compositionSeries(shown)} fatTarget={TARGETS.fatMassKg} width={width} height={compact ? 180 : 220} />
      </ChartCard>
      <ChartCard
        title="Body fat and visceral level"
        subtitle={`Per scan; gauges for ${latest.date}`}
        headingComponent={headingComponent}
        testId="scan-chart-fat-visceral"
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 2, mb: 3 }}>
          <Gauge {...BODY_FAT_GAUGE} value={latest.record.body_fat_pct} label="Body fat" unit="%" precision={1} size={gauge} testId="scan-gauge-body-fat" />
          <Gauge {...VISCERAL_GAUGE} value={latest.record.visceral_fat_level} label="Visceral level" size={gauge} testId="scan-gauge-visceral" />
        </Box>
        <BodyFatVisceralChart
          scans={fatSeries(shown)}
          bodyFatTarget={TARGETS.bodyFatPct}
          visceralTarget={TARGETS.visceralLevel}
          width={width}
          height={compact ? 240 : 300}
        />
      </ChartCard>
      {latest.id !== baseline.id && (
        <ChartCard
          title="Segmental fat"
          subtitle={`Baseline ${baseline.date} vs ${latest.date}, kg`}
          headingComponent={headingComponent}
          testId="scan-chart-segments"
        >
          <SegmentalFatChart segments={segmentalFat(baseline.record, latest.record)} baselineLabel={baseline.date} latestLabel={latest.date} width={width} />
        </ChartCard>
      )}
    </Box>
  )
}
