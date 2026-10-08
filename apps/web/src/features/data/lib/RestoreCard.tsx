// Owns: the "Restore from export" card — the fresh-instance warning, picking a zip, showing what it will restore
// (tables with row counts, files, export date), the overwrite opt-in, and the restore itself with progress, a resume
// after a failure (same restore id, from the failed step), and a reload of every screen's data when it finishes.
import RestoreRounded from '@mui/icons-material/RestoreRounded'
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { apiQueryKey, isApiError } from '../../../api'
import { formatNumber, tabularNums, wellSurface } from '../../../components'
import { tokens } from '../../../theme'
import { DataCard, failureText, formatBytes, Help, localStamp, ProgressLine } from './parts'
import {
  openExport,
  planRestore,
  RestoreStepError,
  runRestore,
  type OpenedExport,
  type RestoreStep,
} from './restore'

type Run = { restoreId: string; overwrite: boolean; steps: RestoreStep[]; done: number }
type State =
  | { kind: 'idle' }
  | { kind: 'reading'; name: string }
  | { kind: 'preview'; opened: OpenedExport }
  | { kind: 'running'; opened: OpenedExport; run: Run }
  | { kind: 'failed'; opened: OpenedExport; run: Run; message: string; notFresh: boolean }
  | { kind: 'done'; opened: OpenedExport; run: Run }

const NOT_FRESH =
  'This app already has logs, so nothing was restored. Go back, tick “merge over existing data” and start again if you mean to write the export over them.'

const label = (table: string) => table.replaceAll('_', ' ')

function stepLabel(step: RestoreStep | undefined): string {
  if (!step) return 'Finishing'
  return step.kind === 'rows' ? `Restoring ${label(step.table)}` : 'Restoring photos, sheets and reports'
}

