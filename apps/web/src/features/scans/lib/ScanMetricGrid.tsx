// Owns: every scan metric the scan charts do not draw, across scans (SPEC §8 "the Progress tab charts every metric
// across scans") — one compact tile each: the latest value, the change since the first scan, and a sparkline, with
// the SPEC §3 targets (waist-to-hip under 0.90, visceral fat area at most 100 cm²) as dashed lines.
import Box from '@mui/material/Box'
import type { ScanMetrics } from '@fitness/shared/schemas'
import { Sparkline } from '../../../charts'
import { ChartCard, formatNumber, formatSigned } from '../../../components'
import { tokens, type MetricKey } from '../../../theme'
import type { ConfirmedScan } from './series'

interface MetricTile {
  field: keyof ScanMetrics
  label: string
  unit: string
  digits: number
  metric: MetricKey
  target?: number
}

/** Fat and lean mass, body fat % and visceral level have their own charts (ScanCharts). */
const TILES: readonly MetricTile[] = [
  { field: 'weight_kg', label: 'Weight', unit: 'kg', digits: 1, metric: 'weight' },
  { field: 'skeletal_muscle_mass_kg', label: 'Skeletal muscle', unit: 'kg', digits: 1, metric: 'lean' },
  { field: 'protein_kg', label: 'Protein', unit: 'kg', digits: 1, metric: 'lean' },
  { field: 'mineral_kg', label: 'Mineral', unit: 'kg', digits: 2, metric: 'lean' },
  { field: 'total_body_water_kg', label: 'Total body water', unit: 'kg', digits: 1, metric: 'water' },
  { field: 'icf_kg', label: 'Intracellular water', unit: 'kg', digits: 1, metric: 'water' },
  { field: 'ecf_kg', label: 'Extracellular water', unit: 'kg', digits: 1, metric: 'water' },
  { field: 'subcutaneous_fat_kg', label: 'Subcutaneous fat', unit: 'kg', digits: 1, metric: 'fatMass' },
  { field: 'visceral_fat_kg', label: 'Visceral fat', unit: 'kg', digits: 2, metric: 'fatMass' },
  { field: 'visceral_fat_area_cm2', label: 'Visceral fat area', unit: 'cm²', digits: 0, metric: 'fatMass', target: 100 },
  { field: 'waist_hip_ratio', label: 'Waist-to-hip', unit: '', digits: 2, metric: 'fatMass', target: 0.9 },
  { field: 'bmr_kcal', label: 'BMR', unit: 'kcal', digits: 0, metric: 'calories' },
  { field: 'tee_kcal', label: 'TEE', unit: 'kcal', digits: 0, metric: 'calories' },
  { field: 'bio_age', label: 'Bio age', unit: 'y', digits: 0, metric: 'weight' },
  { field: 'bwi_score', label: 'BWI', unit: '', digits: 1, metric: 'weight' },
]

const withUnit = (v: string, unit: string) => (unit ? `${v} ${unit}` : v)

export function ScanMetricGrid({ scans }: { scans: readonly ConfirmedScan[] }) {
  const first = scans[0]
  const last = scans.at(-1)
  if (!first || !last) return null
  return (
    <ChartCard title="Every scan metric" subtitle={`${scans.length} scan${scans.length === 1 ? '' : 's'} · latest ${last.date}, change since ${first.date}`} testId="scan-metric-grid">
      <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {TILES.map((t) => {
          const values = scans.map((s) => s.record[t.field])
          const now = last.record[t.field]
          const change = now - first.record[t.field]
          return (
            <Box key={t.field} data-testid={`scan-metric-${t.field}`} sx={{ minWidth: 0 }}>
              <Box sx={{ fontSize: tokens.font.size.label, color: tokens.ink.secondary, fontWeight: tokens.font.weight.label }}>{t.label}</Box>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, fontVariantNumeric: 'tabular-nums' }}>
                <Box sx={{ fontSize: tokens.font.size.cardTitle, fontWeight: tokens.font.weight.number }}>{withUnit(formatNumber(now, t.digits), t.unit)}</Box>
                {scans.length > 1 && <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>{formatSigned(change, t.digits)}</Box>}
              </Box>
              {t.target !== undefined && (
                <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>target ≤ {formatNumber(t.target, t.digits)}</Box>
              )}
              <Sparkline values={values} metric={t.metric} reference={t.target} height={32} />
            </Box>
          )
        })}
      </Box>
    </ChartCard>
  )
}
