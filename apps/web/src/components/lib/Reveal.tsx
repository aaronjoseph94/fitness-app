// Owns: the entrance group — a short fade-and-rise that brings a cluster of cards on screen as a unit, with an
// optional per-item stagger. It animates only `opacity` and `transform`, never a layout property, so it cannot shift
// content and costs no CLS; under `prefers-reduced-motion` the travel is dropped for a plain cross-fade, so the group
// still resolves into place rather than snapping on.
//
// Caveat worth knowing: a `transform` makes an element the containing block for `position: fixed` descendants. Use
// this around card groups, not around a subtree that owns a fixed-position layer (dialogs are unaffected — they
// portal to the body).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { enterDuration, enterEasing, reducedEntrance, tokens } from '../../theme'
import { useEntrance } from './useEntrance'

export interface RevealProps {
  /** Stagger in ms for a list of siblings. Keep the last item under ~200 ms or the page reads as slow. */
  delay?: number
  children: ReactNode
  /** Extra sx merged onto the wrapper. */
  sx?: object
}

export function Reveal({ delay = 0, children, sx }: RevealProps) {
  const { entered, reduced } = useEntrance()
  return (
    <Box
      sx={{
        opacity: entered ? 1 : 0,
        transform: entered ? 'none' : `translateY(${tokens.motion.rise}px)`,
        // A critically damped spring where the browser takes `linear()`, the equivalent cubic-bézier where it doesn't —
        // and the settle time that spring derives for itself, because a spring curve given less time than it needs is
        // cut off half-way through. Reduced motion keeps a cross-fade in place of the rise.
        transition: reduced
          ? 'none'
          : `opacity ${enterDuration()}ms ${enterEasing()} ${delay}ms, transform ${enterDuration()}ms ${enterEasing()} ${delay}ms`,
        animation: reducedEntrance(delay, reduced),
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}
