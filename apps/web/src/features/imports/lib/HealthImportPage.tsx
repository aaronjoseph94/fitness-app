// Owns: the Apple Watch file import screen (/imports/health, SPEC §8 route 2) — pick a CSV or JSON export (Health Auto
// Export or similar), check the guessed columns for date, steps, active energy and sleep, preview the mapped days,
// then POST /api/imports/health in pages of at most 500 rows and show what was saved. Rows upsert by date.
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import MuiTable from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import { endpoints } from '@fitness/shared/api'
import type { HealthImportResult } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { apiQueryKey, call, problemText } from '../../../api'
import { cardSurface, formatNumber, PageHeader, Panel, ProgressBar, Reveal, Segmented, staggerDelay, tabularNums, wellSurface } from '../../../components'
import { tokens } from '../../../theme'
import { clockOf } from '../../quick-log'
import { applyMapping, guessMapping, type Mapping } from './mapping'
import { readTable, type Table } from './table'

/** Rows per POST (the contract allows 1,000; smaller pages keep each request well inside the Worker's CPU limit). */
const PAGE_ROWS = 500
const PREVIEW_ROWS = 8
const NONE = ''

/** 2a's entrance: each card group after the header rises in, a section's stagger apart, in reading order. */
const enter = (i: number) => staggerDelay(i, tokens.motion.stagger.section)

