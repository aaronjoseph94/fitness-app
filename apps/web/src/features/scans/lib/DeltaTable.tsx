// Owns: the scan's numbers beside their changes — each whole-body metric and each segment's fat and lean, with the
// change since the previous scan and since the baseline, coloured by whether the direction is good.
import Box from '@mui/material/Box'
import type { ScanChange, ScanMetricField, ScanRecord } from '@fitness/shared/schemas'
import { formatNumber, formatSigned } from '../../../components'
import { tokens } from '../../../theme'
import { SEGMENT_LABEL, SEGMENTS } from './series'

type Good = 'up' | 'down' | 'neutral'

const ROWS: { key: ScanMetricField; label: string; unit: string; dp: number; good: Good }[] = [
  { key: 'weight_kg', label: 'Weight', unit: 'kg', dp: 1, good: 'down' },
  { key: 'body_fat_mass_kg', label: 'Fat mass', unit: 'kg', dp: 1, good: 'down' },
  { key: 'lean_body_mass_kg', label: 'Lean mass', unit: 'kg', dp: 1, good: 'up' },
  { key: 'skeletal_muscle_mass_kg', label: 'Skeletal muscle', unit: 'kg', dp: 1, good: 'up' },
  { key: 'total_body_water_kg', label: 'Body water', unit: 'kg', dp: 1, good: 'neutral' },
  { key: 'body_fat_pct', label: 'Body fat', unit: '%', dp: 1, good: 'down' },
  { key: 'visceral_fat_level', label: 'Visceral level', unit: '', dp: 0, good: 'down' },
  { key: 'visceral_fat_area_cm2', label: 'Visceral area', unit: 'cm²', dp: 0, good: 'down' },
  { key: 'waist_hip_ratio', label: 'Waist-to-hip', unit: '', dp: 2, good: 'down' },
  { key: 'bmr_kcal', label: 'BMR', unit: 'kcal', dp: 0, good: 'neutral' },
  { key: 'bio_age', label: 'Bio age', unit: 'y', dp: 0, good: 'down' },
  { key: 'bwi_score', label: 'BWI', unit: '/10', dp: 1, good: 'up' },
]

function Delta({ value, dp, good }: { value: number | undefined; dp: number; good: Good }) {
  if (value === undefined) return <Box sx={{ color: 'text.secondary' }}>—</Box>
  const flat = Math.abs(value) < 10 ** -dp / 2
  const ok = good === 'neutral' || flat ? null : (value < 0) === (good === 'down')
  return (
    <Box sx={{ color: ok === null ? tokens.ink.secondary : ok ? tokens.status.good : tokens.status.flag, fontWeight: tokens.font.weight.label }}>
      {flat ? formatNumber(0, dp) : formatSigned(value, dp)}
    </Box>
  )
}

const cell = { py: 1.25, borderBottom: `1px solid ${tokens.ink.border}`, fontVariantNumeric: 'tabular-nums', fontSize: 14, minWidth: 0 } as const

export function DeltaTable({ record, previous, baseline }: { record: ScanRecord; previous: ScanChange | null; baseline: ScanChange | null }) {
  const showBaseline = baseline !== null && baseline.scan_id !== previous?.scan_id
  const cols = showBaseline ? 'minmax(0, 1.4fr) repeat(3, minmax(0, 1fr))' : 'minmax(0, 1.4fr) repeat(2, minmax(0, 1fr))'
  const header = (
    <>
      <Box sx={{ ...cell, color: 'text.secondary', fontSize: 12 }}>Metric</Box>
      <Box sx={{ ...cell, color: 'text.secondary', fontSize: 12, textAlign: 'right' }}>This scan</Box>
      <Box sx={{ ...cell, color: 'text.secondary', fontSize: 12, textAlign: 'right' }}>{previous ? `vs ${previous.date}` : 'vs previous'}</Box>
      {showBaseline && <Box sx={{ ...cell, color: 'text.secondary', fontSize: 12, textAlign: 'right' }}>vs baseline</Box>}
    </>
  )
  const row = (label: string, value: number, unit: string, dp: number, good: Good, prev: number | undefined, base: number | undefined) => (
    <Box key={label} sx={{ display: 'contents' }}>
      <Box sx={cell}>{label}</Box>
      <Box sx={{ ...cell, textAlign: 'right' }}>
        {formatNumber(value, dp)}
        {unit && <Box component="span" sx={{ color: 'text.secondary', fontSize: 12 }}> {unit}</Box>}
      </Box>
      <Box sx={{ ...cell, textAlign: 'right' }}>
        <Delta value={prev} dp={dp} good={good} />
      </Box>
      {showBaseline && (
        <Box sx={{ ...cell, textAlign: 'right' }}>
          <Delta value={base} dp={dp} good={good} />
        </Box>
      )}
    </Box>
  )
  return (
    <Box data-testid="scan-delta-table" sx={{ display: 'grid', gridTemplateColumns: cols, columnGap: 2 }}>
      {header}
      {ROWS.map((r) => row(r.label, record[r.key], r.unit, r.dp, r.good, previous?.deltas[r.key], baseline?.deltas[r.key]))}
      {SEGMENTS.flatMap((s) => [
        row(`${SEGMENT_LABEL[s]} fat`, record.segments[s].fat_kg, 'kg', 2, 'down', previous?.segments[s]?.fat_kg, baseline?.segments[s]?.fat_kg),
        row(`${SEGMENT_LABEL[s]} lean`, record.segments[s].lean_kg, 'kg', 2, 'up', previous?.segments[s]?.lean_kg, baseline?.segments[s]?.lean_kg),
      ])}
    </Box>
  )
}
