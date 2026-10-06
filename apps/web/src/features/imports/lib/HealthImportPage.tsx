// Owns: the Apple Watch file import screen (/imports/health, SPEC §8 route 2) — pick a CSV or JSON export (Health Auto
// Export or similar), check the guessed columns for date, steps, active energy and sleep, preview the mapped days,
// then POST /api/imports/health in pages of at most 500 rows and show what was saved. Rows upsert by date.
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import LinearProgress from '@mui/material/LinearProgress'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { endpoints } from '@fitness/shared/api'
import type { HealthImportResult } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { apiQueryKey, call, problemText } from '../../../api'
import { formatNumber, SectionHeader } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf } from '../../quick-log'
import { applyMapping, guessMapping, type Mapping } from './mapping'
import { readTable, type Table } from './table'

/** Rows per POST (the contract allows 1,000; smaller pages keep each request well inside the Worker's CPU limit). */
const PAGE_ROWS = 500
const PREVIEW_ROWS = 8
const NONE = ''

type Optional = 'steps' | 'active_kcal' | 'in_bed_at' | 'woke_at' | 'asleep'
const OPTIONAL: { key: Optional; label: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'active_kcal', label: 'Active energy (kcal)' },
  { key: 'asleep', label: 'Time asleep' },
  { key: 'in_bed_at', label: 'Sleep start (in bed)' },
  { key: 'woke_at', label: 'Sleep end (woke)' },
]

const toggleSx = { '& .MuiToggleButton-root': { minHeight: tokens.tapTarget, textTransform: 'none', fontWeight: tokens.font.weight.label } }

function ColumnSelect({ label, value, columns, required, onChange }: { label: string; value: string | null; columns: string[]; required?: boolean; onChange: (v: string | null) => void }) {
  return (
    <TextField select size="small" label={label} value={value ?? NONE} onChange={(e) => onChange(e.target.value === NONE ? null : e.target.value)} fullWidth>
      {!required && (
        <MenuItem value={NONE}>
          <em>Not in this file</em>
        </MenuItem>
      )}
      {columns.map((c) => (
        <MenuItem key={c} value={c}>
          {c}
        </MenuItem>
      ))}
    </TextField>
  )
}

type Progress = { done: number; total: number; result: HealthImportResult }