type Optional = 'steps' | 'active_kcal' | 'in_bed_at' | 'woke_at' | 'asleep'
const OPTIONAL: { key: Optional; label: string }[] = [
  { key: 'steps', label: 'Steps' },
  { key: 'active_kcal', label: 'Active energy (kcal)' },
  { key: 'asleep', label: 'Time asleep' },
  { key: 'in_bed_at', label: 'Sleep start (in bed)' },
  { key: 'woke_at', label: 'Sleep end (woke)' },
]

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

  const chooseButton = (
    <Button variant={table ? 'outlined' : 'contained'} startIcon={<UploadFileRounded />} onClick={() => input.current?.click()} disabled={running}>
      {table ? 'Choose another file' : 'Choose a file'}
    </Button>
  )

  return (
    <Stack spacing={`${tokens.rhythm.section}px`} data-testid="health-import-page">
      <PageHeader title="Import Apple Watch data" subtitle="Steps and sleep from a health export file, one row per day. Rows upsert by date, so importing again is safe." />
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
      <Reveal delay={enter(1)}>
        <Panel id="health-file" title="Export file" description="CSV or JSON (Health Auto Export or similar); days already logged are replaced." actions={chooseButton}>
          {table && (
            <Box sx={{ ...wellSurface, display: 'flex', alignItems: 'center', gap: 3, px: '14px', py: '10px', minWidth: 0 }}>
              <DescriptionOutlined aria-hidden sx={{ fontSize: 20, color: tokens.ink.muted, flex: 'none' }} />
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.label, color: tokens.ink.text, overflowWrap: 'anywhere' }}>{fileName}</Box>
                <Box sx={{ fontSize: tokens.font.size.caption, lineHeight: tokens.font.leading.caption, color: tokens.ink.secondary, ...tabularNums }}>
                  {formatNumber(table.rows.length)} rows · {table.columns.length} columns · {table.format.toUpperCase()}
                </Box>
              </Box>
            </Box>
          )}
        </Panel>
      </Reveal>

      {error && <Alert severity="error">{error}</Alert>}

      {table && mapping && (
        <Reveal delay={enter(2)}>
          <Panel id="health-columns" title="Columns" description="Guessed from the column names; change any that are wrong." testId="health-mapping">
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3, alignItems: 'start' }}>
              <ColumnSelect label="Date" required value={mapping.date} columns={table.columns} onChange={(v) => v && set('date', v)} />
              {OPTIONAL.map((o) => (
                <ColumnSelect key={o.key} label={o.label} value={mapping[o.key]} columns={table.columns} onChange={(v) => set(o.key, v)} />
              ))}
              {mapping.asleep && (
                <Box sx={{ gridColumn: '1 / -1' }}>
                  <Segmented
                    ariaLabel="Time asleep is in"
                    fullWidth
                    value={mapping.asleep_unit}
                    onChange={(v) => set('asleep_unit', v)}
                    options={[
                      { value: 'h', label: 'Asleep in hours' },
                      { value: 'min', label: 'Asleep in minutes' },
                    ]}
                  />
                </Box>
              )}
            </Box>
          </Panel>
        </Reveal>
      )}

      {mapped && (
        <Reveal delay={enter(3)}>
          <Panel
            id="health-preview"
            title="Preview"
            description={`${formatNumber(mapped.rows.length)} days: steps on ${formatNumber(withSteps)}, sleep on ${formatNumber(withSleep)}${mapped.skipped ? `; ${formatNumber(mapped.skipped)} ${mapped.skipped === 1 ? 'row' : 'rows'} skipped` : ''}`}
            padding="none"
            testId="health-preview"
            footer={
              <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px', px: `${tokens.pad.card.x}px`, py: '12px' }}>
                <Box sx={{ flex: '1 1 160px', fontSize: tokens.font.size.caption, color: tokens.ink.secondary }}>
                  {mapped.rows.length > PREVIEW_ROWS ? `The last ${PREVIEW_ROWS} days.` : 'Every day in the file.'}
                </Box>
                <Button variant="contained" disabled={running || mapped.rows.length === 0} onClick={() => void run()} data-testid="health-import" sx={{ width: { xs: '100%', sm: 'auto' } }}>
                  {running ? 'Importing…' : `Import ${formatNumber(mapped.rows.length)} days`}
                </Button>
              </Box>
            }
          >
            {mapped.reasons.length > 0 && (
              <Box component="ul" sx={{ m: 0, mb: 3, mx: `${tokens.pad.card.x}px`, pl: '18px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>
                {mapped.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </Box>
            )}
            <Box sx={{ overflowX: 'auto' }}>
              <MuiTable aria-label="Mapped days">
                <TableHead>
                  <TableRow>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Steps</TableCell>
                    <TableCell align="right">Asleep</TableCell>
                    <TableCell align="right">In bed → woke</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {mapped.rows.slice(-PREVIEW_ROWS).map((r) => (
                    <TableRow key={r.date}>
                      <TableCell sx={{ ...tabularNums, whiteSpace: 'nowrap' }}>{r.date}</TableCell>
                      <TableCell align="right">{r.steps !== undefined ? formatNumber(r.steps) : '—'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {r.asleep_min !== undefined ? `${formatNumber(r.asleep_min / 60, 1)} h` : '—'}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {r.in_bed_at && r.woke_at ? `${clockOf(r.in_bed_at)} → ${clockOf(r.woke_at)}` : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </MuiTable>
            </Box>
          </Panel>
        </Reveal>
      )}

      {progress && (
        <Reveal delay={enter(4)}>
          <Box sx={{ ...cardSurface, px: `${tokens.pad.card.x}px`, py: `${tokens.pad.card.y}px` }} data-testid="health-import-result" aria-live="polite">
            <ProgressBar value={progress.done / progress.total} label="Import progress" color={progress.done < progress.total ? tokens.accent.main : tokens.tone.success.solid} />
            <Box sx={{ mt: 3, fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body }}>
              <Box component="span" sx={{ fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
                {progress.done < progress.total ? `Sent ${formatNumber(progress.done)} of ${formatNumber(progress.total)} days…` : 'Done.'}
              </Box>{' '}
              Steps saved for {formatNumber(progress.result.steps_upserted)} days, sleep for {formatNumber(progress.result.sleep_upserted)} nights
              {progress.result.skipped ? `; ${formatNumber(progress.result.skipped)} skipped by the server` : ''}.
            </Box>
          </Box>
        </Reveal>
      )}
    </Stack>
  )
}
