// Owns: the scan's numbers beside their changes — each whole-body metric and each segment's fat and lean, with the
// change since the previous scan and since the baseline, coloured by whether the direction is good.
import Box from '@mui/material/Box'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import type { ScanChange, ScanMetricField, ScanRecord } from '@fitness/shared/schemas'
import { formatNumber, formatShortDate, formatSigned } from '../../../components'
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
  if (value === undefined) return <Box component="span" sx={{ color: tokens.ink.muted }}>—</Box>
  const flat = Math.abs(value) < 10 ** -dp / 2
  const ok = good === 'neutral' || flat ? null : (value < 0) === (good === 'down')
  return (
    <Box
      component="span"
      sx={{ color: ok === null ? tokens.ink.label : ok ? tokens.tone.success.text : tokens.tone.danger.text, fontWeight: tokens.font.weight.label }}
    >
      {flat ? formatNumber(0, dp) : formatSigned(value, dp)}
    </Box>
  )
}

export function DeltaTable({ record, previous, baseline }: { record: ScanRecord; previous: ScanChange | null; baseline: ScanChange | null }) {
  const showBaseline = baseline !== null && baseline.scan_id !== previous?.scan_id
  const row = (label: string, value: number, unit: string, dp: number, good: Good, prev: number | undefined, base: number | undefined) => (
    <TableRow key={label}>
      <TableCell>{label}</TableCell>
      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
        {formatNumber(value, dp)}
        {unit && <Box component="span" sx={{ color: tokens.ink.muted }}> {unit}</Box>}
      </TableCell>
      <TableCell align="right">
        <Delta value={prev} dp={dp} good={good} />
      </TableCell>
      {showBaseline && (
        <TableCell align="right">
          <Delta value={base} dp={dp} good={good} />
        </TableCell>
      )}
    </TableRow>
  )
  return (
    <Table data-testid="scan-delta-table">
      <TableHead>
        <TableRow>
          <TableCell>Metric</TableCell>
          <TableCell align="right">This scan</TableCell>
          <TableCell align="right">{previous ? `vs ${formatShortDate(previous.date)}` : 'vs previous'}</TableCell>
          {showBaseline && <TableCell align="right">vs baseline</TableCell>}
        </TableRow>
      </TableHead>
      <TableBody>
        {ROWS.map((r) => row(r.label, record[r.key], r.unit, r.dp, r.good, previous?.deltas[r.key], baseline?.deltas[r.key]))}
        {SEGMENTS.flatMap((s) => [
          row(`${SEGMENT_LABEL[s]} fat`, record.segments[s].fat_kg, 'kg', 2, 'down', previous?.segments[s]?.fat_kg, baseline?.segments[s]?.fat_kg),
          row(`${SEGMENT_LABEL[s]} lean`, record.segments[s].lean_kg, 'kg', 2, 'up', previous?.segments[s]?.lean_kg, baseline?.segments[s]?.lean_kg),
        ])}
      </TableBody>
    </Table>
  )
}
