// Owns: the capture screen (/photos/new) — a live camera (rear/front toggle, optional 3 s / 10 s self-timer) behind a
// faint pose outline (public/pose/<pose>.svg at 25 %) so every photo lines up, a file picker fallback, the pose
// selector (front → side → back, advancing after each save), then a preview with time and note, and the upload.
// The shot is downscaled to 1,024 px and re-encoded on the phone (EXIF never leaves it); it is never sent to any AI.
import Cameraswitch from '@mui/icons-material/Cameraswitch'
import CheckCircle from '@mui/icons-material/CheckCircle'
import PhotoLibraryOutlined from '@mui/icons-material/PhotoLibraryOutlined'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ButtonBase from '@mui/material/ButtonBase'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import useMediaQuery from '@mui/material/useMediaQuery'
import { Pose } from '@fitness/shared/schemas'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { clockOf, dateOf, instantAt } from '../../quick-log'
import { outlinedIconButton, PageHeader, Reveal, Segmented, staggerDelay } from '../../../components'
import { COARSE_POINTER_QUERY, theme, tokens, withAlpha } from '../../../theme'
import { POSE_LABEL, POSES, useRefreshPhotos, useUploadPhoto } from './data'
import { photoFromFile, photoFromVideo, releasePhoto, type PreparedPhoto } from './prepare'
import { problemText } from '../../../api'

type Facing = 'environment' | 'user'
type CameraState = 'starting' | 'live' | 'denied' | 'unavailable'
type Timer = 0 | 3 | 10

const OVERLAY_OPACITY = 0.25
/** Top bar, pose selector, shutter row, timer and bottom tabs: the height the viewfinder leaves for them. */
const VIEWFINDER_RESERVED_PX = 400
/** From `md`: the 56 px header, the title row and the main padding (the controls sit beside the viewfinder). */
const VIEWFINDER_RESERVED_DESKTOP_PX = 240
const PREFS_KEY = 'photos.capture'
/** 2a's entrance: after the title row, the capture card group rises in, a section's stagger later. */
const ENTER_DELAY = staggerDelay(1, tokens.motion.stagger.section)

interface CapturePrefs {
  facing: Facing
  timer: Timer
}

function readPrefs(): CapturePrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<CapturePrefs>
    return { facing: raw.facing === 'user' ? 'user' : 'environment', timer: raw.timer === 3 || raw.timer === 10 ? raw.timer : 0 }
  } catch {
    return { facing: 'environment', timer: 0 }
  }
}

function savePrefs(prefs: CapturePrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    // Private mode: the choice just isn't remembered.
  }
}

/** "2026-10-05T07:42" in Edmonton, for <input type="datetime-local">. */
const toLocalInput = (instant: number | string) => `${dateOf(instant)}T${clockOf(instant)}`

/** The camera stream for `facing` while `active`; stops every track on change and unmount. */
function useCamera(facing: Facing, active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<CameraState>('starting')
  useEffect(() => {
    if (!active) return
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable')
      return
    }
    let stream: MediaStream | null = null
    let cancelled = false
    setState('starting')
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false })
      .then(async (s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        const video = videoRef.current
        if (video) {
          video.srcObject = s
          await video.play().catch(() => undefined)
        }
        setState('live')
      })
      .catch((e: unknown) => {
        if (!cancelled) setState(e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'unavailable')
      })
    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [facing, active])
  return { videoRef, state }
}

