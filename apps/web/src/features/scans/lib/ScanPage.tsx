// Owns: one scan (/scans/:id; /scans/new is manual entry). Unconfirmed: "Extracting…" while the sheet is read, then
// the review form (or manual entry when reading failed). Confirmed: the headline numbers with changes, the lean-loss
// guard and other call-outs, the debrief with its milestone updates and proposals, the scan charts, and every value
// against the previous scan and the baseline; "Edit values" re-confirms, "Delete this scan" (at the foot) removes a
// wrong scan after a confirm.
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded'
import Alert from '@mui/material/Alert'
import AlertTitle from '@mui/material/AlertTitle'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Skeleton from '@mui/material/Skeleton'
import Stack from '@mui/material/Stack'
import type { Scan, ScanFlag } from '@fitness/shared/schemas'
import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { SectionHeader, StatCard } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf, todayLocal } from '../../quick-log'
import { DeleteScanDialog } from './DeleteScanDialog'
import { DeltaTable } from './DeltaTable'
import { formFrom } from './form'
import { useDiscardScan, useReextractScan, useScan, useScans, useScanSettings } from './hooks'
import { ReviewForm } from './ReviewForm'
import { ScanCharts } from './ScanCharts'
import { confirmedScans, type ConfirmedScan } from './series'
import { problemText } from '../../../api'

const SEVERITY: Record<ScanFlag['code'], 'error' | 'warning' | 'info'> = {
  lean_loss: 'error',
  fat_gain: 'warning',
  visceral_up: 'warning',
  water_shift: 'info',
  conditions_mismatch: 'info',
  other: 'info',
}
const FLAG_TITLE: Record<ScanFlag['code'], string> = {
  lean_loss: 'Lean-loss guard',
  fat_gain: 'Fat gain',
  visceral_up: 'Visceral fat up',
  water_shift: 'Water shift',
  conditions_mismatch: 'Conditions differ',
  other: 'Note',
}

/** Height, age and sex for a blank form: the latest confirmed scan, else the profile. */
function useFallback() {
  const scans = useScans()
  const settings = useScanSettings()
  const latest = confirmedScans(scans.data ?? []).at(-1)?.record
  const now = new Date()
  return {
    /** The form keeps its first values, so wait for these reads (or their failure) before showing it. */
    ready: !scans.isPending && !settings.isPending,
    date: todayLocal(now),
    time: clockOf(now),
    height_cm: latest?.height_cm ?? settings.data?.profile.height_cm ?? null,
    age: latest?.age ?? null,
    sex: latest?.sex ?? settings.data?.profile.sex ?? null,
  }
}

function SheetLink({ scan }: { scan: Scan }) {
  if (!scan.sheet_url) return null
  return (
    <Button component="a" href={scan.sheet_url} target="_blank" rel="noopener" size="small" endIcon={<OpenInNewRounded />}>
      View sheet
    </Button>
  )
}

/** Plain words for a failed read (the router lists every provider it tried). */
function readError(error: string | null): string {
  if (!error) return "The sheet couldn't be read."
  if (/no_key/.test(error) && !/(quota|rate_limited|server|timeout|invalid_output)/.test(error)) return 'No AI provider is set up to read sheets yet.'
  if (/quota|rate_limited/.test(error)) return 'The free AI providers are at their limit right now.'
  if (/invalid_output/.test(error)) return "The AI couldn't make sense of the sheet."
  return "The sheet couldn't be read."
}

function ManualEntry() {
  const navigate = useNavigate()
  const fallback = useFallback()
  const id = useMemo(() => crypto.randomUUID(), [])
  if (!fallback.ready) return <Skeleton variant="rounded" height={320} />
  return (
    <Stack spacing={4}>
      <SectionHeader title="Enter a scan by hand" subtitle="Every value from the Evolt sheet, in kg." />
      <ReviewForm
        scanId={id}
        initial={formFrom({ fallback })}
        draft={null}
        mode="manual"
        onConfirmed={(scan) => void navigate(`/scans/${scan.id}`, { replace: true })}
        onCancel={() => void navigate('/scans')}
      />
    </Stack>
  )
}

