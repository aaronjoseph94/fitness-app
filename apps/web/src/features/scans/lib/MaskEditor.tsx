// Owns: the name-masking step — the rendered sheet at the screen's width with one black box Aaron drags over his name
// and resizes from its corners (pointer events, so touch and mouse both work). The box is kept in fractions of the
// sheet, so the export paints exactly what he saw.
import Box from '@mui/material/Box'
import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { tokens } from '../../../theme'
import { MASK_COLOUR, type MaskBox } from './sheet'

type Drag = { mode: 'move' | 'nw' | 'se'; startX: number; startY: number; start: MaskBox; rect: DOMRect }

const MIN = 0.03
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Apply a pointer move (dx, dy as fractions) to the box for one drag mode, keeping it on the sheet. */
function moved(d: Drag, dx: number, dy: number): MaskBox {
  const b = d.start
  if (d.mode === 'move') return { ...b, x: clamp(b.x + dx, 0, 1 - b.w), y: clamp(b.y + dy, 0, 1 - b.h) }
  if (d.mode === 'se') return { ...b, w: clamp(b.w + dx, MIN, 1 - b.x), h: clamp(b.h + dy, MIN, 1 - b.y) }
  const x = clamp(b.x + dx, 0, b.x + b.w - MIN)
  const y = clamp(b.y + dy, 0, b.y + b.h - MIN)
  return { x, y, w: b.x + b.w - x, h: b.y + b.h - y }
}

export function MaskEditor({ sheet, box, onChange }: { sheet: HTMLCanvasElement; box: MaskBox; onChange: (box: MaskBox) => void }) {
  const view = useRef<HTMLCanvasElement>(null)
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)

  useEffect(() => {
    const canvas = view.current
    if (!canvas) return
    canvas.width = sheet.width
    canvas.height = sheet.height
    canvas.getContext('2d')?.drawImage(sheet, 0, 0)
  }, [sheet])

  const start = (mode: Drag['mode']) => (e: ReactPointerEvent<HTMLElement>) => {
    if (!frame.current) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { mode, startX: e.clientX, startY: e.clientY, start: box, rect: frame.current.getBoundingClientRect() }
  }
  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    onChange(moved(d, (e.clientX - d.startX) / d.rect.width, (e.clientY - d.startY) / d.rect.height))
  }
  const end = () => {
    drag.current = null
  }
  const handle = (mode: 'nw' | 'se') => (
    <Box
      role="presentation"
      onPointerDown={start(mode)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      sx={{
        position: 'absolute',
        width: 28,
        height: 28,
        borderRadius: `${tokens.radius.pill}px`,
        bgcolor: tokens.ink.card,
        border: `3px solid ${tokens.accent.main}`,
        touchAction: 'none',
        cursor: 'nwse-resize',
        ...(mode === 'se' ? { right: 2, bottom: 2 } : { left: 2, top: 2 }),
      }}
    />
  )

  return (
    <Box ref={frame} data-testid="scan-mask-editor" sx={{ position: 'relative', width: '100%', userSelect: 'none', border: `1px solid ${tokens.ink.border}`, borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', touchAction: 'pan-y' }}>
      <Box component="canvas" ref={view} aria-label="The result sheet" sx={{ display: 'block', width: '100%', height: 'auto' }} />
      <Box
        data-testid="scan-mask-box"
        aria-label="Black box hiding the name: drag to move, drag a corner to resize"
        onPointerDown={start('move')}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        sx={{
          position: 'absolute',
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.w * 100}%`,
          height: `${box.h * 100}%`,
          bgcolor: MASK_COLOUR,
          outline: `2px dashed ${tokens.accent.main}`,
          outlineOffset: 2,
          cursor: 'move',
          touchAction: 'none',
        }}
      >
        {handle('nw')}
        {handle('se')}
      </Box>
    </Box>
  )
}
