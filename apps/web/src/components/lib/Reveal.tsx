// Owns: the entrance group — 1d's fade-and-rise (README §6: 26 px over 800 ms, cubic-bezier(.16, 1, .3, 1)) that brings
// a card or a cluster of cards on screen, with a per-item stagger (`staggerDelay`: 60 ms between cards, 90 ms between
// sections, in reading order).
// It animates only `opacity` and `transform`, never a layout property, so it cannot shift content and costs no CLS;
// under `prefers-reduced-motion` the travel is dropped for a 200 ms cross-fade, so the group still resolves into place
// rather than snapping on.
//
// Caveat worth knowing: a `transform` makes an element the containing block for `position: fixed` descendants. Use
// this around card groups, not around a subtree that owns a fixed-position layer (dialogs are unaffected — they
// portal to the body).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { enterDuration, enterEasing, reducedEntrance, tokens } from '../../theme'
import { useEntrance } from './useEntrance'

/**
 * The entrance delay of the `index`-th item in reading order: `start + index × step`. 1d staggers cards 60 ms apart
 * (`tokens.motion.stagger.card`) and sections 90 ms (`.section`).
 */
export function staggerDelay(index: number, step: number = tokens.motion.stagger.card, start = 0): number {
  return start + Math.max(0, index) * step
}

export interface RevealProps {
  /** Entrance delay in ms (see `staggerDelay`). Keep a page's last group under ~600 ms or it reads as slow. */
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
        // The expo-out over 800 ms. Reduced motion drops the transition for the cross-fade `animation` below.
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
