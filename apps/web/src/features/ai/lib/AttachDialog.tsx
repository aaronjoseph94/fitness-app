// Owns: tagging one picked photo for an Ask AI message (SPEC §9 privacy) — a small dialog with the photo and four tags,
// Progress photo first, then that tag's path: Progress photo → saved privately through the photos module and never
// attached ("photos of you never go to the AI"); Meal → "This photo goes to the AI" (Back / Send), then a photo meal
// logged now in the slot its time suggests (quick-log's path: downscaled and re-encoded on this device), attached by
// meal id; Scan sheet → the name box painted black, "name, face, email covered" ticked, the masked copy shown with the
// same confirm, then the scans upload, attached by scan id; Screenshot → black out anything private and tick the same
// check, then the re-encoded copy uploaded to POST /api/ai/attachments, attached by its client id. Nothing uploads
// before its confirm. Client ids are made once per photo, so "Try again" replays.
import CameraAltOutlined from '@mui/icons-material/CameraAltOutlined'
import CloseRounded from '@mui/icons-material/CloseRounded'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import LockOutlined from '@mui/icons-material/LockOutlined'
import RestaurantRounded from '@mui/icons-material/RestaurantRounded'
import ScreenshotMonitorOutlined from '@mui/icons-material/ScreenshotMonitorOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import IconButton from '@mui/material/IconButton'
import useMediaQuery from '@mui/material/useMediaQuery'
import type { SvgIconComponent } from '@mui/icons-material'
import { endpoints } from '@fitness/shared/api'
import { MAX_SCREENSHOTS, type Pose, type ScanUploadQuery } from '@fitness/shared/schemas'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { call, isApiError, problemText } from '../../../api'
import { askAiCopy } from '../../../copy/ask-ai'
import { COARSE_POINTER_QUERY, tokens } from '../../../theme'
import {
  photoFromFile,
  POSE_LABEL,
  POSES,
  releasePhoto as releaseProgress,
  useUploadPhoto,
} from '../../photos'
import { logPhotoMeal, preparePhoto, releasePhoto } from '../../quick-log'
import { DEFAULT_MASK, MaskEditor, maskedSheet, renderSheet, type MaskBox } from '../../scans/sheet'
import type { DraftAttachment } from './attachments'
import { Blackout, blackedOut } from './Blackout'

/** A scan sheet or a screenshot upload gets a minute on a slow connection. */
const UPLOAD_TIMEOUT_MS = 60_000

type Tag = 'meal' | 'screenshot' | 'scan' | 'progress'

type Step =
  | { kind: 'choose' }
  | { kind: 'rendering'; tag: 'scan' | 'screenshot' }
  | { kind: 'mask'; sheet: HTMLCanvasElement }
  | { kind: 'blackout'; source: HTMLCanvasElement }
  | { kind: 'pose' }
  /** The last stop before a photo goes to the AI: Back, or Send. A scan sheet shows its masked copy. */
  | { kind: 'confirm'; tag: 'meal' }
  | { kind: 'confirm'; tag: 'scan'; sheet: HTMLCanvasElement }
  | { kind: 'working'; tag: Tag }

/** The masked sheet exactly as it will upload, with a preview URL freed when it is replaced or the dialog goes. */
interface ScanCopy {
  blob: Blob
  content_type: ScanUploadQuery['content_type']
  url: string
}

// Progress photo first: the photo of him is the one that must never be tagged as something that goes to the AI.
const TAGS: readonly { tag: Tag; icon: SvgIconComponent }[] = [
  { tag: 'progress', icon: CameraAltOutlined },
  { tag: 'meal', icon: RestaurantRounded },
  { tag: 'screenshot', icon: ScreenshotMonitorOutlined },
  { tag: 'scan', icon: DescriptionOutlined },
]

export interface AttachDialogProps {
  file: File
  /** "Photo 2 of 3" when several were picked. */
  index: number
  total: number
  screenshotsLeft: number
  onAttached: (a: Omit<DraftAttachment, 'key'>) => void
  /** A progress photo was saved privately: the note for under the composer. */
  onSavedPrivately: (note: string) => void
  /** Done with this photo (after attaching, saving, or skipping it). */
  onNext: () => void
  /** Close: drop this photo and any still waiting. */
  onCancel: () => void
}

