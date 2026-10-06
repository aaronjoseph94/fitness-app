// Owns: the entrance group — a short fade-and-rise that brings a cluster of cards on screen as a unit, with an
// optional per-item stagger. It animates only `opacity` and `transform`, never a layout property, so it cannot shift
// content and costs no CLS; under `prefers-reduced-motion` it renders its children in place with no transition.
//
// Caveat worth knowing: a `transform` makes an element the containing block for `position: fixed` descendants. Use
// this around card groups, not around a subtree that owns a fixed-position layer (dialogs are unaffected — they
// portal to the body).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
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
        transition: reduced
          ? 'none'
          : `opacity ${tokens.motion.duration.base}ms ${tokens.motion.easing.enter} ${delay}ms, transform ${tokens.motion.duration.base}ms ${tokens.motion.easing.enter} ${delay}ms`,
        ...sx,
      }}
    >
      {children}
    </Box>
  )
}
