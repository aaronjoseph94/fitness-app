// Owns: the exercise thumbnail — 2a's `ink.fill` tile holding the first step image (lazy, square-cropped) or a dumbbell glyph when the
// exercise has no image or it fails to load (images are fetched at build time and may be missing in dev). It shows the
// 112 px WebP thumbnail next to the step image (/exercises/<id>/thumb.webp, ~2 KB, written by the exercises fetch
// script), falling back to the full step JPEG (~70 KB) when the browser has no WebP or the thumbnail is missing.
import FitnessCenterRounded from '@mui/icons-material/FitnessCenterRounded'
import Box from '@mui/material/Box'
import { useState } from 'react'
import { tokens } from '../../../theme'

export interface ExerciseThumbProps {
  exercise: { name: string; image_paths: readonly string[] } | null | undefined
  /** Square size in px. Default 56. */
  size?: number
}

/** "/exercises/Barbell_Squat/0.jpg" → "/exercises/Barbell_Squat/thumb.webp". */
const thumbOf = (src: string) => src.replace(/\/[^/]+$/, '/thumb.webp')

export function ExerciseThumb({ exercise, size = 56 }: ExerciseThumbProps) {
  const src = exercise?.image_paths[0]
  // What failed to load for this src: the thumbnail (show the step JPEG) or the JPEG too (show the icon).
  const [failed, setFailed] = useState<{ src: string; stage: 'thumb' | 'image' } | null>(null)
  const stage = failed && failed.src === src ? failed.stage : null
  const showImage = src !== undefined && stage !== 'image'
  const img = (
    <Box
      component="img"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => src && setFailed({ src, stage: stage === 'thumb' ? 'image' : 'thumb' })}
      sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  )
  return (
    <Box
      sx={{
        width: size,
        height: size,
        flex: 'none',
        // 2a's thumb tile: `ink.fill` at the control radius, a faint glyph when there is no image.
        borderRadius: `${tokens.radius.control}px`,
        overflow: 'hidden',
        bgcolor: tokens.ink.fill,
        display: 'grid',
        placeItems: 'center',
        color: tokens.ink.faint,
      }}
    >
      {showImage && src ? (
        stage === 'thumb' ? (
          img
        ) : (
          <Box component="picture" sx={{ display: 'contents' }}>
            <source type="image/webp" srcSet={thumbOf(src)} />
            {img}
          </Box>
        )
      ) : (
        <FitnessCenterRounded sx={{ fontSize: size * 0.45 }} aria-hidden />
      )}
    </Box>
  )
}
