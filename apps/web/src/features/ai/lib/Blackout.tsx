// Owns: the screenshot black-out step (SPEC §9 privacy) — the rendered screenshot at the dialog's width, where Aaron
// drags across anything private (his name, a face) to paint a black box over it, as many as he needs, each with its own
// remove button; and the export: the screenshot downscaled to at most 1,600 px on the long side with every box painted
// solid black, re-encoded as WebP (JPEG where the browser cannot encode WebP), so EXIF never leaves the device and only
// the blacked-out pixels are uploaded. Boxes are kept in fractions of the image, so the export paints what he saw.
import CloseRounded from '@mui/icons-material/CloseRounded'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import type { ImageType } from '@fitness/shared/schemas'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { askAiCopy } from '../../../copy/ask-ai'
import { tokens } from '../../../theme'
import { MASK_COLOUR, type MaskBox } from '../../scans/sheet'

/** The Worker keeps screenshots small for the vision call (≤ ~1,600 px, ≤ 2 MB). */
const MAX_SCREENSHOT_EDGE = 1600
const QUALITY = 0.85
/** A drag smaller than this (a fraction of either side) was a tap, not a box. */
const MIN = 0.02

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
  for (const b of boxes)
    ctx.fillRect(b.x * canvas.width, b.y * canvas.height, b.w * canvas.width, b.h * canvas.height)
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
    if (!frame.current || e.button > 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = frame.current.getBoundingClientRect()
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

  const shown = draft ? [...boxes, draft] : boxes
  return (
    <Box
      ref={frame}
      data-testid="ask-ai-blackout"
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
  )
}
