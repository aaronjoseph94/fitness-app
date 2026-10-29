// Owns: the screenshot black-out step (SPEC §9 privacy) — the rendered screenshot at the dialog's width, where Aaron
// drags across anything private (his name, a face) to paint a black box over it, as many as he needs, each with its own
// remove button, or adds one from the keyboard ("Add a box", then arrows move it and Shift + arrows resize it); and the
// export: the screenshot downscaled to at most 1,600 px on the long side with every box, grown by 1% of the long side
// on each edge so a tight box leaves no sliver, painted solid black, re-encoded as WebP (JPEG where the browser cannot
// encode WebP), so EXIF never leaves the device and only the blacked-out pixels are uploaded. Boxes are kept in
// fractions of the drawn image (measured on the canvas itself, not its bordered frame), so the export paints what he saw.
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import type { ImageType } from '@fitness/shared/schemas'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { askAiCopy } from '../../../copy/ask-ai'
import { tokens } from '../../../theme'
import { MASK_COLOUR, type MaskBox } from '../../scans/sheet'

/** The Worker keeps screenshots small for the vision call (≤ ~1,600 px, ≤ 2 MB). */
const MAX_SCREENSHOT_EDGE = 1600
const QUALITY = 0.85
/** A drag smaller than this (a fraction of either side) was a tap, not a box. */
const MIN = 0.02
/** Each exported box grows by this fraction of the long side on every edge, so a box drawn tight leaves no sliver. */
const PAD = 0.01
/** The box "Add a box" places (fractions), and how far one arrow press moves or resizes it. */
const KEY_BOX: MaskBox = { x: 0.3, y: 0.45, w: 0.4, h: 0.1 }
const KEY_STEP = 0.02

const clamp = (v: number) => Math.min(1, Math.max(0, v))

/** The box between two points (fractions), whichever way the drag went. */
function between(ax: number, ay: number, bx: number, by: number): MaskBox {
  return { x: Math.min(ax, bx), y: Math.min(ay, by), w: Math.abs(bx - ax), h: Math.abs(by - ay) }
}

function encode(canvas: HTMLCanvasElement, type: ImageType): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/**
 * The upload copy: scale = min(1, 1600 / long side), every box filled with solid black, re-encoded. Throws a plain
 * Error when the browser cannot encode either type.
 */
export async function blackedOut(
  source: HTMLCanvasElement,
  boxes: readonly MaskBox[],
): Promise<{ blob: Blob; contentType: ImageType }> {
  const scale = Math.min(1, MAX_SCREENSHOT_EDGE / Math.max(source.width, source.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.width * scale))
  canvas.height = Math.max(1, Math.round(source.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser can't prepare screenshots.")
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  ctx.fillStyle = MASK_COLOUR
  const pad = PAD * Math.max(canvas.width, canvas.height)
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x * canvas.width - pad))
    const y0 = Math.max(0, Math.floor(b.y * canvas.height - pad))
    const x1 = Math.min(canvas.width, Math.ceil((b.x + b.w) * canvas.width + pad))
    const y1 = Math.min(canvas.height, Math.ceil((b.y + b.h) * canvas.height + pad))
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
  }
  // Safari answers an unsupported type with a PNG: check what came back, then fall back to JPEG.
  let contentType: ImageType = 'image/webp'
  let blob = await encode(canvas, contentType)
  if (!blob || blob.type !== contentType) {
    contentType = 'image/jpeg'
    blob = await encode(canvas, contentType)
  }
  if (!blob || blob.type !== contentType) throw new Error("This browser can't re-encode screenshots.")
  return { blob, contentType }
}

