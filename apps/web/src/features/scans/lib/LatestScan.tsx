// Owns: the scans list's cards about the confirmed scans (1d) — the latest scan's headline numbers (weight, body fat
// against Evolt's range, lean mass with its skeletal muscle, visceral level against its target) over a strip of the
// other fat and energy readings, both in cells that wrap at 130 px (README §4); fat and lean mass across scans, with the
// next scan's empty slot, against the SPEC §3 goal (a size container); the segments table, scrolling sideways on a phone, with each segment's fat share
// beside the fat-share muscle map; water and minerals in tinted wells; and the lean-loss guard chip they share.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import type { ScanChange, ScanSegment } from '@fitness/shared/schemas'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import {
  deltaTone,
  formatClock,
  formatNumber,
  formatShortDate,
  formatSigned,
  KeyStat,
  Panel,
  StatusChip,
  TableScroll,
  tabularNums,
  visuallyHidden,
} from '../../../components'
import { copy } from '../../../copy'
import { MuscleMap } from '../../../muscle-map'
import { tokens } from '../../../theme'
import { FatLeanChart, fatLeanBars } from './FatLeanChart'
import { scanDay } from './format'
import {
  BODY_FAT_RANGE,
  fatShare,
  SEGMENT_LABEL,
  segmentFatLevels,
  TARGETS,
  type ConfirmedScan,
} from './series'

const hairline = `1px solid ${tokens.ink.hairline}`

/**
 * The lean-loss guard of a scan against the one before it (1d): Lean held teal, Lean loss red, Water shift violet; the
 * first scan is the Baseline.
 */
export function GuardChip({
  change,
  size = 'medium',
}: {
  change: ScanChange | null
  size?: 'medium' | 'small'
}) {
  if (!change) return <StatusChip size={size} label="Baseline" />
  if (change.lean_loss === 'lean_loss') return <StatusChip size={size} tone="danger" label="Lean loss" />
  if (change.lean_loss === 'hydration') return <StatusChip size={size} tone="info" label="Water shift" />
  return <StatusChip size={size} tone="success" label="Lean held" />
}

/** The change since the previous scan beside a value, in the kit's delta tone: green the good way, amber not. */
function Delta({
  value,
  precision,
  good,
  since,
}: {
  value: number | undefined
  precision: number
  good: 'up' | 'down'
  since: string
}) {
  if (value === undefined) return null
  const flat = Math.abs(value) < 10 ** -precision / 2
  const colour = tokens.tone[deltaTone({ value, good }, precision)].text
  return (
    <Box
      component="span"
      sx={{
        fontFamily: tokens.font.family,
        fontSize: tokens.font.size.caption,
        fontWeight: tokens.font.weight.heading,
        letterSpacing: 0,
        color: colour,
      }}
    >
      {flat ? formatNumber(0, precision) : formatSigned(value, precision)}
      <Box component="span" sx={visuallyHidden}>{` since ${since}`}</Box>
    </Box>
  )
}

/** README §4: the latest scan's cells wrap once each can't have 130 px. */
const CELL_BASIS = 130

/**
 * A strip of cells divided by hairlines that wrap at 130 px: every cell carries a right and a bottom rule and the strip
 * clips the ones on its outer edges, so only the rules between cells show, however they wrap.
 */