export function RestoreCard({ online }: { online: boolean }) {
  const queryClient = useQueryClient()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [overwrite, setOverwrite] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setPickError(null)
    setState({ kind: 'reading', name: file.name })
    try {
      setState({ kind: 'preview', opened: await openExport(file) })
    } catch (error) {
      setPickError(error instanceof Error ? error.message : 'Could not read that file.')
      setState({ kind: 'idle' })
    }
  }

  const go = async (opened: OpenedExport, run: Run) => {
    const controller = new AbortController()
    abort.current = controller
    let current = run
    setState({ kind: 'running', opened, run: current })
    try {
      await runRestore(
        opened,
        run.steps,
        run.done,
        { restoreId: run.restoreId, overwrite: run.overwrite, signal: controller.signal },
        (done) => {
          current = { ...current, done }
          setState({ kind: 'running', opened, run: current })
        },
      )
      await queryClient.invalidateQueries({ queryKey: apiQueryKey() })
      setState({ kind: 'done', opened, run: current })
    } catch (error) {
      if (controller.signal.aborted) {
        setState({
          kind: 'failed',
          opened,
          run: current,
          message: 'Restore stopped. Resume picks up where it stopped.',
          notFresh: false,
        })
        return
      }
      const cause = error instanceof RestoreStepError ? error.cause : error
      const where =
        error instanceof RestoreStepError ? stepLabel(error.step).replace('Restoring', 'while restoring') : ''
      const notFresh = isApiError(cause) && cause.code === 'not_fresh'
      setState({
        kind: 'failed',
        opened,
        run: error instanceof RestoreStepError ? { ...current, done: error.index } : current,
        message: notFresh ? NOT_FRESH : `Stopped ${where}. ${failureText(cause)}`,
        notFresh,
      })
    }
  }

  const start = (opened: OpenedExport) =>
    void go(opened, { restoreId: crypto.randomUUID(), overwrite, steps: planRestore(opened), done: 0 })

  const files = state.kind === 'idle' || state.kind === 'reading' ? null : state.opened
  const steps =
    state.kind === 'running' || state.kind === 'failed' || state.kind === 'done' ? state.run : null
  const rowSteps = steps?.steps.filter((s) => s.kind === 'rows').length ?? 0

  return (
    <DataCard
      id="restore"
      title="Restore from export"
      description="Write an export zip back into this app: every row and file, with progress, and a resume if it stops."
    >
      <Stack spacing={4}>
        <Alert severity="warning" data-testid="restore-warning">
          Restore is for a <b>fresh instance</b>: a new deployment that holds only the seed. It writes every row and file from the export into this app,
          replacing rows with the same id, and deletes nothing else. It refuses an app that already has logs unless you tick “merge over existing data”.
        </Alert>

        <input ref={input} type="file" accept=".zip,application/zip" hidden onChange={(e) => void pick(e)} data-testid="restore-file" />

        {state.kind === 'reading' && <Help>Reading {state.name}…</Help>}
        {pickError && <Alert severity="error">{pickError}</Alert>}

        {files && (
          <Box data-testid="restore-preview">
            <Box sx={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.heading, lineHeight: tokens.font.leading.body, overflowWrap: 'anywhere' }}>
              {files.fileName}
            </Box>
            <Box sx={{ mt: '2px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, ...tabularNums }}>
              Exported {localStamp(files.exportedAt)} · {formatNumber(files.totalRows)} rows · {formatNumber(files.files.length)} files ·{' '}
              {formatBytes(files.zip.byteLength)}
              {files.missingFiles > 0 && ` · ${files.missingFiles} listed files are not in the zip`}
            </Box>
            <Box
              component="ul"
              aria-label="Tables in this export"
              sx={{
                ...wellSurface,
                listStyle: 'none',
                m: 0,
                mt: 3,
                px: 4,
                py: 1,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                columnGap: 6,
              }}
            >
              {files.tables.map((t) => (
                <Box
                  component="li"
                  key={t.table}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 2,
                    fontSize: tokens.font.size.small,
                    lineHeight: tokens.font.leading.small,
                    borderBottom: `1px solid ${tokens.ink.border}`,
                  }}
                >
                  <Box sx={{ color: tokens.ink.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label(t.table)}</Box>
                  <Box sx={{ ...tabularNums, fontWeight: tokens.font.weight.label, color: tokens.ink.text }}>{formatNumber(t.rows)}</Box>
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {state.kind === 'preview' && (
          <FormControlLabel
            sx={{
              m: 0,
              alignItems: 'flex-start',
              gap: 1,
              '& .MuiFormControlLabel-label': { pt: '9px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.body },
            }}
            control={<Checkbox checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} data-testid="restore-overwrite" sx={{ ml: '-9px' }} />}
            label="Merge over existing data. Only if this app already has logs and you mean to write the export over them."
          />
        )}

        {state.kind === 'running' && steps && (
          <ProgressLine
            testId="restore-progress"
            done={steps.done}
            total={steps.steps.length}
            label={stepLabel(steps.steps[steps.done])}
            unit={`steps (${rowSteps} pages, ${steps.steps.length - rowSteps} files)`}
          />
        )}

        {state.kind === 'failed' && (
          <Alert severity="error" data-testid="restore-error">
            {state.message}
          </Alert>
        )}

        {state.kind === 'done' && (
          <Alert severity="success" data-testid="restore-done">
            Restored {formatNumber(state.opened.totalRows)} rows and {formatNumber(state.opened.files.length)} files. Every screen now shows the restored
            data.
          </Alert>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' }}>
          {state.kind === 'preview' && (
            <Button variant="contained" color="warning" startIcon={<RestoreRounded />} disabled={!online} onClick={() => start(state.opened)} data-testid="restore-start">
              Restore {formatNumber(state.opened.totalRows)} rows and {formatNumber(state.opened.files.length)} files
            </Button>
          )}
          {state.kind === 'failed' && !state.notFresh && (
            <Button variant="contained" disabled={!online} onClick={() => void go(state.opened, state.run)}>
              Resume
            </Button>
          )}
          {state.kind === 'failed' && state.notFresh && (
            <Button variant="contained" onClick={() => setState({ kind: 'preview', opened: state.opened })}>
              Back
            </Button>
          )}
          {state.kind === 'running' ? (
            <Button variant="outlined" onClick={() => abort.current?.abort()}>
              Stop
            </Button>
          ) : (
            <Button
              variant="outlined"
              startIcon={state.kind === 'idle' || state.kind === 'reading' ? <UploadFileRounded /> : undefined}
              disabled={state.kind === 'reading'}
              onClick={() => input.current?.click()}
              data-testid="restore-pick"
            >
              {state.kind === 'idle' || state.kind === 'reading' ? 'Choose export zip' : 'Choose another zip'}
            </Button>
          )}
          {state.kind === 'running' && <Help>Keep this screen open until the restore finishes.</Help>}
        </Box>
      </Stack>
    </DataCard>
  )
}
