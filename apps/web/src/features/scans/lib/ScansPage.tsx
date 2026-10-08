// Owns: the scans list (/scans) — when the next scan is due (the server's schedule: a date the coach or a week plan
// set, else the last scan + the settings interval) with its conditions checklist, Upload and Enter-by-hand, sheets
// waiting for review, the latest scan's numbers, fat vs lean across scans, its segments and water, and every scan
// with its fat and lean change and the lean-loss guard.
import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EventOutlined from '@mui/icons-material/EventOutlined'
import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined'
import Alert from '@mui/material/Alert'
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
  EmptyState,
  formatNumber,
  formatShortDate,
  formatSigned,
  ListRow,
  PageHeader,
  Panel,
  panelSurface,
  Reveal,
  StatusChip,
  staggerDelay,
  tabularNums,
} from '../../../components'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import { shiftDate, todayLocal } from '../../quick-log'
import { conditionsLine, scanDay, weekdayDay } from './format'
import { useScans, useScanSchedule } from './hooks'
import { CompositionCard, GuardChip, LatestScanCard, SegmentsCard, WaterCard } from './LatestScan'
import { confirmedScans, type ConfirmedScan } from './series'
import { UploadSheet } from './UploadSheet'
import { problemText } from '../../../api'

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
        ? `Every ${interval} days from the ${scans === 1 ? 'baseline' : 'last scan'}.`
        : `The first scan is the baseline; then one every ${interval} days.`
  const checks = ['Morning, before breakfast', 'Fasted, normal hydration', due ? `No training on ${formatShortDate(shiftDate(due, -1))}` : 'No training the day before']
  return (
    <Box component="section" aria-labelledby="scan-due-title" data-testid="scan-due" sx={{ ...panelSurface, px: '22px', py: '20px', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: tokens.ink.label }}>
        <EventOutlined aria-hidden sx={{ fontSize: 16, color: tokens.ink.faint }} />
        <Box component="h2" id="scan-due-title" sx={{ m: 0, fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, lineHeight: tokens.font.leading.label }}>
          Next scan
        </Box>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px 10px', mt: '10px' }}>
        <Box sx={{ fontSize: tokens.font.size.bigNumber, fontWeight: tokens.font.weight.number, letterSpacing: tokens.font.em.number, lineHeight: 1, ...tabularNums }}>
          {due ? weekdayDay(due) : '—'}
        </Box>
        <StatusChip shape="pill" tone={status.left !== null && status.left <= 0 ? 'warning' : 'outline'} label={status.text} />
      </Box>
      <Box sx={{ mt: '10px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.muted }}>
        {why} The coach can move it; the reminder fires that day with the conditions checklist.
      </Box>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: '14px', p: 0, display: 'grid', gap: '6px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small }}>
        {checks.map((c) => (
          <Box component="li" key={c} sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <CheckCircleOutlineRounded aria-hidden sx={{ fontSize: 16, color: tokens.tone.success.solid }} />
            {c}
          </Box>
        ))}
      </Box>
      <Box sx={{ mt: 4, pt: '14px', borderTop: `1px solid ${tokens.ink.border}`, fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.muted }}>
        Upload the sheet as PDF, PNG or JPG. Your name is masked on this device before anything leaves it; the values are read for you to check and
        confirm.
      </Box>
    </Box>
  )
}

/** Hidden on a phone, where the table keeps date, weight, the two changes and the guard. */
const wide = { display: { xs: 'none', sm: 'table-cell' } } as const
const dash = { color: tokens.ink.faint }

/** "Sep 26, 2026"; "Sep 26" on a phone, where the table is narrow. */
function TableDate({ date }: { date: string }) {
  return (
    <>
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {scanDay(date)}
      </Box>
      <Box component="span" sx={{ display: { sm: 'none' } }}>
        {formatShortDate(date)}
      </Box>
    </>
  )
}

function History({ scans, schedule }: { scans: ConfirmedScan[]; schedule: ScanSchedule | undefined }) {
  const navigate = useNavigate()
  const due = schedule?.due ?? null
  const left = dueIn(due).left
  const about = 'Fat and lean change against the previous scan, with the lean-loss guard'
  return (
    <Panel
      title="Every scan"
      // Right of the title on a wider screen (2a); under it on a phone, where it has to wrap.
      description={<Box component="span" sx={{ display: { sm: 'none' } }}>{about}</Box>}
      actions={<Box sx={{ display: { xs: 'none', sm: 'block' }, fontSize: tokens.font.size.small, color: tokens.ink.muted }}>{about}</Box>}
      padding="none"
      testId="scan-history"
    >
      <Table
        sx={{
          '& th': { whiteSpace: 'nowrap' },
          // 2a: inner cells sit flush (the theme keeps the 20 px gutters on the first and last cells); 6 px on a phone.
          '& th, & td': { px: { xs: '6px', sm: 0 } },
          '& td': { py: '10px' },
          // The rows open their scan, so on touch each is a 44 px target.
          [COARSE_POINTER_QUERY]: { '& tbody td': { height: tokens.tapTarget } },
        }}
      >
        <TableHead>
          <TableRow>
            <TableCell>Date</TableCell>
            <TableCell sx={wide}>Conditions</TableCell>
            <TableCell align="right">Weight</TableCell>
            <TableCell align="right" sx={wide}>
              Body fat
            </TableCell>
            <TableCell align="right">Fat Δ</TableCell>
            <TableCell align="right">Lean Δ</TableCell>
            <TableCell align="right">Guard</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {due && (
            <TableRow sx={{ bgcolor: tokens.ink.panel }}>
              <TableCell sx={{ color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
                <TableDate date={due} />
              </TableCell>
              <TableCell sx={{ ...wide, color: tokens.ink.muted }}>Scheduled · reminder {formatShortDate(due)}</TableCell>
              <TableCell align="right" sx={dash}>—</TableCell>
              <TableCell align="right" sx={{ ...wide, ...dash }}>—</TableCell>
              <TableCell align="right" sx={dash}>—</TableCell>
              <TableCell align="right" sx={dash}>—</TableCell>
              <TableCell align="right">
                {left !== null && left < 0 ? (
                  <StatusChip size="small" tone="warning" label="Overdue" />
                ) : left === 0 ? (
                  <StatusChip size="small" tone="warning" label="Due today" />
                ) : (
                  <Box component="span" sx={{ px: '7px', py: '1px', borderRadius: `${tokens.radius.badge}px`, border: `1px dashed ${tokens.ink.dashed}`, fontSize: tokens.font.size.micro, color: tokens.ink.muted, whiteSpace: 'nowrap' }}>
                    Upcoming
                  </Box>
                )}
              </TableCell>
            </TableRow>
          )}
          {[...scans].reverse().map((s) => {
            const p = s.analysis?.vs_previous ?? null
            return (
              <TableRow key={s.id} hover onClick={() => void navigate(`/scans/${s.id}`)} sx={{ cursor: 'pointer' }}>
                <TableCell sx={{ fontWeight: tokens.font.weight.heading, whiteSpace: 'nowrap' }}>
                  <Box
                    component={RouterLink}
                    to={`/scans/${s.id}`}
                    onClick={(e) => e.stopPropagation()}
                    sx={{
                      color: 'inherit',
                      textDecoration: 'none',
                      '&:hover': { textDecoration: 'underline' },
                      '&:focus-visible': { outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`, outlineOffset: `${tokens.focusRing.offset}px`, borderRadius: `${tokens.radius.bar}px` },
                    }}
                  >
                    <TableDate date={s.date} />
                  </Box>
                </TableCell>
                <TableCell sx={{ ...wide, color: tokens.ink.label }}>{conditionsLine(s.record.conditions, !p)}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatNumber(s.record.weight_kg, 1)} kg</TableCell>
                <TableCell align="right" sx={{ ...wide, whiteSpace: 'nowrap' }}>
                  {formatNumber(s.record.body_fat_pct, 1)} %
                </TableCell>
                <TableCell align="right" sx={p ? undefined : { color: tokens.ink.muted }}>{p ? formatSigned(p.fat_vs_lean.fat_kg, 1) : '—'}</TableCell>
                <TableCell align="right" sx={p ? undefined : { color: tokens.ink.muted }}>{p ? formatSigned(p.fat_vs_lean.lean_kg, 1) : '—'}</TableCell>
                <TableCell align="right">
                  <GuardChip change={p} size="small" />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', px: `${tokens.pad.card.x}px`, pt: '12px', pb: '14px', borderTop: `1px solid ${tokens.ink.hairline}`, fontSize: tokens.font.size.caption, color: tokens.ink.muted }}>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <StatusChip size="small" tone="danger" label="Lean loss" />
          lean is over 25 % of the loss between scans
        </Box>
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
          <StatusChip size="small" tone="outline" label="Water shift" />a lean drop matched by a water drop
        </Box>
      </Box>
    </Panel>
  )
}

/** Row 1 (2a): the next-scan panel beside the latest scan, 1 : 2 from `md`; stacked below. */
const row1 = { display: 'grid', gap: 4, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 2fr)' } } as const
/** Row 2: fat and lean mass beside segments + water, 1.3 : 1 from `lg`. */
const row2 = { display: 'grid', gap: 4, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1.3fr) minmax(0, 1fr)' } } as const
/** A Reveal that is a grid item and lets its card fill the row. */
const cell = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', minWidth: 0 } as const
/** The page's single column, which never grows past the viewport to fit a table or a chart. */
const page = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 5 } as const

export function ScansPage() {
  const navigate = useNavigate()
  const scans = useScans()
  const schedule = useScanSchedule()
  const [uploading, setUploading] = useState(false)

  const title = 'Evolt 360 scans'
  const subtitle = 'Body composition every 4–6 weeks, same conditions each time: morning, fasted, no training the day before'

  // While the list loads or fails, only the title: Upload and Enter by hand appear with the list, as they always have.
  if (scans.isPending)
    return (
      <Box sx={page}>
        <PageHeader title={title} subtitle={subtitle} />
        <Box sx={row1}>
          <Skeleton variant="rounded" height={326} />
          <Skeleton variant="rounded" height={326} sx={{ display: { xs: 'none', md: 'block' } }} />
        </Box>
        <Skeleton variant="rounded" height={380} />
      </Box>
    )
  if (!scans.data)
    return (
      <Box sx={page}>
        <PageHeader title={title} subtitle={subtitle} />
        <Alert severity="error">{problemText(scans.error)}</Alert>
      </Box>
    )

  const confirmed = confirmedScans(scans.data)
  const waiting = scans.data.filter((s) => !s.confirmed)
  const latest = confirmed.at(-1)
  const leanLoss = latest?.analysis?.flags.find((f) => f.code === 'lean_loss')

  return (
    <Box sx={page} data-testid="scans-page">
      <PageHeader
        title={title}
        subtitle={subtitle}
        action={
          <>
            <Button variant="outlined" startIcon={<EditOutlined />} onClick={() => void navigate('/scans/new')}>
              Enter by hand
            </Button>
            <Button variant="contained" startIcon={<UploadFileOutlined />} onClick={() => setUploading(true)} data-testid="scan-upload-open">
              Upload sheet
            </Button>
          </>
        }
      />

      {waiting.length > 0 && (
        <Reveal delay={staggerDelay(0, tokens.motion.stagger.card, 150)}>
          <Panel title="Waiting for review" padding="none">
            {waiting.map((s) => (
              <ListRow key={s.id} label={`Uploaded ${scanDay(s.date)}`} help={pendingLabel(s)} onClick={() => void navigate(`/scans/${s.id}`)} />
            ))}
          </Panel>
        </Reveal>
      )}

      <Box sx={row1}>
        <Reveal delay={staggerDelay(1, tokens.motion.stagger.card, 150)} sx={cell}>
          <DueCard schedule={schedule.data} scans={confirmed.length} />
        </Reveal>
        <Reveal delay={staggerDelay(2, tokens.motion.stagger.card, 150)} sx={cell}>
          {latest ? (
            <LatestScanCard scan={latest} />
          ) : (
            <EmptyState title="No scans yet" body="Upload the Evolt 360 sheet; the values are read for you to check." />
          )}
        </Reveal>
      </Box>

      {leanLoss && (
        <Banner tone="danger" title="Lean-loss guard" role="status" testId="scan-flag-lean_loss">
          {leanLoss.message}
        </Banner>
      )}

      {latest && (
        <>
          <Box sx={row2}>
            <Reveal delay={staggerDelay(3, tokens.motion.stagger.card, 150)} sx={cell}>
              <CompositionCard scans={confirmed} />
            </Reveal>
            <Reveal delay={staggerDelay(4, tokens.motion.stagger.card, 150)} sx={{ ...cell, gap: 4 }}>
              <SegmentsCard scan={latest} />
              <WaterCard scan={latest} />
            </Reveal>
          </Box>
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