export function CaptureScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const initial = Pose.safeParse(params.get('pose'))
  const [pose, setPose] = useState<Pose>(initial.success ? initial.data : 'front')
  const [prefs, setPrefs] = useState<CapturePrefs>(readPrefs)
  const [saved, setSaved] = useState<Pose[]>([])
  const [shot, setShot] = useState<PreparedPhoto | null>(null)
  const [takenAt, setTakenAt] = useState('')
  const [note, setNote] = useState('')
  const [countdown, setCountdown] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  /** Photos saved to this phone's offline queue (they upload when it is back online). */
  const [queued, setQueued] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const refresh = useRefreshPhotos()
  const uploadPhoto = useUploadPhoto()
  const { videoRef, state: camera } = useCamera(prefs.facing, true)
  const desktop = useMediaQuery(theme.breakpoints.up('md'), { noSsr: true })

  const updatePrefs = (next: Partial<CapturePrefs>) => {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    savePrefs(merged)
  }

  // Release the preview's object URL when it is replaced or the screen closes.
  useEffect(() => () => releasePhoto(shot), [shot])

  const keep = (photo: PreparedPhoto, at: number | string) => {
    setShot(photo)
    setTakenAt(toLocalInput(at))
    setProblem(null)
  }

  const capture = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      keep(await photoFromVideo(video), Date.now())
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e))
    }
  }

  // Self-timer: tick once a second, shoot at zero.
  useEffect(() => {
    if (countdown === null) return
    if (countdown === 0) {
      setCountdown(null)
      void capture()
      return
    }
    const t = setTimeout(() => setCountdown((n) => (n === null ? null : n - 1)), 1000)
    return () => clearTimeout(t)
    // capture() reads the video through its ref and only calls state setters, so it is safe to omit here.
  }, [countdown])

  const shutter = () => {
    if (countdown !== null) return setCountdown(null)
    if (prefs.timer === 0) return void capture()
    setCountdown(prefs.timer)
  }

  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const photo = await photoFromFile(file)
      keep(photo, file.lastModified && file.lastModified < Date.now() ? file.lastModified : Date.now())
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err))
    }
  }

  const save = async () => {
    if (!shot) return
    const [date, time] = takenAt.split('T')
    if (!date || !time) return setProblem('Pick when the photo was taken.')
    setUploading(true)
    setProblem(null)
    try {
      const outcome = await uploadPhoto(shot, { pose, takenAt: instantAt(date, time.slice(0, 5)), note })
      const queuedNow = queued + (outcome.status === 'queued' ? 1 : 0)
      setQueued(queuedNow)
      refresh()
      const done = saved.includes(pose) ? saved : [...saved, pose]
      setSaved(done)
      setShot(null)
      setNote('')
      const next = POSES.find((p) => !done.includes(p))
      if (next) setPose(next)
      // A queued photo is not in the library yet: stay here with the note rather than show a set without it.
      else if (queuedNow === 0) navigate('/photos', { replace: true })
    } catch (err) {
      setProblem(`The photo is still here. ${problemText(err)}`)
    } finally {
      setUploading(false)
    }
  }

  const mirrored = prefs.facing === 'user'
  const noCamera = camera === 'denied' || camera === 'unavailable'

  return (
    <Stack spacing={`${tokens.rhythm.section}px`}>
      {/* The phone keeps every pixel for the viewfinder: its top bar names the page, so the 2a title row is desktop only. */}
      {desktop && <PageHeader title="New photos" subtitle={`${POSE_LABEL[pose]} now. Front, side and back, lined up with the outline; downscaled on this device.`} />}
      <Reveal delay={ENTER_DELAY}>
        <Box
          data-testid="photo-capture"
          sx={{
            display: 'grid',
            gap: 3,
            width: '100%',
            maxWidth: { xs: 480, md: 'none' },
            mx: { xs: 'auto', md: 0 },
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'auto minmax(260px, 1fr)' },
            gridTemplateAreas: { xs: '"pose" "frame" "notes" "controls"', md: '"frame pose" "frame notes" "frame controls"' },
            gridTemplateRows: { md: 'auto auto 1fr' },
            columnGap: { md: 6 },
            alignItems: 'start',
          }}
        >
          <Box sx={{ gridArea: 'pose', minWidth: 0 }}>
            <Segmented
              ariaLabel="Pose"
              fullWidth
              value={pose}
              onChange={setPose}
              testId="capture-pose"
              options={POSES.map((p) => ({
                value: p,
                disabled: uploading,
                label: (
                  <>
                    {saved.includes(p) && <CheckCircle sx={{ fontSize: 16, mr: '6px', color: tokens.tone.success.solid }} aria-label="saved" />}
                    {POSE_LABEL[p]}
                  </>
                ),
              }))}
            />
          </Box>

          <Box
            sx={{
              gridArea: 'frame',
              position: 'relative',
              // 3:4 at the largest size that leaves the controls on screen (the crop on capture matches this frame). From
              // `md` the controls sit beside it, so only the header and the title row take height.
              height: {
                xs: `min(calc(100dvh - ${VIEWFINDER_RESERVED_PX}px), calc((100vw - 32px) * 4 / 3), 640px)`,
                md: `min(calc(100dvh - ${VIEWFINDER_RESERVED_DESKTOP_PX}px), 640px)`,
              },
              minHeight: 240,
              aspectRatio: '3 / 4',
              width: 'auto',
              maxWidth: '100%',
              justifySelf: 'center',
              borderRadius: `${tokens.radius.card}px`,
              overflow: 'hidden',
              bgcolor: tokens.ink.text,
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              aria-label="Camera"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: mirrored ? 'scaleX(-1)' : undefined,
                visibility: camera === 'live' && !shot ? 'visible' : 'hidden',
              }}
            />
            {shot ? (
              <img src={shot.previewUrl} alt={`${POSE_LABEL[pose]} photo preview`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <img
                src={`${import.meta.env.BASE_URL}pose/${pose}.svg`}
                alt=""
                data-testid="pose-overlay"
                style={{ position: 'absolute', inset: '4% 0', width: '100%', height: '92%', objectFit: 'contain', opacity: OVERLAY_OPACITY, pointerEvents: 'none' }}
              />
            )}
            {!shot && noCamera && (
              <Box sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, p: 4, color: tokens.ink.card, fontSize: tokens.font.size.small, textAlign: 'center', bgcolor: withAlpha(tokens.ink.text, 0.7) }}>
                {camera === 'denied' ? 'Camera access is off for this app. Allow it in Settings, or choose a photo.' : 'No camera here. Choose a photo instead.'}
              </Box>
            )}
            {countdown !== null && (
              <Box aria-live="assertive" sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 96, fontWeight: tokens.font.weight.number, color: tokens.ink.card, textShadow: `0 0 12px ${withAlpha(tokens.ink.text, 0.6)}` }}>
                {countdown}
              </Box>
            )}
          </Box>

          {(problem || queued > 0) && (
            <Stack spacing={3} sx={{ gridArea: 'notes', minWidth: 0 }}>
              {problem && (
                <Alert severity="warning" onClose={() => setProblem(null)}>
                  {problem}
                </Alert>
              )}
              {queued > 0 && (
                <Alert severity="info" data-testid="capture-queued">
                  {queued === 1 ? 'One photo is' : `${queued} photos are`} saved on this phone and will upload when you're back online.
                </Alert>
              )}
            </Stack>
          )}

          <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => void pickFile(e)} data-testid="capture-file" />

          {shot ? (
            <Stack spacing={3} sx={{ gridArea: 'controls', minWidth: 0 }}>
              <TextField
                type="datetime-local"
                label="Taken"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
              <Stack direction="row" spacing={3}>
                <Button variant="outlined" onClick={() => setShot(null)} disabled={uploading} sx={{ flex: 1 }}>
                  Retake
                </Button>
                <Button variant="contained" onClick={() => void save()} disabled={uploading} sx={{ flex: 2 }} data-testid="capture-save">
                  {uploading ? 'Saving…' : `Save ${POSE_LABEL[pose].toLowerCase()}`}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={3} sx={{ gridArea: 'controls', minWidth: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
                <Box>
                  <IconButton aria-label="Choose a photo" size="large" onClick={() => fileInput.current?.click()} sx={outlinedIconButton}>
                    <PhotoLibraryOutlined />
                  </IconButton>
                </Box>
                <ButtonBase
                  aria-label={countdown !== null ? 'Cancel timer' : `Take ${POSE_LABEL[pose].toLowerCase()} photo`}
                  onClick={shutter}
                  disabled={camera !== 'live'}
                  data-testid="capture-shutter"
                  sx={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    border: `4px solid ${camera === 'live' ? tokens.metric.weight : tokens.ink.border}`,
                    p: '4px',
                  }}
                >
                  <Box sx={{ width: '100%', height: '100%', borderRadius: '50%', bgcolor: camera === 'live' ? tokens.metric.weight : tokens.ink.border }} />
                </ButtonBase>
                <Box sx={{ justifySelf: 'end' }}>
                  <IconButton
                    aria-label={prefs.facing === 'user' ? 'Use the rear camera' : 'Use the front camera'}
                    onClick={() => updatePrefs({ facing: prefs.facing === 'user' ? 'environment' : 'user' })}
                    disabled={noCamera}
                    size="large"
                    sx={outlinedIconButton}
                  >
                    <Cameraswitch />
                  </IconButton>
                </Box>
              </Box>
              {/* Segmented gives touch segments 44 px of height, not of width: "Off" and "3 s" need the width too. */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, [COARSE_POINTER_QUERY]: { '& .MuiToggleButton-root': { minWidth: tokens.tapTarget } } }}>
                <Box sx={{ fontSize: tokens.font.size.label, fontWeight: tokens.font.weight.label, color: tokens.ink.label }}>Timer</Box>
                <Segmented
                  ariaLabel="Self-timer"
                  size="small"
                  value={prefs.timer}
                  onChange={(next) => updatePrefs({ timer: next })}
                  options={[
                    { value: 0, label: 'Off' },
                    { value: 3, label: '3 s' },
                    { value: 10, label: '10 s' },
                  ]}
                />
              </Box>
              {noCamera && (
                <Button variant="contained" startIcon={<PhotoLibraryOutlined />} onClick={() => fileInput.current?.click()}>
                  Choose a {POSE_LABEL[pose].toLowerCase()} photo
                </Button>
              )}
              <Box sx={{ fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary, textAlign: 'center' }}>
                Same spot, same light, line up with the outline. Never sent to any AI.
              </Box>
            </Stack>
          )}
        </Box>
      </Reveal>
    </Stack>
  )
}
