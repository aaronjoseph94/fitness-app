// Owns: the scans list's cards about the confirmed scans (2a) — the latest scan's headline numbers (weight, body fat
// against Evolt's range, lean mass with its skeletal muscle, visceral level against its target) over a strip of the
// other fat and energy readings; fat and lean mass across scans against the SPEC §3 goal; the segments table with each
// segment's fat share beside the fat-share muscle map; water and minerals; and the lean-loss guard chip they share.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import type { ScanChange, ScanSegment } from '@fitness/shared/schemas'
import { Link as RouterLink } from 'react-router'
import { BodyCompositionChart } from '../../../charts'
import {
  deltaTone,
  formatClock,
  formatNumber,
  formatShortDate,
  formatSigned,
  KeyStat,
  KeyStatGrid,
  LegendChips,
  Panel,
  ProgressBar,
  StatusChip,
  tabularNums,
  visuallyHidden,
  wellSurface,
} from '../../../components'
import { MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { scanDay } from './format'
import {
  BODY_FAT_RANGE,
  compositionSeries,
  fatShare,
  SEGMENT_LABEL,
  segmentFatLevels,
  TARGETS,
  type ConfirmedScan,
} from './series'

/** The lean-loss guard of a scan against the one before it; the first scan is the baseline. */
export function GuardChip({ change, size = 'medium' }: { change: ScanChange | null; size?: 'medium' | 'small' }) {
  if (!change) return <StatusChip size={size} label="Baseline" />
  if (change.lean_loss === 'lean_loss') return <StatusChip size={size} tone="danger" label="Lean loss" />
  if (change.lean_loss === 'hydration') return <StatusChip size={size} tone="outline" label="Water shift" />
  return <StatusChip size={size} tone="success" label="Lean held" />
}

/** The change since the previous scan beside a value, in the kit's delta tone: green the good way, amber not. */
function Delta({ value, precision, good, since }: { value: number | undefined; precision: number; good: 'up' | 'down'; since: string }) {
  if (value === undefined) return null
  const flat = Math.abs(value) < 10 ** -precision / 2
  const colour = tokens.tone[deltaTone({ value, good }, precision)].text
  return (
    <Box component="span" sx={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.label, letterSpacing: 0, color: colour }}>
      {flat ? formatNumber(0, precision) : formatSigned(value, precision)}
      <Box component="span" sx={visuallyHidden}>{` since ${since}`}</Box>
    </Box>
  )
}

/** Four across, except on a phone and from `md` to `lg`, where the card shares its row with the next-scan card (~500 px). */
const cells = { xs: 2, sm: 4, md: 2, lg: 4 }

export function LatestScanCard({ scan }: { scan: ConfirmedScan }) {
  const r = scan.record
  const prev = scan.analysis?.vs_previous ?? null
  const since = prev ? formatShortDate(prev.date) : ''
  const delta = (v: number | undefined, precision: number, good: 'up' | 'down') => prev && <Delta value={v} precision={precision} good={good} since={since} />
  const outOfRange = r.body_fat_pct < BODY_FAT_RANGE.low || r.body_fat_pct > BODY_FAT_RANGE.high
  const guardAndLink = (
    <>
      <GuardChip change={prev} />
      <Button variant="text" size="small" component={RouterLink} to={`/scans/${scan.id}`} sx={{ ml: 'auto', mr: -2 }}>
        Open scan
      </Button>
    </>
  )
  return (
    <Panel
      title={`Latest scan · ${scanDay(scan.date)}`}
      description={
        <>
          {[prev ? `${prev.days} days after ${since}` : 'The baseline', formatClock(r.scanned_at), r.conditions.time_of_day, 'confirmed by you'].join(' · ')}
          {/* On a phone the chip and the link drop under the description, so the title keeps the card's width. */}
          <Box component="span" sx={{ display: { xs: 'flex', sm: 'none' }, alignItems: 'center', gap: 2, mt: 2 }}>
            {guardAndLink}
          </Box>
        </>
      }
      actions={<Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 2 }}>{guardAndLink}</Box>}
      padding="none"
    >
      <KeyStatGrid ruleAbove rule="hairline" columns={cells}>
        <KeyStat
          size={tokens.font.size.bigNumberSmall}
          countUp
          label="Weight"
          value={r.weight_kg}
          precision={1}
          unit="kg"
          trailing={delta(prev?.fat_vs_lean.weight_kg, 1, 'down')}
        />
        <KeyStat
          size={tokens.font.size.bigNumberSmall}
          countUp
          label="Body fat"
          value={r.body_fat_pct}
          precision={1}
          unit="%"
          trailing={delta(prev?.deltas.body_fat_pct, 1, 'down')}
          note={`range ${BODY_FAT_RANGE.low}–${BODY_FAT_RANGE.high} %`}
          noteTone={outOfRange ? 'warning' : undefined}
        />
        <KeyStat
          size={tokens.font.size.bigNumberSmall}
          countUp
          label="Lean mass"
          value={r.lean_body_mass_kg}
          precision={1}
          unit="kg"
          trailing={delta(prev?.fat_vs_lean.lean_kg, 1, 'up')}
          note={`${formatNumber(r.skeletal_muscle_mass_kg, 1)} kg skeletal muscle`}
        />
        <KeyStat
          size={tokens.font.size.bigNumberSmall}
          countUp
          label="Visceral level"
          value={r.visceral_fat_level}
          trailing={delta(prev?.deltas.visceral_fat_level, 0, 'down')}
          note={`target ${TARGETS.visceralLevel} or lower`}
          noteTone={r.visceral_fat_level > TARGETS.visceralLevel ? 'warning' : undefined}
        />
      </KeyStatGrid>
      <KeyStatGrid ruleAbove rule="hairline" dense columns={cells}>
        <KeyStat size={tokens.font.size.small} label="Visceral fat" value={`${formatNumber(r.visceral_fat_kg, 1)} kg · ${formatNumber(r.visceral_fat_area_cm2)} cm²`} />
        <KeyStat size={tokens.font.size.small} label="Subcutaneous fat" value={`${formatNumber(r.subcutaneous_fat_kg, 1)} kg`} />
        <KeyStat size={tokens.font.size.small} label="BMR · TEE" value={`${formatNumber(r.bmr_kcal)} · ${formatNumber(r.tee_kcal)} kcal`} />
        <KeyStat size={tokens.font.size.small} label="Waist-to-hip · bio age" value={`${formatNumber(r.waist_hip_ratio, 2)} · ${formatNumber(r.bio_age)}`} />
      </KeyStatGrid>
    </Panel>
  )
}

