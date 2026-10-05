// Owns: the scans list (/scans) — when the next scan is due (the server's schedule: a date the coach or a week plan
// set, else the last scan + the settings interval) with Upload and
// Enter-by-hand, sheets waiting for review, the latest scan's headline numbers with their changes, fat vs lean across
// scans, and every scan with its fat and lean change and the lean-loss guard.
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import type { Scan, ScanSchedule } from '@fitness/shared/schemas'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { BodyCompositionChart } from '../../../charts'
import { ChartCard, EmptyState, formatNumber, formatSigned, SectionHeader, StatCard } from '../../../components'
import { tokens } from '../../../theme'
import { todayLocal } from '../../quick-log'
import { useScans, useScanSchedule } from './hooks'
import { compositionSeries, confirmedScans, TARGETS } from './series'
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

function Row({ title, subtitle, chip, onClick }: { title: string; subtitle: string; chip?: ReactNode; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{ display: 'flex', width: '100%', textAlign: 'left', alignItems: 'center', gap: 2, px: 4, py: 2.5, minHeight: tokens.tapTarget, borderTop: `1px solid ${tokens.ink.border}`, font: 'inherit', color: 'inherit' }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ fontWeight: tokens.font.weight.label }}>{title}</Box>
        <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>{subtitle}</Box>
      </Box>
      {chip}
      <ChevronRightRounded sx={{ color: 'text.secondary' }} aria-hidden />
    </ButtonBase>
  )
}

function DueCard({ schedule, onUpload, onManual }: { schedule: ScanSchedule | undefined; onUpload: () => void; onManual: () => void }) {
  const due = schedule?.due ?? null
  const interval = schedule?.interval_days ?? 28
  const today = todayLocal()
  const left = due ? daysBetween(today, due) : null
  const status = left === null ? 'No scan yet' : left > 0 ? `in ${left} ${left === 1 ? 'day' : 'days'}` : left === 0 ? 'today' : `${-left} ${left === -1 ? 'day' : 'days'} overdue`
  return (
    <Card sx={{ p: 4 }} data-testid="scan-due">
      <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary' }}>Next scan</Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, flexWrap: 'wrap', mt: 0.5 }}>
        <Box sx={{ fontSize: tokens.font.size.bigNumberSmall, fontWeight: tokens.font.weight.number, fontVariantNumeric: 'tabular-nums' }}>{due ?? '—'}</Box>
        <Chip size="small" label={status} color={left !== null && left <= 0 ? 'warning' : 'default'} variant={left !== null && left <= 0 ? 'filled' : 'outlined'} />
      </Box>
      <Box sx={{ fontSize: tokens.font.size.label, color: 'text.secondary', mt: 1 }}>
        {schedule?.source === 'scheduled' ? 'Scheduled by your plan' : `Every ${interval} days`}, same conditions: morning, fasted, no training the day before.
      </Box>
      <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<UploadFileRounded />} onClick={onUpload} data-testid="scan-upload-open">
          Upload sheet
        </Button>
        <Button onClick={onManual}>Enter by hand</Button>
      </Box>
    </Card>
  )
}

export function ScansPage() {
  const navigate = useNavigate()
  const scans = useScans()
  const schedule = useScanSchedule()
  const [uploading, setUploading] = useState(false)

  if (scans.isPending)
    return (
      <Stack spacing={4}>
        <Skeleton variant="rounded" height={160} />
        <Skeleton variant="rounded" height={240} />
      </Stack>
    )
  if (!scans.data) return <Alert severity="error">{problemText(scans.error)}</Alert>

  const confirmed = confirmedScans(scans.data)
  const waiting = scans.data.filter((s) => !s.confirmed)
  const latest = confirmed.at(-1)
  const prev = latest?.analysis?.vs_previous ?? null

  return (
    <Stack spacing={4} data-testid="scans-page">
      <DueCard schedule={schedule.data} onUpload={() => setUploading(true)} onManual={() => void navigate('/scans/new')} />

      {waiting.length > 0 && (
        <Card sx={{ pt: 3 }}>
          <Box sx={{ px: 4, pb: 2, fontWeight: tokens.font.weight.heading }}>Waiting for review</Box>
          {waiting.map((s) => (
            <Row key={s.id} title={`Uploaded ${s.date}`} subtitle={pendingLabel(s)} onClick={() => void navigate(`/scans/${s.id}`)} />
          ))}
        </Card>
      )}

      {latest ? (
        <>
          <SectionHeader title={`Latest scan, ${latest.date}`} subtitle={prev ? `Changes since ${prev.date}` : 'The baseline'} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 3 }}>
            <StatCard label="Weight" value={latest.record.weight_kg} unit="kg" precision={1} metric="weight" delta={prev ? { value: prev.fat_vs_lean.weight_kg, good: 'down' } : undefined} onClick={() => void navigate(`/scans/${latest.id}`)} />
            <StatCard label="Body fat" value={latest.record.body_fat_pct} unit="%" precision={1} metric="fatMass" delta={prev?.deltas.body_fat_pct !== undefined ? { value: prev.deltas.body_fat_pct, good: 'down' } : undefined} />
            <StatCard label="Lean mass" value={latest.record.lean_body_mass_kg} unit="kg" precision={1} metric="lean" delta={prev ? { value: prev.fat_vs_lean.lean_kg, good: 'up' } : undefined} />
            <StatCard label="Visceral level" value={latest.record.visceral_fat_level} metric="fatMass" delta={prev?.deltas.visceral_fat_level !== undefined ? { value: prev.deltas.visceral_fat_level, good: 'down' } : undefined} footnote="Target 9 or lower" />
          </Box>
          {latest.analysis?.flags.some((f) => f.code === 'lean_loss') && (
            <Alert severity="error" data-testid="scan-flag-lean_loss">
              {latest.analysis.flags.find((f) => f.code === 'lean_loss')!.message}
            </Alert>
          )}
          <ChartCard title="Fat and lean mass" subtitle={`Per scan; fat target ${formatNumber(TARGETS.fatMassKg, 1)} kg at goal`}>
            <BodyCompositionChart scans={compositionSeries(confirmed)} fatTarget={TARGETS.fatMassKg} height={200} />
          </ChartCard>
          <Card sx={{ pt: 3 }} data-testid="scan-history">
            <Box sx={{ px: 4, pb: 2, fontWeight: tokens.font.weight.heading }}>Every scan</Box>
            {[...confirmed].reverse().map((s) => {
              const p = s.analysis?.vs_previous
              const subtitle = p
                ? `${formatNumber(s.record.weight_kg, 1)} kg · fat ${formatSigned(p.fat_vs_lean.fat_kg, 1)} · lean ${formatSigned(p.fat_vs_lean.lean_kg, 1)} kg`
                : `${formatNumber(s.record.weight_kg, 1)} kg · ${formatNumber(s.record.body_fat_pct, 1)} % fat · baseline`
              const guard = p?.lean_loss === 'lean_loss' ? <Chip size="small" color="error" label="Lean loss" /> : p?.lean_loss === 'hydration' ? <Chip size="small" variant="outlined" label="Water shift" /> : undefined
              return <Row key={s.id} title={s.date} subtitle={subtitle} chip={guard} onClick={() => void navigate(`/scans/${s.id}`)} />
            })}
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState title="No scans yet" body="Upload the Evolt 360 result sheet and the values are read for you to check." illustration="progress" />
        </Card>
      )}

      <UploadSheet open={uploading} onClose={() => setUploading(false)} onUploaded={(r) => {
          setUploading(false)
          void navigate(`/scans/${r.scan.id}`)
        }} />
    </Stack>
  )
}
