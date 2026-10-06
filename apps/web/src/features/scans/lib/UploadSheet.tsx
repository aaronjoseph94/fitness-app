// Owns: the upload flow — pick the Evolt sheet (PDF, PNG or JPG), see it rendered (PDF page 1 via pdfjs), drag the
// black box over the name, then upload the masked image and hand the new scan to the caller (the scan page takes it
// from "Extracting…" to the review form). Full screen on a phone.
import CloseRounded from '@mui/icons-material/CloseRounded'
import UploadFileRounded from '@mui/icons-material/UploadFileRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import IconButton from '@mui/material/IconButton'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { ScanUploaded } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { endpoints } from '@fitness/shared/api'
import { apiQueryKey, call, problemText } from '../../../api'
import { tokens } from '../../../theme'
import { MaskEditor } from './MaskEditor'
import { ACCEPT, DEFAULT_MASK, maskedSheet, renderSheet, type MaskBox } from './sheet'

/** A scan PDF can be a few MB; give the upload a minute. Never queued: reading the sheet needs the server now. */
const UPLOAD_TIMEOUT_MS = 60_000

/** `id` is the scan's client id, made once per picked sheet so "Upload and read" after a timeout replays it (the Worker
 * returns the stored scan, no second scan or extraction job). */
type Step =
  | { kind: 'pick' }
  | { kind: 'rendering'; name: string }
  | { kind: 'mask'; sheet: HTMLCanvasElement; name: string; id: string }
  | { kind: 'uploading' }

export function UploadSheet({ open, onClose, onUploaded }: { open: boolean; onClose: () => void; onUploaded: (result: ScanUploaded) => void }) {
  const fullScreen = useMediaQuery(`(max-width: ${tokens.layout.phoneWidth + 210}px)`)
  const [step, setStep] = useState<Step>({ kind: 'pick' })
  const [box, setBox] = useState<MaskBox>(DEFAULT_MASK)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const reset = () => {
    setStep({ kind: 'pick' })
    setBox(DEFAULT_MASK)
    setError(null)
  }
  const close = () => {
    if (step.kind === 'uploading') return
    reset()
    onClose()
  }

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setStep({ kind: 'rendering', name: file.name })
    try {
      const sheet = await renderSheet(file)
      setBox(DEFAULT_MASK)
      setStep({ kind: 'mask', sheet, name: file.name, id: crypto.randomUUID() })
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file couldn't be opened.")
      setStep({ kind: 'pick' })
    }
  }

  const upload = async () => {
    if (step.kind !== 'mask') return
    const { sheet, name, id } = step
    setError(null)
    setStep({ kind: 'uploading' })
    try {
      const { blob, content_type } = await maskedSheet(sheet, box)
      const result = await call(
        endpoints.scans.upload,
        { query: { id, content_type }, body: await blob.arrayBuffer() },
        { timeoutMs: UPLOAD_TIMEOUT_MS },
      )
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(endpoints.scans.list) })
      reset()
      onUploaded(result)
    } catch (e) {
      setError(problemText(e))
      setStep({ kind: 'mask', sheet, name, id })
    }
  }

  return (
    <Dialog open={open} onClose={close} fullScreen={fullScreen} fullWidth maxWidth="sm" aria-labelledby="scan-upload-title">
      <DialogTitle id="scan-upload-title" sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 2 }}>
        <Box sx={{ flex: 1 }}>{step.kind === 'mask' || step.kind === 'uploading' ? 'Hide your name' : 'Upload a scan sheet'}</Box>
        <IconButton aria-label="Close" onClick={close} disabled={step.kind === 'uploading'} sx={{ width: tokens.tapTarget, height: tokens.tapTarget }}>
          <CloseRounded />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3, alignContent: 'start' }}>
        <input ref={input} type="file" accept={ACCEPT} hidden data-testid="scan-file-input" onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // picking the same file again still fires
            void pick(file)
          }}
        />
        {error && <Alert severity="error">{error}</Alert>}

        {step.kind === 'pick' && (
          <>
            <Box sx={{ color: 'text.secondary', fontSize: tokens.font.size.emphasis, lineHeight: 1.5 }}>
              Share the result sheet from the Evolt Active app, or save it from app.evoltactive.com. You'll hide your name before anything
              is uploaded.
            </Box>
            <Button variant="contained" size="large" startIcon={<UploadFileRounded />} onClick={() => input.current?.click()} data-testid="scan-pick">
              Choose the sheet (PDF, PNG or JPG)
            </Button>
          </>
        )}

        {step.kind === 'rendering' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 6, justifyContent: 'center', color: 'text.secondary' }}>
            <CircularProgress size={24} /> Opening {step.name}…
          </Box>
        )}

        {(step.kind === 'mask' || step.kind === 'uploading') && (
          <>
            <Box sx={{ fontSize: tokens.font.size.small, color: 'text.secondary', lineHeight: 1.5 }}>
              Drag the black box over your name; drag a corner to resize it. Only the masked image is uploaded and read.
            </Box>
            {step.kind === 'mask' ? (
              <MaskEditor sheet={step.sheet} box={box} onChange={setBox} />
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 6, justifyContent: 'center', color: 'text.secondary' }}>
                <CircularProgress size={24} /> Uploading…
              </Box>
            )}
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', position: 'sticky', bottom: 0, bgcolor: 'background.paper', py: 2 }}>
              <Button onClick={() => input.current?.click()} disabled={step.kind === 'uploading'}>
                Another file
              </Button>
              <Button variant="contained" onClick={() => void upload()} disabled={step.kind === 'uploading'} data-testid="scan-upload">
                Upload and read
              </Button>
            </Box>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