function CellStrip({ children, dense = false }: { children: ReactNode; dense?: boolean }) {
  return (
    <Box sx={{ borderTop: hairline, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          mr: '-1px',
          mb: '-1px',
          '& > *': {
            flex: `100 1 ${CELL_BASIS}px`,
            minWidth: 0,
            px: `${tokens.pad.card.x}px`,
            py: dense ? '14px' : '18px',
            borderRight: hairline,
            borderBottom: hairline,
          },
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

/** One of the smaller readings under the headline numbers: an 11 px label over a 13/600 value. */
function Reading({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Box
        sx={{
          fontSize: tokens.font.size.micro,
          fontWeight: tokens.font.weight.heading,
          lineHeight: tokens.font.leading.micro,
          color: tokens.ink.muted,
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          mt: '2px',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.text,
          ...tabularNums,
        }}
      >
        {value}
      </Box>
    </Box>
  )
}

export function LatestScanCard({ scan }: { scan: ConfirmedScan }) {
  const r = scan.record
  const prev = scan.analysis?.vs_previous ?? null
  const since = prev ? formatShortDate(prev.date) : ''
  const delta = (v: number | undefined, precision: number, good: 'up' | 'down') =>
    prev && <Delta value={v} precision={precision} good={good} since={since} />
  const outOfRange = r.body_fat_pct < BODY_FAT_RANGE.low || r.body_fat_pct > BODY_FAT_RANGE.high
  const size = tokens.font.size.bigNumber
  return (
    <Panel
      title={`Latest scan · ${scanDay(scan.date)}`}
      description={[
        prev ? `${prev.days} days after ${since}` : 'The baseline',
        formatClock(r.scanned_at),
        r.conditions.time_of_day,
        'confirmed by you',
      ].join(' · ')}
      // The chip and the link wrap under the description on a narrow card (the header row wraps).
      actions={
        <>
          <GuardChip change={prev} />
          <Button variant="text" size="small" component={RouterLink} to={`/scans/${scan.id}`} sx={{ mr: -2 }}>
            Open scan
          </Button>
        </>
      }
      padding="none"
      fill
    >
      <CellStrip>
        <KeyStat
          size={size}
          countUp
          label="Weight"
          value={r.weight_kg}
          precision={1}
          unit="kg"
          trailing={delta(prev?.fat_vs_lean.weight_kg, 1, 'down')}
        />
        <KeyStat
          size={size}
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
          size={size}
          countUp
          label="Lean mass"
          value={r.lean_body_mass_kg}
          precision={1}
          unit="kg"
          trailing={delta(prev?.fat_vs_lean.lean_kg, 1, 'up')}
          note={`${formatNumber(r.skeletal_muscle_mass_kg, 1)} kg skeletal muscle`}
        />
        <KeyStat
          size={size}
          countUp
          label="Visceral level"
          value={r.visceral_fat_level}
          trailing={delta(prev?.deltas.visceral_fat_level, 0, 'down')}
          note={`target ${TARGETS.visceralLevel} or lower`}
          noteTone={r.visceral_fat_level > TARGETS.visceralLevel ? 'warning' : undefined}
        />
      </CellStrip>
      <CellStrip dense>
        <Reading
          label="Visceral fat"
          value={`${formatNumber(r.visceral_fat_kg, 1)} kg · ${formatNumber(r.visceral_fat_area_cm2)} cm²`}
        />
        <Reading label="Subcutaneous fat" value={`${formatNumber(r.subcutaneous_fat_kg, 1)} kg`} />
        <Reading label="BMR · TEE" value={`${formatNumber(r.bmr_kcal)} · ${formatNumber(r.tee_kcal)} kcal`} />
        <Reading
          label="Waist-to-hip · bio age"
          value={`${formatNumber(r.waist_hip_ratio, 2)} · ${formatNumber(r.bio_age)}`}
        />
      </CellStrip>
    </Panel>
  )
}

/** `next` is when the next scan is due (the schedule's `due`), drawn as an empty slot after the last scan. */
export function CompositionCard({ scans, next }: { scans: readonly ConfirmedScan[]; next: string | null }) {
  const bars = fatLeanBars(
    scans.map((s) => ({ date: s.date, fat: s.record.body_fat_mass_kg, lean: s.record.lean_body_mass_kg })),
    { fat: TARGETS.fatMassKg, lean: TARGETS.leanMassKg },
    next,
  )
  return (
    <Panel
      title="Fat and lean mass"
      description={`Per scan · fat carries the loss; lean holds near ${formatNumber(TARGETS.leanMassKg)} kg at the ${copy.goalLabel}`}
    >
      <FatLeanChart bars={bars} fatTarget={TARGETS.fatMassKg} />
    </Panel>
  )
}

/** The mock's reading order: the torso first, then legs, then arms. */
const SEGMENT_ORDER: ScanSegment[] = ['torso', 'left_leg', 'right_leg', 'left_arm', 'right_arm']
/** Sheet precision: two decimals under 10 kg ("7.54"), one above ("27.7"). */
const segmentKg = (v: number) => `${formatNumber(v, v < 10 ? 2 : 1)} kg`

/** 1d's table: 11/600 muted heads over 14 px rows, hairlines between, the card's gutter at both ends. */
const tableSx = {
  '& th': {
    fontSize: tokens.font.size.micro,
    fontWeight: tokens.font.weight.heading,
    color: tokens.ink.muted,
    py: '8px',
    borderTop: hairline,
    borderBottom: 0,
    whiteSpace: 'nowrap',
  },
  '& td': {
    fontSize: tokens.font.size.body,
    py: '10px',
    borderTop: hairline,
    borderBottom: 0,
  },
  '& tbody tr:last-of-type td': { pb: '14px' },
} as const

/** A segment's fat share as a 70 × 8 bar (the four-step coral scale's strongest step on its lightest). */
function ShareBar({ share }: { share: number }) {
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'block',
        width: 70,
        height: 8,
        flex: 'none',
        overflow: 'hidden',
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: tokens.muscleMap.fatSteps[0],
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'block',
          width: `${Math.min(1, Math.max(0, share)) * 100}%`,
          height: '100%',
          bgcolor: tokens.muscleMap.fatSteps[3],
        }}
      />
    </Box>
  )
}

export function SegmentsCard({ scan }: { scan: ConfirmedScan }) {
  const segments = scan.record.segments
  return (
    <Panel
      title="Segments"
      titleSize="card"
      headingComponent="h3"
      description={`Lean and fat per limb · torso fat target under ${formatNumber(TARGETS.torsoFatKg, 1)} kg`}
      // The table carries the numbers; the figure only shows where the fat sits.
      actions={
        <Box aria-hidden sx={{ width: 56, my: '-6px', lineHeight: 0 }}>
          <MuscleMap levels={segmentFatLevels(scan.record)} view="front" size={56} scale="fat" body="light" />
        </Box>
      }
      padding="none"
    >
      <TableScroll ariaLabel="Segments">
        <Table sx={tableSx}>
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
                  <TableCell sx={{ fontWeight: tokens.font.weight.body }}>{SEGMENT_LABEL[s]}</TableCell>
                  <TableCell align="right" sx={{ color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
                    {segmentKg(segments[s].lean_kg)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}
                  >
                    {segmentKg(segments[s].fat_kg)}
                  </TableCell>
                  <TableCell align="right">
                    <Box
                      component="span"
                      sx={{ display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}
                    >
                      <ShareBar share={share} />
                      {formatNumber(share * 100)} %
                    </Box>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableScroll>
    </Panel>
  )
}

/** One reading in a tinted well: water readings on the teal tint, the dry mass on the warm well. */
function Well({ label, value, tone }: { label: string; value: string; tone: 'water' | 'dry' }) {
  const water = tone === 'water'
  return (
    <Box
      sx={{
        px: '14px',
        py: '12px',
        minWidth: 0,
        borderRadius: `${tokens.radius.well}px`,
        bgcolor: water ? tokens.tone.success.bg : tokens.ink.panel,
      }}
    >
      <Box
        sx={{
          fontSize: tokens.font.size.micro,
          fontWeight: tokens.font.weight.heading,
          lineHeight: tokens.font.leading.micro,
          color: water ? tokens.tone.success.text : tokens.tone.warning.text,
        }}
      >
        {label}
      </Box>
      <Box
        sx={{
          mt: '4px',
          fontSize: tokens.font.size.emphasis,
          fontWeight: tokens.font.weight.heading,
          color: tokens.ink.text,
          ...tabularNums,
        }}
      >
        {value}
      </Box>
    </Box>
  )
}

export function WaterCard({ scan }: { scan: ConfirmedScan }) {
  const r = scan.record
  return (
    <Panel
      title="Water and minerals"
      titleSize="card"
      headingComponent="h3"
      caption="A lean-mass drop that comes with a matching water drop is flagged as hydration, not muscle."
    >
      {/* Three wells a line while each has 96 px, so a narrow card wraps them rather than squeezing the values. */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '10px', '& > *': { flex: '1 1 96px' } }}>
        <Well tone="water" label="Total body water" value={`${formatNumber(r.total_body_water_kg, 1)} kg`} />
        <Well
          tone="water"
          label="ICF · ECF"
          value={`${formatNumber(r.icf_kg, 1)} · ${formatNumber(r.ecf_kg, 1)}`}
        />
        <Well
          tone="dry"
          label="Protein · mineral"
          value={`${formatNumber(r.protein_kg, 1)} · ${formatNumber(r.mineral_kg, 1)} kg`}
        />
      </Box>
    </Panel>
  )
}