function PendingScan({ scan }: { scan: Scan }) {
  const navigate = useNavigate()
  const fallback = useFallback()
  const reextract = useReextractScan()
  const discard = useDiscardScan()
  const [manual, setManual] = useState(false)
  const x = scan.extraction
  const reading = !scan.extracted && x !== null && (x.status === 'queued' || x.status === 'running')
  const failed = !scan.extracted && (x === null || x.status === 'failed' || x.error !== null)

  const actions = (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      <SheetLink scan={scan} />
      <Button size="small" color="inherit" disabled={discard.isPending} onClick={() => discard.mutate({ params: { id: scan.id } }, { onSuccess: () => void navigate('/scans', { replace: true }) })}>
        Discard
      </Button>
    </Box>
  )

  if (scan.extracted || manual || (failed && x === null)) {
    if (!fallback.ready) return <Skeleton variant="rounded" height={320} />
    return (
      <Stack spacing={4}>
        <SectionHeader title={scan.extracted && !manual ? 'Check the values' : 'Enter the values'} subtitle={`Uploaded ${scan.date}`} action={actions} />
        <ReviewForm
          scanId={scan.id}
          initial={formFrom({ draft: manual ? null : scan.extracted, fallback })}
          draft={manual ? null : scan.extracted}
          mode={scan.extracted && !manual ? 'extracted' : 'manual'}
          onConfirmed={() => window.scrollTo({ top: 0 })}
          onCancel={manual ? () => setManual(false) : undefined}
        />
      </Stack>
    )
  }

  return (
    <Stack spacing={4}>
      <SectionHeader title="New scan" subtitle={`Uploaded ${scan.date}`} action={actions} />
      {reading && !x?.error && (
        <Card sx={{ p: 4, display: 'flex', alignItems: 'center', gap: 3 }} data-testid="scan-extracting" aria-live="polite">
          <CircularProgress size={28} />
          <Box>
            <Box sx={{ fontWeight: tokens.font.weight.heading }}>Extracting…</Box>
            <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary' }}>This takes up to half a minute.</Box>
          </Box>
        </Card>
      )}
      {failed && (
        <Alert
          severity="warning"
          data-testid="scan-extract-failed"
          action={
            <Button color="inherit" size="small" disabled={reextract.isPending} onClick={() => reextract.mutate({ params: { id: scan.id } })}>
              Try again
            </Button>
          }
        >
          <AlertTitle>{readError(x?.error ?? null)}</AlertTitle>
          {reading ? 'It tries again on its own in a minute. ' : ''}You can enter the values yourself instead.
          {reextract.error && <Box sx={{ mt: 1 }}>{problemText(reextract.error)}</Box>}
        </Alert>
      )}
      <Button variant={failed ? 'contained' : 'outlined'} onClick={() => setManual(true)} data-testid="scan-enter-manually">
        Enter the values by hand
      </Button>
    </Stack>
  )
}

function Debrief({ scan }: { scan: ConfirmedScan }) {
  const a = scan.analysis
  if (!a || a.status === 'none') return null
  // The stored milestones it re-anchored (Aaron's labels); else the engine's newly met composition milestones.
  const anchored = a.milestone_updates.filter((m) => m.reached_on !== null)
  const milestones = anchored.length
    ? anchored.map((m) => ({ key: m.milestone_id, text: `${m.label}: reached ${m.reached_on}` }))
    : (a.vs_previous?.milestones_reached ?? []).map((m) => ({ key: m.label, text: `Milestone reached: ${m.label}` }))
  return (
    <Card sx={{ p: 4 }} data-testid="scan-debrief">
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box component="h3" sx={{ m: 0, fontSize: 17, fontWeight: tokens.font.weight.heading, flex: 1 }}>
          Debrief
        </Box>
        {a.narrative_by && <Chip size="small" variant="outlined" label={a.narrative_by === 'ai' ? 'AI clerk' : 'Engine summary'} />}
      </Box>
      {a.status === 'pending' && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2, color: 'text.secondary', fontSize: tokens.font.size.small }} aria-live="polite">
          <CircularProgress size={18} /> Writing the debrief…
        </Box>
      )}
      {a.status === 'failed' && !a.narrative && <Box sx={{ mt: 2, color: 'text.secondary', fontSize: tokens.font.size.small }}>The debrief could not be written; the numbers below are the engine's.</Box>}
      {a.narrative && <Box sx={{ mt: 2, fontSize: tokens.font.size.emphasis, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{a.narrative}</Box>}
      {milestones.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 3, pl: 2.5, fontSize: tokens.font.size.small, lineHeight: 1.7 }} data-testid="scan-milestones">
          {milestones.map((m) => (
            <li key={m.key}>{m.text}</li>
          ))}
        </Box>
      )}
      {a.proposal_ids.length > 0 && (
        <Box sx={{ mt: 3, fontSize: tokens.font.size.small }}>
          {a.proposal_ids.length === 1 ? 'One plan proposal is' : `${a.proposal_ids.length} plan proposals are`} waiting for a tap on{' '}
          <Box component={RouterLink} to="/" sx={{ color: 'primary.main' }}>
            Today
          </Box>
          .
        </Box>
      )}
    </Card>
  )
}

