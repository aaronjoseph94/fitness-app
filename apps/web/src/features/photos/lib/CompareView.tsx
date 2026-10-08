// Owns: comparing any two photos — pick "before" and "after", then see them side by side or as one frame with a
// draggable divider (before to its left, after to its right). Shows the trend-weight change and days between them.
import Box from '@mui/material/Box'
import MenuItem from '@mui/material/MenuItem'
import Slider from '@mui/material/Slider'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import type { ProgressPhoto } from '@fitness/shared/schemas'
import { useRef, useState, type PointerEvent } from 'react'
import { formatNumber, formatSigned, Panel, Segmented, tabularNums } from '../../../components'
import { tokens, withAlpha } from '../../../theme'
import { POSE_LABEL } from './data'
import { PhotoFacts, PhotoImage } from './PhotoParts'

export type CompareMode = 'side' | 'slider'

interface CompareViewProps {
  /** The photos to choose from, newest first. */
  photos: readonly ProgressPhoto[]
  before: ProgressPhoto
  after: ProgressPhoto
  mode: CompareMode
  onChange: (next: { before?: string; after?: string; mode?: CompareMode }) => void
}

const DAY_MS = 86_400_000

/** "2026-08-02 · 99.0 kg", with the pose when the list mixes poses. */
function optionLabel(p: ProgressPhoto, withPose: boolean): string {
  const kg = p.weight_kg === null ? '' : ` · ${formatNumber(p.weight_kg, 1)} kg`
  return `${p.date}${withPose ? ` · ${POSE_LABEL[p.pose]}` : ''}${kg}`
}

interface PhotoSelectProps {
  label: string
  value: string
  photos: readonly ProgressPhoto[]
  onPick: (id: string) => void
}

function PhotoSelect({ label, value, photos, onPick }: PhotoSelectProps) {
  const mixed = new Set(photos.map((p) => p.pose)).size > 1
  return (
    <TextField select label={label} value={value} onChange={(e) => onPick(e.target.value)} size="small" sx={{ flex: 1, minWidth: 0 }}>
      {photos.map((p) => (
        <MenuItem key={p.id} value={p.id}>
          {optionLabel(p, mixed)}
        </MenuItem>
      ))}
    </TextField>
  )
}

/** "−2.4 kg trend over 41 days" (or just the days when either photo has no trend weight). */
function changeText(before: ProgressPhoto, after: ProgressPhoto): string {
  const days = Math.round(Math.abs(Date.parse(`${after.date}T00:00:00Z`) - Date.parse(`${before.date}T00:00:00Z`)) / DAY_MS)
  const span = days === 0 ? 'same day' : `${days} ${days === 1 ? 'day' : 'days'} apart`
  if (before.weight_kg === null || after.weight_kg === null) return span
  return `${formatSigned(after.weight_kg - before.weight_kg, 1)} kg trend · ${span}`
}

export function CompareView({ photos, before, after, mode, onChange }: CompareViewProps) {
  return (
    <Panel
      title="Compare two photos"
      description={
        <Box component="span" sx={{ color: tokens.ink.label, fontWeight: tokens.font.weight.label, ...tabularNums }}>
          {changeText(before, after)}
        </Box>
      }
      actions={
        <Segmented
          ariaLabel="Compare as"
          tone="outline"
          size="small"
          value={mode}
          onChange={(next) => onChange({ mode: next })}
          options={[
            { value: 'side', label: 'Side by side' },
            { value: 'slider', label: 'Slider' },
          ]}
        />
      }
      testId="photo-compare"
    >
      <Stack spacing={4}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
          <PhotoSelect label="Before" value={before.id} photos={photos} onPick={(id) => onChange({ before: id })} />
          <PhotoSelect label="After" value={after.id} photos={photos} onPick={(id) => onChange({ after: id })} />
        </Stack>
        {mode === 'side' ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
            {[before, after].map((p, i) => (
              <Box key={`${i}-${p.id}`} sx={{ minWidth: 0 }}>
                <Box sx={{ aspectRatio: '3 / 4', borderRadius: `${tokens.radius.control}px`, overflow: 'hidden', border: `1px solid ${tokens.ink.border}`, bgcolor: tokens.ink.fill }}>
                  <PhotoImage photo={p} eager />
                </Box>
                <PhotoFacts photo={p} showPose />
              </Box>
            ))}
          </Box>
        ) : (
          <RevealSlider before={before} after={after} />
        )}
      </Stack>
    </Panel>
  )
}

/** One frame: `after` underneath, `before` on top clipped to the left of the divider; drag anywhere or use the slider. */
function RevealSlider({ before, after }: { before: ProgressPhoto; after: ProgressPhoto }) {
  const [split, setSplit] = useState(50)
  const frame = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const moveTo = (clientX: number) => {
    const rect = frame.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return
    setSplit(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
  }
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    moveTo(e.clientX)
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => dragging.current && moveTo(e.clientX)
  const stop = () => {
    dragging.current = false
  }

  const label = { position: 'absolute', top: 8, px: 2, py: '3px', borderRadius: `${tokens.radius.badge}px`, fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.label, bgcolor: withAlpha(tokens.ink.card, 0.9), color: tokens.ink.text, pointerEvents: 'none' } as const

  return (
    <Stack spacing={2} data-testid="photo-compare-slider">
      <Box
        ref={frame}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={stop}
        onPointerCancel={stop}
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          mx: 'auto',
          aspectRatio: '3 / 4',
          borderRadius: `${tokens.radius.control}px`,
          overflow: 'hidden',
          border: `1px solid ${tokens.ink.border}`,
          bgcolor: tokens.ink.fill,
          touchAction: 'none',
          userSelect: 'none',
          cursor: 'ew-resize',
        }}
      >
        <Box sx={{ position: 'absolute', inset: 0 }}>
          <PhotoImage photo={after} eager />
        </Box>
        <Box sx={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - split}% 0 0)` }}>
          <PhotoImage photo={before} eager />
        </Box>
        <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: `${split}%`, width: 2, ml: '-1px', bgcolor: tokens.ink.card, pointerEvents: 'none' }}>
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 32,
              height: 32,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              bgcolor: tokens.ink.card,
              border: `2px solid ${tokens.metric.weight}`,
            }}
          />
        </Box>
        <Box sx={{ ...label, left: 8 }}>Before · {before.date}</Box>
        <Box sx={{ ...label, right: 8 }}>After · {after.date}</Box>
      </Box>
      <Box sx={{ px: 2, maxWidth: 480, width: '100%', mx: 'auto' }}>
        <Slider value={split} onChange={(_, v) => setSplit(v as number)} aria-label="Divider position" step={1} min={0} max={100} />
      </Box>
    </Stack>
  )
}
