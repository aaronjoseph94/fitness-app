// Owns: the scans list (/scans, 1d) — the hero with Enter by hand and the gold Upload sheet (both wrap under the title
// on a phone), sheets waiting for review, the deep-sky next-scan card (when it is due — the server's schedule: a date
// the coach or a week plan set, else the last scan + the settings interval — with its conditions checklist and the
// masking note) beside the latest scan's numbers (1 : 2), fat vs lean across scans (with the next scan's empty slot)
// beside its segments and water (1.3 : 1), and every scan with its fat and lean change and the lean-loss guard, in a table that scrolls sideways on
// a phone. Rows of cards wrap rather than squeeze (README §4).
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded'
import EditOutlined from '@mui/icons-material/EditOutlined'
import PieChartRounded from '@mui/icons-material/PieChartRounded'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Skeleton from '@mui/material/Skeleton'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import type { Scan, ScanSchedule } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import {
  Banner,
  DeepSkyCard,
  deepSkyWell,
  EmptyState,
  formatNumber,
  formatShortDate,
  formatSigned,
  isQueryLoading,
  ListRow,
  PageHeader,
  Panel,
  QueryStateCard,
  Reveal,
  StatusChip,
  staggerDelay,
  TableScroll,
  tabularNums,
  wrapCol,
  WrapRow,
} from '../../../components'
import { copy } from '../../../copy'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { shiftDate, todayLocal } from '../../quick-log'
import { conditionsLine, scanDay, weekdayDay } from './format'
import { useScans, useScanSchedule } from './hooks'
import { CompositionCard, GuardChip, LatestScanCard, SegmentsCard, WaterCard } from './LatestScan'
import { confirmedScans, type ConfirmedScan } from './series'
import { UploadSheet } from './UploadSheet'

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}

function pendingLabel(scan: Scan): string {
  if (scan.extracted) return 'Ready to check'
  const x = scan.extraction
  if (x && !x.error && (x.status === 'queued' || x.status === 'running')) return 'Extracting…'
  return "Couldn't read: enter by hand"
}

/** Days until the due date ("in 17 days", "today", "3 days overdue") and the count; `left` is null before the first scan. */
function dueIn(due: string | null): { text: string; left: number | null } {
  const left = due ? daysBetween(todayLocal(), due) : null
  if (left === null) return { text: 'No scan yet', left }
  if (left > 0) return { text: `in ${left} ${left === 1 ? 'day' : 'days'}`, left }
  if (left === 0) return { text: 'today', left }
  return { text: `${-left} ${left === -1 ? 'day' : 'days'} overdue`, left }
}