export function Blackout({
  source,
  boxes,
  onChange,
}: {
  source: HTMLCanvasElement
  boxes: readonly MaskBox[]
  onChange: (boxes: MaskBox[]) => void
}) {
  const view = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; rect: DOMRect } | null>(null)
  const [draft, setDraft] = useState<MaskBox | null>(null)
  const hint = useId()

  useEffect(() => {
    const canvas = view.current
    if (!canvas) return
    canvas.width = source.width
    canvas.height = source.height
    canvas.getContext('2d')?.drawImage(source, 0, 0)
  }, [source])

  const at = (e: ReactPointerEvent, rect: DOMRect) => ({
    x: clamp((e.clientX - rect.left) / rect.width),
    y: clamp((e.clientY - rect.top) / rect.height),
  })
  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    // The canvas's own rect: the frame's 1 px border would shift and stretch every fraction.
    if (!view.current || e.button > 0) return
    e.preventDefault()
    frame.current?.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = view.current.getBoundingClientRect()
    start.current = { ...at(e, rect), rect }
    setDraft(null)
  }
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current
    if (!s) return
    const p = at(e, s.rect)
    setDraft(between(s.x, s.y, p.x, p.y))
  }
  const up = () => {
    if (draft && draft.w >= MIN && draft.h >= MIN) onChange([...boxes, draft])
    start.current = null
    setDraft(null)
  }

  // Keyboard: arrows move the last box, Shift + arrows resize it, Delete removes it.
  const key = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const last = boxes.at(-1)
    if (!last) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      onChange(boxes.slice(0, -1))
      return
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]
    if (!d) return
    e.preventDefault()
    const [dx, dy] = d as [number, number]
    const b = e.shiftKey
      ? {
          ...last,
          w: Math.min(1 - last.x, Math.max(MIN, last.w + dx * KEY_STEP)),
          h: Math.min(1 - last.y, Math.max(MIN, last.h + dy * KEY_STEP)),
        }
      : {
          ...last,
          x: Math.min(1 - last.w, Math.max(0, last.x + dx * KEY_STEP)),
          y: Math.min(1 - last.h, Math.max(0, last.y + dy * KEY_STEP)),
        }
    onChange([...boxes.slice(0, -1), b])
  }
  const addBox = () => {
    onChange([...boxes, KEY_BOX])
    frame.current?.focus()
  }

  const shown = draft ? [...boxes, draft] : boxes
  return (
    <Box sx={{ display: 'grid', gap: '8px' }}>
      <Box
        ref={frame}
        data-testid="ask-ai-blackout"
        tabIndex={0}
        aria-label={askAiCopy.blackoutTitle}
        aria-describedby={hint}
        onKeyDown={key}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        sx={{
          position: 'relative',
          width: '100%',
          userSelect: 'none',
          border: `1px solid ${tokens.ink.border}`,
          borderRadius: `${tokens.radius.control}px`,
          overflow: 'hidden',
          cursor: 'crosshair',
          // Drawing owns the gesture on the image; the dialog still scrolls from its edges and buttons.
          touchAction: 'none',
          '&:focus-visible': { outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}` },
        }}
      >
        <Box
          component="canvas"
          ref={view}
          aria-label="The screenshot"
          sx={{ display: 'block', width: '100%', height: 'auto' }}
        />
        {shown.map((b, i) => (
          <Box
            key={i}
            data-testid="ask-ai-blackout-box"
            sx={{
              position: 'absolute',
              left: `${b.x * 100}%`,
              top: `${b.y * 100}%`,
              width: `${b.w * 100}%`,
              height: `${b.h * 100}%`,
              bgcolor: MASK_COLOUR,
              outline: `2px dashed ${tokens.accent.main}`,
              outlineOffset: 2,
            }}
          >
            {i < boxes.length && (
              <IconButton
                size="small"
                aria-label={askAiCopy.blackoutBox(i + 1)}
                // The remove tap must not start a new box underneath.
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onChange(boxes.filter((_, n) => n !== i))}
                sx={{
                  position: 'absolute',
                  // Inside the box's corner: the frame clips anything past the image's edge.
                  top: 2,
                  right: 2,
                  width: 28,
                  height: 28,
                  bgcolor: tokens.ink.card,
                  color: tokens.ink.text,
                  border: `2px solid ${tokens.accent.main}`,
                  '&:hover': { bgcolor: tokens.ink.panel },
                }}
              >
                <CloseRounded sx={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        ))}
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <Button variant="text" size="small" onClick={addBox} data-testid="ask-ai-blackout-add">
          {askAiCopy.blackoutAdd}
        </Button>
        <Box
          id={hint}
          sx={{
            fontSize: tokens.font.size.caption,
            lineHeight: tokens.font.leading.caption,
            color: tokens.ink.muted,
          }}
        >
          {askAiCopy.blackoutKeys}
        </Box>
      </Box>
    </Box>
  )
}