export function HealthImportPage() {
  const input = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const [table, setTable] = useState<Table | null>(null)
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [running, setRunning] = useState(false)

  const mapped = useMemo(() => (table && mapping ? applyMapping(table, mapping) : null), [table, mapping])
  const withSleep = mapped?.rows.filter((r) => r.asleep_min !== undefined || r.woke_at !== undefined).length ?? 0
  const withSteps = mapped?.rows.filter((r) => r.steps !== undefined).length ?? 0

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setProgress(null)
    try {
      const t = await readTable(file)
      setTable(t)
      setFileName(file.name)
      setMapping(guessMapping(t))
    } catch (e) {
      setTable(null)
      setMapping(null)
      setError(e instanceof Error ? e.message : "That file couldn't be read.")
    }
  }

  const run = async () => {
    if (!mapped || mapped.rows.length === 0) return
    setRunning(true)
    setError(null)
    const total = mapped.rows.length
    let result: HealthImportResult = { steps_upserted: 0, sleep_upserted: 0, skipped: 0 }
    setProgress({ done: 0, total, result })
    try {
      for (let i = 0; i < total; i += PAGE_ROWS) {
        const page = mapped.rows.slice(i, i + PAGE_ROWS)
        const r = await call(endpoints.health.importHealth, { body: { rows: page } })
        result = { steps_upserted: result.steps_upserted + r.steps_upserted, sleep_upserted: result.sleep_upserted + r.sleep_upserted, skipped: result.skipped + r.skipped }
        setProgress({ done: Math.min(total, i + page.length), total, result })
      }
      for (const e of [endpoints.day.range, endpoints.day.get]) void queryClient.invalidateQueries({ queryKey: apiQueryKey(e) })
    } catch (e) {
      setError(`${problemText(e)} Pages already sent are saved; importing again is safe (rows upsert by date).`)
    } finally {
      setRunning(false)
    }
  }

  const set = (key: keyof Mapping, value: string | null) => setMapping((m) => (m ? { ...m, [key]: value } : m))

  return (
    <Stack spacing={4} data-testid="health-import-page">
      <Card sx={{ p: 4 }}>
        <SectionHeader title="Export file" subtitle="CSV or JSON (Health Auto Export or similar); days already logged are replaced." />
        <input
          ref={input}
          type="file"
          accept=".csv,.json,.txt,text/csv,application/json"
          hidden
          data-testid="health-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void pick(file)
          }}
        />
        <Button variant={table ? 'outlined' : 'contained'} startIcon={<UploadFileRounded />} onClick={() => input.current?.click()} sx={{ mt: 3 }} disabled={running}>
          {table ? 'Choose another file' : 'Choose a file'}
        </Button>
        {table && (
          <Box sx={{ mt: 2, fontSize: tokens.font.size.label, color: 'text.secondary' }}>
            {fileName}: {formatNumber(table.rows.length)} rows, {table.columns.length} columns ({table.format.toUpperCase()})
          </Box>
        )}
      </Card>

      {error && <Alert severity="error">{error}</Alert>}

      {table && mapping && (
        <Card sx={{ p: 4 }} data-testid="health-mapping">
          <SectionHeader title="Columns" subtitle="Guessed from the column names; change any that are wrong." />
          <Box sx={{ display: 'grid', gap: 3, mt: 3 }}>
            <ColumnSelect label="Date" required value={mapping.date} columns={table.columns} onChange={(v) => v && set('date', v)} />
            {OPTIONAL.map((o) => (
              <ColumnSelect key={o.key} label={o.label} value={mapping[o.key]} columns={table.columns} onChange={(v) => set(o.key, v)} />
            ))}
            {mapping.asleep && (
              <ToggleButtonGroup value={mapping.asleep_unit} exclusive fullWidth size="small" aria-label="Time asleep is in" onChange={(_, v: Mapping['asleep_unit'] | null) => v && set('asleep_unit', v)} sx={toggleSx}>
                <ToggleButton value="h">Asleep in hours</ToggleButton>
                <ToggleButton value="min">Asleep in minutes</ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>
        </Card>
      )}

      {mapped && (
        <Card sx={{ p: 4 }} data-testid="health-preview">
          <SectionHeader
            title="Preview"
            subtitle={`${formatNumber(mapped.rows.length)} days: steps on ${formatNumber(withSteps)}, sleep on ${formatNumber(withSleep)}${mapped.skipped ? `; ${formatNumber(mapped.skipped)} ${mapped.skipped === 1 ? 'row' : 'rows'} skipped` : ''}`}
          />
          {mapped.reasons.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 2, pl: 2.5, fontSize: tokens.font.size.label, color: 'text.secondary' }}>
              {mapped.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </Box>
          )}
          <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr 1.3fr', columnGap: 2, fontSize: tokens.font.size.small, fontVariantNumeric: 'tabular-nums' }}>
            {['Date', 'Steps', 'Asleep', 'In bed → woke'].map((h) => (
              <Box key={h} sx={{ color: 'text.secondary', fontSize: tokens.font.size.caption, pb: 1, borderBottom: `1px solid ${tokens.ink.border}` }}>
                {h}
              </Box>
            ))}
            {mapped.rows.slice(-PREVIEW_ROWS).map((r) => (
              <Box key={r.date} sx={{ display: 'contents', '& > *': { py: 1, borderBottom: `1px solid ${tokens.ink.border}` } }}>
                <Box>{r.date}</Box>
                <Box>{r.steps !== undefined ? formatNumber(r.steps) : '—'}</Box>
                <Box>{r.asleep_min !== undefined ? `${formatNumber(r.asleep_min / 60, 1)} h` : '—'}</Box>
                <Box>{r.in_bed_at && r.woke_at ? `${clockOf(r.in_bed_at)} → ${clockOf(r.woke_at)}` : '—'}</Box>
              </Box>
            ))}
          </Box>
          {mapped.rows.length > PREVIEW_ROWS && <Box sx={{ mt: 1, fontSize: tokens.font.size.caption, color: 'text.secondary' }}>The last {PREVIEW_ROWS} days.</Box>}
          <Button variant="contained" sx={{ mt: 3 }} fullWidth disabled={running || mapped.rows.length === 0} onClick={() => void run()} data-testid="health-import">
            {running ? 'Importing…' : `Import ${formatNumber(mapped.rows.length)} days`}
          </Button>
        </Card>
      )}

      {progress && (
        <Card sx={{ p: 4 }} data-testid="health-import-result" aria-live="polite">
          <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} />
          <Box sx={{ mt: 2, fontSize: tokens.font.size.emphasis }}>
            {progress.done < progress.total ? `Sent ${formatNumber(progress.done)} of ${formatNumber(progress.total)} days…` : 'Done.'} Steps saved for{' '}
            {formatNumber(progress.result.steps_upserted)} days, sleep for {formatNumber(progress.result.sleep_upserted)} nights
            {progress.result.skipped ? `; ${formatNumber(progress.result.skipped)} skipped by the server` : ''}.
          </Box>
        </Card>
      )}
    </Stack>
  )
}
