// Owns: the small pieces every photo view shares — the image behind a short-lived signed link (lazy, 3:4, asks for
// fresh links once when one fails), the facts line (date, trend weight, nearest scan) and the pose filter chips.
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import type { Pose, ProgressPhoto } from '@fitness/shared/schemas'
import { useState, type CSSProperties } from 'react'
import { formatNumber, formatShortDate } from '../../../components'
import { tokens } from '../../../theme'
import { POSE_LABEL, POSES, useRefreshPhotos } from './data'

interface PhotoImageProps {
  photo: ProgressPhoto
  /** Default `cover` (tiles); `contain` shows the whole photo. */
  fit?: CSSProperties['objectFit']
  /** Eager for the photo in view (viewer, compare); lazy for grids. */
  eager?: boolean
  style?: CSSProperties
}

/** The photo itself. A failed load (usually an expired link) refreshes the list once; the new URL then re-renders it. */
export function PhotoImage({ photo, fit = 'cover', eager = false, style }: PhotoImageProps) {
  const refresh = useRefreshPhotos()
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <img
      src={photo.url}
      alt={`${POSE_LABEL[photo.pose]} photo, ${photo.date}`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable={false}
      onError={() => {
        if (failedUrl === photo.url) return
        setFailedUrl(photo.url)
        refresh()
      }}
      style={{ display: 'block', width: '100%', height: '100%', objectFit: fit, backgroundColor: tokens.chart.grid, ...style }}
    />
  )
}

/** "93.8 kg" in the weight colour, or null when there is no trend yet. */
export function TrendWeight({ kg, size = 13 }: { kg: number | null; size?: number }) {
  if (kg === null) return null
  return (
    <Box component="span" sx={{ color: tokens.metric.weight, fontWeight: tokens.font.weight.label, fontSize: size, fontVariantNumeric: 'tabular-nums' }}>
      {formatNumber(kg, 1)} kg
    </Box>
  )
}

/** "Scan Sep 26 · 30.6 % fat" ("Scan Sep 26" when `compact`), or null when no confirmed scan exists. */
export function scanText(photo: ProgressPhoto, compact = false): string | null {
  const scan = photo.nearest_scan
  if (!scan) return null
  const fat = compact || scan.body_fat_pct === null ? '' : ` · ${formatNumber(scan.body_fat_pct, 1)} % fat`
  return `Scan ${formatShortDate(scan.date)}${fat}`
}

/** Date, trend weight and nearest scan in two short lines (`compact` for narrow grid tiles). */
export function PhotoFacts({ photo, showPose = false, compact = false }: { photo: ProgressPhoto; showPose?: boolean; compact?: boolean }) {
  const scan = scanText(photo, compact)
  return (
    <Box sx={{ pt: 1.5, minWidth: 0, lineHeight: 1.35 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline', flexWrap: 'wrap', fontSize: tokens.font.size.label }}>
        <Box component="span" sx={{ color: tokens.ink.text, fontWeight: tokens.font.weight.label }}>
          {showPose ? `${POSE_LABEL[photo.pose]} · ` : ''}
          {formatShortDate(photo.date)}
        </Box>
        <TrendWeight kg={photo.weight_kg} />
      </Box>
      {scan && (
        <Box sx={{ fontSize: tokens.font.size.caption, color: tokens.ink.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{scan}</Box>
      )}
    </Box>
  )
}

/** All / Front / Side / Back chips. `null` is all poses. */
export function PoseFilter({ value, onChange }: { value: Pose | null; onChange: (pose: Pose | null) => void }) {
  const options: (Pose | null)[] = [null, ...POSES]
  return (
    <Stack direction="row" spacing={2} role="radiogroup" aria-label="Pose" data-testid="photo-pose-filter" sx={{ flexWrap: 'wrap' }}>
      {options.map((pose) => {
        const selected = value === pose
        return (
          <Chip
            key={pose ?? 'all'}
            role="radio"
            aria-checked={selected}
            label={pose ? POSE_LABEL[pose] : 'All poses'}
            color={selected ? 'primary' : 'default'}
            variant={selected ? 'filled' : 'outlined'}
            onClick={() => onChange(pose)}
            sx={{ height: tokens.tapTarget, px: 1, borderRadius: tokens.radius.chip }}
          />
        )
      })}
    </Stack>
  )
}