function DueCard({ schedule, scans }: { schedule: ScanSchedule | undefined; scans: number }) {
  const due = schedule?.due ?? null
  const interval = schedule?.interval_days ?? 28
  const status = dueIn(due)
  const why =
    schedule?.source === 'scheduled'
      ? 'Set by your plan.'
      : scans > 0
        ? `Every ${interval} days from ${scans === 1 ? copy.startLabel : 'the last scan'}.`
        : `The first scan is ${copy.startLabel}; then one every ${interval} days.`
  const checks = [
    'Morning, before breakfast',
    'Fasted, normal hydration',
    due ? `No training on ${formatShortDate(shiftDate(due, -1))}` : 'No training the day before',
  ]
  const late = status.left !== null && status.left <= 0
  return (
    <DeepSkyCard
      component="aside"
      eyebrow="Next scan"
      icon={<PieChartRounded aria-hidden sx={{ fontSize: 18, color: tokens.tone.success.light }} />}
      ariaLabel="Next scan"
      testId="scan-due"
    >
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px 10px' }}>
        <Box
          component="h2"
          id="scan-due-title"
          sx={{
            m: 0,
            fontFamily: tokens.font.display,
            fontSize: tokens.font.size.bigNumber,
            fontWeight: tokens.font.weight.display,
            letterSpacing: tokens.font.em.title,
            lineHeight: tokens.font.leading.number,
          }}
        >
          {due ? weekdayDay(due) : '—'}
        </Box>
        <Box
          component="span"
          sx={{
            px: '12px',
            py: '5px',
            borderRadius: `${tokens.radius.pill}px`,
            // Due or overdue: the gold that marks "now" on the deep sky; otherwise glass.
            ...(late
              ? { bgcolor: tokens.summit.gold.main, color: tokens.summit.ink.deep }
              : {
                  bgcolor: tokens.summit.glass.tile,
                  border: `1px solid ${tokens.summit.glass.tileBorder}`,
                }),
            fontSize: tokens.font.size.small,
            fontWeight: tokens.font.weight.heading,
            whiteSpace: 'nowrap',
          }}
        >
          {status.text}
        </Box>
      </Box>
      <Box
        sx={{
          mt: '12px',
          fontSize: tokens.font.size.body,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.body,
          color: tokens.summit.onSky.eyebrow,
        }}
      >
        {why} The coach can move it; the reminder fires that day with the conditions checklist.
      </Box>
      <Box
        component="ul"
        aria-label="Conditions"
        sx={{
          listStyle: 'none',
          m: 0,
          mt: '16px',
          p: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: '8px',
          fontSize: tokens.font.size.body,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.small,
        }}
      >
        {checks.map((c) => (
          <Box
            component="li"
            key={c}
            sx={{
              ...deepSkyWell,
              borderRadius: `${tokens.summit.radius.wellSmall}px`,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              px: '12px',
              py: '10px',
            }}
          >
            <CheckCircleRounded
              aria-hidden
              sx={{ fontSize: 20, color: tokens.tone.success.light, flex: 'none' }}
            />
            {c}
          </Box>
        ))}
      </Box>
      <Box
        sx={{
          mt: '16px',
          fontSize: tokens.font.size.small,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.body,
          color: tokens.summit.deepSky.muted,
        }}
      >
        Upload the sheet as PDF, PNG or JPG. Your name is masked on this device before anything leaves it; the
        values are read for you to check and confirm.
      </Box>
    </DeepSkyCard>
  )
}

const hairline = `1px solid ${tokens.ink.hairline}`
const dash = { color: tokens.ink.muted }

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
    py: '12px',
    borderTop: hairline,
    borderBottom: 0,
    ...tabularNums,
  },
  '& tbody tr:last-of-type td': { pb: '16px' },
  // The rows open their scan, so on touch each is a 44 px target.
  [COARSE_POINTER_QUERY]: { '& tbody td': { height: tokens.tapTarget } },
} as const

/** "Fri, Sep 26": the table scrolls sideways on a phone, so it keeps the weekday. */
function TableDate({ date }: { date: string }) {
  return <>{weekdayDay(date)}</>
}

