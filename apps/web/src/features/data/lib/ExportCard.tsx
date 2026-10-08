// Owns: the "Export everything" card — start the in-browser zip build, show its progress, then offer the finished zip
// to save (download) or share (the iOS share sheet saves to Files). Saving is a fresh tap because browsers drop a
// download started after a long wait.
import DownloadRounded from '@mui/icons-material/DownloadRounded'
import IosShareRounded from '@mui/icons-material/IosShareRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useEffect, useRef, useState } from 'react'
import { formatNumber } from '../../../components'
import { buildExport, type BuiltExport, type ExportProgress } from './build-export'
import { DataCard, failureText, formatBytes, Help, ProgressLine } from './parts'

type State =
  | { kind: 'idle' }
  | { kind: 'building'; progress: ExportProgress }
  | { kind: 'ready'; built: BuiltExport }
  | { kind: 'failed'; message: string }

function save(built: BuiltExport) {
  const url = URL.createObjectURL(built.blob)
  const link = document.createElement('a')
  link.href = url
  link.download = built.fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function shareable(built: BuiltExport): File | null {
  const file = new File([built.blob], built.fileName, { type: 'application/zip' })
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }) ? file : null
}

export function ExportCard({ online }: { online: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const start = async () => {
    abort.current?.abort()
    const controller = new AbortController()
    abort.current = controller
    setState({
      kind: 'building',
      progress: { phase: 'tables', done: 0, total: 0, label: 'Reading the manifest' },
    })
    try {
      const built = await buildExport(
        (progress) => setState({ kind: 'building', progress }),
        controller.signal,
      )
      setState({ kind: 'ready', built })
    } catch (error) {
      if (controller.signal.aborted) setState({ kind: 'idle' })
      else setState({ kind: 'failed', message: failureText(error) })
    }
  }

  const share = async (built: BuiltExport) => {
    const file = shareable(built)
    if (!file) return save(built)
    try {
      await navigator.share({ files: [file], title: built.fileName })
    } catch {
      // Dismissed share sheet: nothing to do.
    }
  }

  const startButton = (
    <Button
      variant={state.kind === 'ready' ? 'outlined' : 'contained'}
      startIcon={state.kind === 'ready' ? undefined : <DownloadRounded />}
      onClick={() => void start()}
      disabled={!online}
      data-testid="export-start"
    >
      {state.kind === 'ready' ? 'Export again' : state.kind === 'failed' ? 'Try again' : 'Export everything'}
    </Button>
  )
  const offlineHelp = !online && <Help>Exporting needs a connection.</Help>

  return (
    <DataCard
      id="export"
      title="Export everything"
      description={
        <>
          One zip with a CSV per table, <b>full.json</b> (every table, for restoring) and your photos, scan sheets and report PDFs. It is built on
          this device; the server only hands over the data.
        </>
      }
    >
      <Stack spacing={4}>
        {state.kind === 'building' && (
          <ProgressLine
            testId="export-progress"
            done={state.progress.done}
            total={state.progress.total}
            label={state.progress.label}
            unit={state.progress.phase === 'tables' ? 'rows' : 'files'}
          />
        )}

        {state.kind === 'ready' && (
          <Stack spacing={3} data-testid="export-ready">
            <Alert severity="success">
              Export ready: {formatNumber(state.built.rows)} rows from {state.built.tables} tables and {formatNumber(state.built.files)} files,{' '}
              {formatBytes(state.built.blob.size)}.
            </Alert>
            {state.built.missing.length > 0 && (
              <Alert severity="warning">
                {state.built.missing.length} file{state.built.missing.length === 1 ? '' : 's'} could not be fetched and are not in the zip (listed in its
                README).
              </Alert>
            )}
            {/* One action row once the zip is ready: Save zip, Share… and Export again side by side. */}
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' }}>
              <Button variant="contained" startIcon={<DownloadRounded />} onClick={() => save(state.built)}>
                Save zip
              </Button>
              {shareable(state.built) && (
                <Button variant="outlined" startIcon={<IosShareRounded />} onClick={() => void share(state.built)}>
                  Share…
                </Button>
              )}
              {startButton}
              {offlineHelp}
            </Box>
          </Stack>
        )}

        {state.kind === 'failed' && (
          <Alert severity="error" data-testid="export-error">
            Export stopped. {state.message}
          </Alert>
        )}

        {state.kind !== 'ready' && (
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 12px' }}>
            {state.kind === 'building' ? (
              <Button variant="outlined" onClick={() => abort.current?.abort()}>
                Cancel
              </Button>
            ) : (
              startButton
            )}
            {offlineHelp}
          </Box>
        )}
      </Stack>
    </DataCard>
  )
}