function ConfirmedScanView({ scan, all }: { scan: ConfirmedScan; all: ConfirmedScan[] }) {
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const fallback = useFallback()
  const r = scan.record
  const a = scan.analysis
  const prev = a?.vs_previous ?? null
  const delta = (v: number | undefined, good: 'up' | 'down') => (prev && v !== undefined ? { value: v, good } : undefined)
  const c = r.conditions
  const conditionChips = [
    c.time_of_day[0]!.toUpperCase() + c.time_of_day.slice(1),
    c.fasted === true ? 'Fasted' : c.fasted === false ? 'Not fasted' : null,
    c.hours_since_training !== null ? `${c.hours_since_training} h since training` : null,
    c.hydration ? `Hydration: ${c.hydration}` : null,
    c.matches_baseline === true ? 'Baseline conditions' : c.matches_baseline === false ? 'Not baseline conditions' : null,
  ].filter((x): x is string => x !== null)

  if (editing)
    return (
      <Stack spacing={4}>
        <SectionHeader title="Edit scan values" subtitle="Saving re-runs the analysis." />
        <ReviewForm scanId={scan.id} initial={formFrom({ record: r, fallback })} draft={null} mode="edit" onConfirmed={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </Stack>
    )

  return (
    <Stack spacing={4} data-testid="scan-page">
      <Box>
        <SectionHeader
          title={`Scan ${scan.date}`}
          subtitle={`Evolt 360 at ${clockOf(r.scanned_at)}${prev ? `; changes since ${prev.date}` : ''}`}
          action={
            <Box sx={{ display: 'flex', gap: 1 }}>
              <SheetLink scan={scan} />
              <Button size="small" onClick={() => setEditing(true)}>
                Edit values
              </Button>
            </Box>
          }
        />
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1 }}>
          {conditionChips.map((label) => (
            <Chip key={label} size="small" variant="outlined" label={label} />
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 3 }}>
        <StatCard label="Weight" value={r.weight_kg} unit="kg" precision={1} metric="weight" delta={delta(prev?.fat_vs_lean.weight_kg, 'down')} />
        <StatCard label="Body fat" value={r.body_fat_pct} unit="%" precision={1} metric="fatMass" delta={delta(prev?.deltas.body_fat_pct, 'down')} />
        <StatCard label="Fat mass" value={r.body_fat_mass_kg} unit="kg" precision={1} metric="fatMass" delta={delta(prev?.fat_vs_lean.fat_kg, 'down')} />
        <StatCard label="Lean mass" value={r.lean_body_mass_kg} unit="kg" precision={1} metric="lean" delta={delta(prev?.fat_vs_lean.lean_kg, 'up')} />
      </Box>

      {a?.flags.map((f) => (
        <Alert key={f.code} severity={SEVERITY[f.code]} data-testid={`scan-flag-${f.code}`}>
          <AlertTitle>{FLAG_TITLE[f.code]}</AlertTitle>
          {f.message}
        </Alert>
      ))}

      <Debrief scan={scan} />
      <ScanCharts scans={all} focus={scan} />

      <Card sx={{ p: 4 }}>
        <Box component="h3" sx={{ m: 0, mb: 2, fontSize: 17, fontWeight: tokens.font.weight.heading }}>
          Every value
        </Box>
        <DeltaTable record={r} previous={prev} baseline={a?.vs_baseline ?? null} />
      </Card>
      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
        <Button color="error" onClick={() => setDeleting(true)} data-testid="scan-delete">
          Delete this scan
        </Button>
      </Box>
      {deleting && <DeleteScanDialog scanId={scan.id} date={scan.date} onClose={() => setDeleting(false)} />}
    </Stack>
  )
}

export function ScanPage() {
  const { id = '' } = useParams()
  const isNew = id === 'new'
  const scan = useScan(id, !isNew)
  const scans = useScans()
  if (isNew) return <ManualEntry />
  if (scan.isPending)
    return (
      <Stack spacing={4}>
        <Skeleton variant="rounded" height={64} />
        <Skeleton variant="rounded" height={220} />
      </Stack>
    )
  if (!scan.data) return <Alert severity="error">{problemText(scan.error)}</Alert>
  const s = scan.data
  if (!s.confirmed || !s.record) return <PendingScan scan={s} />
  const all = confirmedScans(scans.data ?? [s])
  return <ConfirmedScanView scan={s as ConfirmedScan} all={all.some((x) => x.id === s.id) ? all : confirmedScans([...all, s])} />
}
