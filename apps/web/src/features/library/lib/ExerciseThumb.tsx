// Owns: the exercise thumbnail — the first step image (lazy, square-cropped, rounded) or a dumbbell icon when the
// exercise has no image or it fails to load (images are fetched at build time and may be missing in dev).
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import Box from '@mui/material/Box'
import { useState } from 'react'
import { tokens } from '../../../theme'

export interface ExerciseThumbProps {
  exercise: { name: string; image_paths: readonly string[] } | null | undefined
  /** Square size in px. Default 56. */
  size?: number
}

export function ExerciseThumb({ exercise, size = 56 }: ExerciseThumbProps) {
  const src = exercise?.image_paths[0]
  const [failed, setFailed] = useState<string | null>(null)
  const showImage = src !== undefined && failed !== src
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: 'none',
        borderRadius: `${tokens.radius.control}px`,
        overflow: 'hidden',
        bgcolor: tokens.chart.grid,
        border: `1px solid ${tokens.ink.border}`,
        display: 'grid',
        placeItems: 'center',
        color: tokens.ink.secondary,
      }}
    >
      {showImage ? (
        <Box
          component="img"
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <FitnessCenterRounded sx={{ fontSize: size * 0.45 }} aria-hidden />
      )}
    </Box>
  )
}