export function CompositionCard({ scans }: { scans: readonly ConfirmedScan[] }) {
  return (
    <Panel
      title="Fat and lean mass"
      titleSize="card"
      description={`Per scan · the plan expects fat to carry the loss; lean should hold near ${formatNumber(TARGETS.leanMassKg)} kg at goal`}
      actions={
        <LegendChips
          dense
          items={[
            { label: 'Fat', color: tokens.metric.fatMass },
            { label: 'Lean', color: tokens.metric.lean },
            { label: `Fat at goal ${formatNumber(TARGETS.fatMassKg, 1)}`, color: tokens.metric.fatMass, mark: 'dashed' },
          ]}
        />
      }
    >
      <BodyCompositionChart scans={compositionSeries(scans)} fatTarget={TARGETS.fatMassKg} height={240} legend={false} />
    </Panel>
  )
}

/** The mock's reading order: the torso first, then legs, then arms. */
const SEGMENT_ORDER: ScanSegment[] = ['torso', 'left_leg', 'right_leg', 'left_arm', 'right_arm']
/** Sheet precision: two decimals under 10 kg ("7.54"), one above ("27.7"). */
const segmentKg = (v: number) => `${formatNumber(v, v < 10 ? 2 : 1)} kg`

export function SegmentsCard({ scan }: { scan: ConfirmedScan }) {
  const segments = scan.record.segments
  return (
    <Panel
      title="Segments"
      titleSize="card"
      description={`Lean and fat per limb · torso fat target under ${formatNumber(TARGETS.torsoFatKg, 1)} kg`}
      // The table carries the numbers; the figure only shows where the fat sits.
      actions={
        <Box aria-hidden sx={{ width: 64, mt: '-6px', mb: '-10px', lineHeight: 0 }}>
          <MuscleMap levels={segmentFatLevels(scan.record)} view="front" size={64} scale="fat" body="light" />
        </Box>
      }
      padding="none"
    >
      <Table sx={{ '& th': { borderTop: 0, py: '6px' }, '& td': { py: '8px' }, mb: '10px' }}>
        <TableHead>
          <TableRow>
            <TableCell>Segment</TableCell>
            <TableCell align="right">Lean</TableCell>
            <TableCell align="right">Fat</TableCell>
            <TableCell align="right">Fat share</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {SEGMENT_ORDER.map((s) => {
            const share = fatShare(segments[s])
            return (
              <TableRow key={s}>
                <TableCell>{SEGMENT_LABEL[s]}</TableCell>
                <TableCell align="right">{segmentKg(segments[s].lean_kg)}</TableCell>
                <TableCell align="right" sx={{ fontWeight: tokens.font.weight.heading }}>
                  {segmentKg(segments[s].fat_kg)}
                </TableCell>
                <TableCell align="right">
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    <Box sx={{ width: 70, display: { xs: 'none', sm: 'block' } }}>
                      <ProgressBar value={share} color={tokens.muscleMap.fatSteps[3]} label={`${SEGMENT_LABEL[s]} fat share`} />
                    </Box>
                    {formatNumber(share * 100)} %
                  </Box>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Panel>
  )
}

function Well({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ ...wellSurface, p: '10px', minWidth: 0 }}>
      <Box sx={{ fontSize: tokens.font.size.micro, lineHeight: tokens.font.leading.micro, color: tokens.ink.muted }}>{label}</Box>
      <Box sx={{ fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.heading, ...tabularNums }}>{value}</Box>
    </Box>
  )
}

export function WaterCard({ scan }: { scan: ConfirmedScan }) {
  const r = scan.record
  return (
    <Panel title="Water and minerals" titleSize="card" padding="dense">
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px' }}>
        <Well label="Total body water" value={`${formatNumber(r.total_body_water_kg, 1)} kg`} />
        <Well label="ICF · ECF" value={`${formatNumber(r.icf_kg, 1)} · ${formatNumber(r.ecf_kg, 1)}`} />
        <Well label="Protein · mineral" value={`${formatNumber(r.protein_kg, 1)} · ${formatNumber(r.mineral_kg, 1)} kg`} />
      </Box>
      <Box sx={{ mt: '10px', fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.body, color: tokens.ink.muted }}>
        A lean-mass drop that comes with a matching water drop is flagged as hydration, not muscle.
      </Box>
    </Panel>
  )
}