/** Keyed by the file at the call site, so each photo starts at "choose" with its own client ids. */
export function AttachDialog(props: AttachDialogProps) {
  const { file, index, total, screenshotsLeft, onAttached, onSavedPrivately, onNext, onCancel } = props
  const fullScreen = useMediaQuery(`(max-width: ${tokens.layout.phoneWidth + 210}px)`)
  const queryClient = useQueryClient()
  const uploadProgress = useUploadPhoto()
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [box, setBox] = useState<MaskBox>(DEFAULT_MASK)
  const [boxes, setBoxes] = useState<MaskBox[]>([])
  const [pose, setPose] = useState<Pose>('front')
  // The black-out check before "Add to message": ticked by him for each sheet or screenshot.
  const [covered, setCovered] = useState(false)
  const [scanCopy, setScanCopyState] = useState<ScanCopy | null>(null)
  const scanCopyRef = useRef<ScanCopy | null>(null)
  const setScanCopy = (next: ScanCopy | null) => {
    if (scanCopyRef.current) URL.revokeObjectURL(scanCopyRef.current.url)
    scanCopyRef.current = next
    setScanCopyState(next)
  }
  useEffect(
    () => () => {
      if (scanCopyRef.current) URL.revokeObjectURL(scanCopyRef.current.url)
    },
    [],
  )
  // One client id per photo and path, so a retry after a lost response replays rather than duplicates.
  const [ids] = useState(() => ({
    meal: crypto.randomUUID(),
    scan: crypto.randomUUID(),
    shot: crypto.randomUUID(),
  }))
  // The picked photo, shown only on this device while he picks its tag.
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const busy = step.kind === 'working' || step.kind === 'rendering'
  const run = async (tag: Tag, back: Step, work: () => Promise<void>) => {
    setError(null)
    setStep({ kind: 'working', tag })
    try {
      await work()
    } catch (e) {
      // An ApiError reads in the app's plain wording; a photo that can't be read says so itself.
      setError(isApiError(e) || !(e instanceof Error) ? problemText(e) : e.message)
      setStep(back)
    }
  }

  const logMeal = () =>
    run('meal', { kind: 'confirm', tag: 'meal' }, async () => {
      const photo = await preparePhoto(file)
      try {
        const meal_id = await logPhotoMeal(queryClient, { id: ids.meal, photos: [photo] })
        // The chip keeps the re-encoded thumbnail; it is freed when the chip goes.
        onAttached({
          label: askAiCopy.chip.meal,
          ref: { tag: 'meal', meal_id },
          previewUrl: photo.previewUrl,
        })
        onNext()
      } catch (e) {
        releasePhoto(photo)
        throw e
      }
    })

  const render = async (tag: 'scan' | 'screenshot') => {
    setError(null)
    setStep({ kind: 'rendering', tag })
    try {
      const canvas = await renderSheet(file)
      setCovered(false)
      setStep(tag === 'scan' ? { kind: 'mask', sheet: canvas } : { kind: 'blackout', source: canvas })
    } catch (e) {
      setError(e instanceof Error ? e.message : "That photo couldn't be opened.")
      setStep({ kind: 'choose' })
    }
  }

  /** The masked copy, made once and shown on the confirm, is the one that uploads. */
  const confirmScan = async (sheet: HTMLCanvasElement) => {
    setError(null)
    try {
      const { blob, content_type } = await maskedSheet(sheet, box)
      setScanCopy({ blob, content_type, url: URL.createObjectURL(blob) })
      setStep({ kind: 'confirm', tag: 'scan', sheet })
    } catch (e) {
      setError(e instanceof Error ? e.message : "That sheet couldn't be prepared.")
    }
  }

  const uploadScan = (sheet: HTMLCanvasElement, copy: ScanCopy) =>
    run('scan', { kind: 'confirm', tag: 'scan', sheet }, async () => {
      const { blob, content_type } = copy
      const result = await call(
        endpoints.scans.upload,
        { query: { id: ids.scan, content_type }, body: await blob.arrayBuffer() },
        { timeoutMs: UPLOAD_TIMEOUT_MS },
      )
      onAttached({
        label: askAiCopy.chip.scan,
        ref: { tag: 'scan', scan_id: result.scan.id },
        previewUrl: null,
      })
      onNext()
    })

  const uploadScreenshot = (source: HTMLCanvasElement) =>
    run('screenshot', { kind: 'blackout', source }, async () => {
      const { blob, contentType } = await blackedOut(source, boxes)
      await call(
        endpoints.ai.attachment,
        { query: { attachment_id: ids.shot, content_type: contentType }, body: await blob.arrayBuffer() },
        { timeoutMs: UPLOAD_TIMEOUT_MS },
      )
      const n = MAX_SCREENSHOTS - screenshotsLeft + 1
      onAttached({
        label: askAiCopy.chip.screenshot(n),
        ref: { tag: 'screenshot', id: ids.shot },
        // Only the blacked-out copy is ever shown again.
        previewUrl: URL.createObjectURL(blob),
      })
      onNext()
    })

  const saveProgress = () =>
    run('progress', { kind: 'pose' }, async () => {
      const photo = await photoFromFile(file)
      try {
        const outcome = await uploadProgress(photo, { pose, takenAt: new Date().toISOString() })
        onSavedPrivately(outcome.status === 'queued' ? askAiCopy.progressQueued : askAiCopy.progressSaved)
        onNext()
      } finally {
        releaseProgress(photo)
      }
    })

  const choose = (tag: Tag) => {
    if (tag === 'meal') setStep({ kind: 'confirm', tag: 'meal' })
    else if (tag === 'progress') setStep({ kind: 'pose' })
    else void render(tag)
  }

  const title =
    step.kind === 'mask'
      ? askAiCopy.maskTitle
      : step.kind === 'blackout'
        ? askAiCopy.blackoutTitle
        : step.kind === 'pose'
          ? askAiCopy.poseTitle
          : step.kind === 'confirm'
            ? askAiCopy.toAiTitle
            : askAiCopy.attachTitle

  return (
    <Dialog
      open
      onClose={busy ? undefined : onCancel}
      fullScreen={fullScreen}
      fullWidth
      maxWidth="sm"
      aria-labelledby="ask-ai-attach-title"
      data-testid="ask-ai-attach"
      sx={fullScreen ? { '& .MuiDialog-paper': { borderRadius: 0, border: 0 } } : undefined}
    >
      <DialogTitle id="ask-ai-attach-title" sx={{ display: 'flex', alignItems: 'center', gap: 2, pr: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {title}
          {total > 1 && (
            <Box
              component="span"
              sx={{
                display: 'block',
                fontSize: tokens.font.size.caption,
                fontWeight: tokens.font.weight.body,
                color: tokens.ink.muted,
              }}
            >
              {askAiCopy.attachOf(index, total)}
            </Box>
          )}
        </Box>
        <IconButton aria-label="Close" onClick={onCancel} disabled={busy}>
          <CloseRounded fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3, alignContent: 'start' }}>
        {error && <Alert severity="error">{error}</Alert>}

        {step.kind === 'choose' && (
          <>
            {preview && (
              <Box
                component="img"
                src={preview}
                alt=""
                sx={{
                  justifySelf: 'center',
                  maxWidth: '100%',
                  maxHeight: 220,
                  borderRadius: `${tokens.radius.control}px`,
                  objectFit: 'contain',
                }}
              />
            )}
            <Box
              role="group"
              aria-label="Tag"
              sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: '8px' }}
            >
              {TAGS.map(({ tag, icon: Icon }) => {
                const words = askAiCopy.tags[tag]
                const full = tag === 'screenshot' && screenshotsLeft === 0
                return (
                  <ButtonBase
                    key={tag}
                    data-testid={`ask-ai-tag-${tag}`}
                    disabled={full}
                    onClick={() => choose(tag)}
                    sx={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      gap: '12px',
                      p: '12px 14px',
                      textAlign: 'left',
                      borderRadius: `${tokens.radius.control}px`,
                      bgcolor: tokens.ink.panel,
                      boxShadow: `inset 0 0 0 1px ${tokens.ink.hairline}`,
                      '&:hover': { bgcolor: tokens.summit.surface.soft },
                      '&.Mui-focusVisible': {
                        outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
                      },
                      '&.Mui-disabled': { opacity: 0.55 },
                      [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
                    }}
                  >
                    <Icon sx={{ fontSize: 22, mt: '1px', color: tokens.accent.main }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          fontSize: tokens.font.size.body,
                          fontWeight: tokens.font.weight.heading,
                          color: tokens.ink.text,
                        }}
                      >
                        {words.label}
                      </Box>
                      <Box
                        sx={{
                          fontSize: tokens.font.size.caption,
                          lineHeight: tokens.font.leading.caption,
                          color: tokens.ink.muted,
                        }}
                      >
                        {full ? askAiCopy.screenshotsFull(MAX_SCREENSHOTS) : words.hint}
                      </Box>
                    </Box>
                  </ButtonBase>
                )
              })}
            </Box>
            <Actions>
              <Button variant="outlined" onClick={onNext}>
                {askAiCopy.skip}
              </Button>
            </Actions>
          </>
        )}

        {step.kind === 'rendering' && <Working text={askAiCopy.opening} />}

        {step.kind === 'mask' && (
          <>
            <Help>{askAiCopy.maskHelp}</Help>
            <MaskEditor sheet={step.sheet} box={box} onChange={setBox} />
            <CoveredCheck checked={covered} onChange={setCovered} />
            <Actions>
              <Button variant="outlined" onClick={() => setStep({ kind: 'choose' })}>
                {askAiCopy.back}
              </Button>
              <Button
                variant="contained"
                data-testid="ask-ai-attach-confirm"
                disabled={!covered}
                onClick={() => void confirmScan(step.sheet)}
              >
                {askAiCopy.addToMessage}
              </Button>
            </Actions>
          </>
        )}

        {step.kind === 'blackout' && (
          <>
            <Help>{askAiCopy.blackoutHelp}</Help>
            <Blackout source={step.source} boxes={boxes} onChange={setBoxes} />
            <CoveredCheck checked={covered} onChange={setCovered} />
            <Actions>
              <Button variant="outlined" onClick={() => setBoxes([])} disabled={boxes.length === 0}>
                {askAiCopy.blackoutClear}
              </Button>
              <Button
                variant="contained"
                data-testid="ask-ai-attach-confirm"
                disabled={!covered}
                onClick={() => void uploadScreenshot(step.source)}
              >
                {askAiCopy.addToMessage}
              </Button>
            </Actions>
          </>
        )}

        {step.kind === 'pose' && (
          <>
            <Box
              sx={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                fontSize: tokens.font.size.small,
                lineHeight: tokens.font.leading.small,
                color: tokens.ink.label,
              }}
            >
              <LockOutlined sx={{ fontSize: 18, mt: '1px', color: tokens.accent.main }} />
              {askAiCopy.progressSaved}
            </Box>
            <Box role="radiogroup" aria-label="Pose" sx={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {POSES.map((p) => (
                <Chip
                  key={p}
                  role="radio"
                  aria-checked={pose === p}
                  label={POSE_LABEL[p]}
                  variant={pose === p ? 'filled' : 'outlined'}
                  color={pose === p ? 'primary' : 'default'}
                  onClick={() => setPose(p)}
                />
              ))}
            </Box>
            <Actions>
              <Button variant="outlined" onClick={() => setStep({ kind: 'choose' })}>
                {askAiCopy.back}
              </Button>
              <Button
                variant="contained"
                data-testid="ask-ai-attach-confirm"
                onClick={() => void saveProgress()}
              >
                {askAiCopy.savePhoto}
              </Button>
            </Actions>
          </>
        )}

        {step.kind === 'confirm' && (
          <>
            {(step.tag === 'meal' ? preview : scanCopy?.url) && (
              <Box
                component="img"
                src={(step.tag === 'meal' ? preview : scanCopy?.url) ?? undefined}
                alt=""
                sx={{
                  justifySelf: 'center',
                  maxWidth: '100%',
                  maxHeight: 220,
                  borderRadius: `${tokens.radius.control}px`,
                  objectFit: 'contain',
                }}
              />
            )}
            <Box
              data-testid="ask-ai-attach-to-ai"
              sx={{
                fontSize: tokens.font.size.body,
                lineHeight: tokens.font.leading.body,
                color: tokens.ink.text,
              }}
            >
              {askAiCopy.toAi[step.tag]}
            </Box>
            <Actions>
              <Button
                variant="outlined"
                onClick={() =>
                  setStep(step.tag === 'meal' ? { kind: 'choose' } : { kind: 'mask', sheet: step.sheet })
                }
              >
                {askAiCopy.back}
              </Button>
              <Button
                variant="contained"
                data-testid="ask-ai-attach-send"
                onClick={() => {
                  if (step.tag === 'meal') void logMeal()
                  else if (scanCopy) void uploadScan(step.sheet, scanCopy)
                }}
              >
                {askAiCopy.send}
              </Button>
            </Actions>
          </>
        )}

        {step.kind === 'working' && <Working text={askAiCopy.working[step.tag]} />}
      </DialogContent>
    </Dialog>
  )
}

/** The black-out check: "Add to message" waits until he ticks that his name, face and email are covered. */
function CoveredCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <FormControlLabel
      data-testid="ask-ai-covered"
      control={<Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} />}
      label={askAiCopy.coveredCheck}
      sx={{
        m: 0,
        '& .MuiFormControlLabel-label': { fontSize: tokens.font.size.small, color: tokens.ink.text },
      }}
    />
  )
}

function Help({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        fontSize: tokens.font.size.small,
        lineHeight: tokens.font.leading.small,
        color: tokens.ink.muted,
      }}
    >
      {children}
    </Box>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 2,
        justifyContent: 'flex-end',
        flexWrap: 'wrap',
        position: 'sticky',
        bottom: 0,
        bgcolor: tokens.ink.card,
        py: 3,
      }}
    >
      {children}
    </Box>
  )
}

function Working({ text }: { text: string }) {
  return (
    <Box
      role="status"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        py: 6,
        justifyContent: 'center',
        color: tokens.ink.muted,
        fontSize: tokens.font.size.small,
      }}
    >
      <CircularProgress size={24} /> {text}
    </Box>
  )
}