function History({ scans, schedule }: { scans: ConfirmedScan[]; schedule: ScanSchedule | undefined }) {
  const navigate = useNavigate()
  const due = schedule?.due ?? null
  const left = dueIn(due).left
  return (
    <Panel
      title="Every scan"
      description="Fat and lean change against the previous scan, with the lean-loss guard"
      // The guard's three outcomes, as the rows show them (1d); they wrap under the title on a phone.
      actions={
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px' }}>
          <StatusChip tone="success" label="Lean held" />
          <StatusChip tone="danger" label="Lean loss" />
          <StatusChip tone="info" label="Water shift" />
        </Box>
      }
      padding="none"
      testId="scan-history"
    >
      <TableScroll ariaLabel="Every scan">
        <Table sx={tableSx}>
          <TableHead>
            <TableRow>
              <TableCell>Date</TableCell>
              <TableCell>Conditions</TableCell>
              <TableCell align="right">Weight</TableCell>
              <TableCell align="right">Body fat</TableCell>
              <TableCell align="right">Fat Δ</TableCell>
              <TableCell align="right">Lean Δ</TableCell>
              <TableCell align="right">Guard</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {due && (
              <TableRow sx={{ bgcolor: tokens.summit.surface.dashed.bg }}>
                <TableCell
                  sx={{
                    color: tokens.ink.muted,
                    fontWeight: tokens.font.weight.heading,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <TableDate date={due} />
                </TableCell>
                <TableCell sx={{ color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
                  Scheduled · reminder {formatShortDate(due)}
                </TableCell>
                <TableCell align="right" sx={dash}>
                  —
                </TableCell>
                <TableCell align="right" sx={dash}>
                  —
                </TableCell>
                <TableCell align="right" sx={dash}>
                  —
                </TableCell>
                <TableCell align="right" sx={dash}>
                  —
                </TableCell>
                <TableCell align="right">
                  {left !== null && left < 0 ? (
                    <StatusChip size="small" tone="warning" label="Overdue" />
                  ) : left === 0 ? (
                    <StatusChip size="small" tone="warning" label="Due today" />
                  ) : (
                    <StatusChip size="small" tone="dashed" label="Upcoming" />
                  )}
                </TableCell>
              </TableRow>
            )}
            {[...scans].reverse().map((s) => {
              const p = s.analysis?.vs_previous ?? null
              return (
                <TableRow
                  key={s.id}
                  hover
                  onClick={() => void navigate(`/scans/${s.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell sx={{ fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}>
                    <Box
                      component={RouterLink}
                      to={`/scans/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      sx={{
                        color: 'inherit',
                        textDecoration: 'none',
                        '&:hover': { textDecoration: 'underline' },
                        '&:focus-visible': {
                          outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
                          outlineOffset: `${tokens.focusRing.offset}px`,
                          borderRadius: `${tokens.radius.bar}px`,
                        },
                      }}
                    >
                      <TableDate date={s.date} />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
                    {conditionsLine(s.record.conditions, !p)}
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}
                  >
                    {formatNumber(s.record.weight_kg, 1)} kg
                  </TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}
                  >
                    {formatNumber(s.record.body_fat_pct, 1)} %
                  </TableCell>
                  <TableCell align="right" sx={p ? undefined : { color: tokens.ink.muted }}>
                    {p ? formatSigned(p.fat_vs_lean.fat_kg, 1) : '—'}
                  </TableCell>
                  <TableCell align="right" sx={p ? undefined : { color: tokens.ink.muted }}>
                    {p ? formatSigned(p.fat_vs_lean.lean_kg, 1) : '—'}
                  </TableCell>
                  <TableCell align="right">
                    <GuardChip change={p} size="small" />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableScroll>
      <Box
        sx={{
          px: `${tokens.pad.card.x}px`,
          pt: '12px',
          pb: '16px',
          borderTop: hairline,
          fontSize: tokens.font.size.caption,
          fontWeight: tokens.font.weight.body,
          lineHeight: tokens.font.leading.caption,
          color: tokens.ink.muted,
        }}
      >
        Lean loss: lean is over 25 % of the loss between scans. Water shift: a lean drop matched by a water
        drop.
      </Box>
    </Panel>
  )
}

/** The page's single column, which never grows past the viewport to fit a table or a chart. */
const page = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: `${tokens.rhythm.section}px`,
} as const
/** A Reveal that is a wrapping row's column and lets its card fill the row. */
const column = (ratio: number, basis?: number) =>
  ({ ...wrapCol(ratio, basis), display: 'flex', flexDirection: 'column' }) as const
/** README §4, Scans: next scan : latest scan 1 : 2 (the latest's basis 560 px), fat vs lean : segments 1.3 : 1. */
const LATEST_BASIS = 280

export function ScansPage() {
  const navigate = useNavigate()
  const scans = useScans()
  const schedule = useScanSchedule()
  const [uploading, setUploading] = useState(false)

  const title = 'Scans'
  const interval = schedule.data?.interval_days
  const subtitle = `Same conditions each time: morning, fasted, no training the day before${interval ? ` · every ${interval} days` : ''}`
  const confirmedCount = scans.data ? confirmedScans(scans.data).length : null
  const eyebrow = `Body · Evolt 360${
    confirmedCount === null
      ? ''
      : ` · ${confirmedCount === 0 ? 'no scans yet' : `${formatNumber(confirmedCount)} ${confirmedCount === 1 ? 'scan' : 'scans'} confirmed`}`
  }`

  // While the list loads or fails, only the title: Upload and Enter by hand appear with the list, as they always have.
  if (isQueryLoading(scans))
    return (
      <Box sx={page}>
        <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <WrapRow>
          <Skeleton
            variant="rounded"
            height={326}
            sx={{ ...wrapCol(1), borderRadius: `${tokens.radius.card}px` }}
          />
          <Skeleton
            variant="rounded"
            height={326}
            sx={{ ...wrapCol(2, LATEST_BASIS), borderRadius: `${tokens.radius.card}px` }}
          />
        </WrapRow>
        <Skeleton variant="rounded" height={380} sx={{ borderRadius: `${tokens.radius.card}px` }} />
      </Box>
    )
  if (!scans.data)
    return (
      <Box sx={page}>
        <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />
        <QueryStateCard query={scans} what="the scan list" />
      </Box>
    )

  const confirmed = confirmedScans(scans.data)
  const waiting = scans.data.filter((s) => !s.confirmed)
  const latest = confirmed.at(-1)
  const leanLoss = latest?.analysis?.flags.find((f) => f.code === 'lean_loss')

  return (
    <Box sx={page} data-testid="scans-page">
      <PageHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        action={
          <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => void navigate('/scans/new')}>
            Enter by hand
          </Button>
        }
        primaryAction={
          <Button
            variant="contained"
            color="gold"
            startIcon={<UploadFileOutlined />}
            onClick={() => setUploading(true)}
            data-testid="scan-upload-open"
          >
            Upload sheet
          </Button>
        }
      />

      {waiting.length > 0 && (
        <Reveal delay={staggerDelay(0, tokens.motion.stagger.card, 150)}>
          <Panel title="Waiting for review" padding="none">
            {waiting.map((s) => (
              <ListRow
                key={s.id}
                label={`Uploaded ${scanDay(s.date)}`}
                help={pendingLabel(s)}
                onClick={() => void navigate(`/scans/${s.id}`)}
              />
            ))}
          </Panel>
        </Reveal>
      )}

      <WrapRow align="flex-start">
        <Reveal delay={staggerDelay(1, tokens.motion.stagger.card, 150)} sx={column(1)}>
          <DueCard schedule={schedule.data} scans={confirmed.length} />
        </Reveal>
        <Reveal delay={staggerDelay(2, tokens.motion.stagger.card, 150)} sx={column(2, LATEST_BASIS)}>
          {latest ? (
            <LatestScanCard scan={latest} />
          ) : (
            <EmptyState
              title="No scans yet"
              body="Upload the Evolt 360 sheet; the values are read for you to check."
            />
          )}
        </Reveal>
      </WrapRow>

      {leanLoss && (
        <Banner tone="danger" title="Lean-loss guard" role="status" testId="scan-flag-lean_loss">
          {leanLoss.message}
        </Banner>
      )}

      {latest && (
        <>
          <WrapRow align="flex-start">
            <Reveal delay={staggerDelay(3, tokens.motion.stagger.card, 150)} sx={column(1.3)}>
              <CompositionCard scans={confirmed} next={schedule.data?.due ?? null} />
            </Reveal>
            <Reveal
              delay={staggerDelay(4, tokens.motion.stagger.card, 150)}
              sx={{ ...column(1), gap: `${tokens.summit.space.gap.tile}px` }}
            >
              <SegmentsCard scan={latest} />
              <WaterCard scan={latest} />
            </Reveal>
          </WrapRow>
          <Reveal delay={staggerDelay(5, tokens.motion.stagger.card, 150)}>
            <History scans={confirmed} schedule={schedule.data} />
          </Reveal>
        </>
      )}

      <UploadSheet
        open={uploading}
        onClose={() => setUploading(false)}
        onUploaded={(r) => {
          setUploading(false)
          void navigate(`/scans/${r.scan.id}`)
        }}
      />
    </Box>
  )
}
