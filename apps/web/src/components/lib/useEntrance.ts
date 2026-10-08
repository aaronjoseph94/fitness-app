// Owns: the one hook behind every entrance animation (2a: cards rise and fade, bars grow, rings draw) — it reports
// whether the resting state has been painted, so a component can render its resting state and then transition to the
// final one. Without that first paint the browser coalesces both styles and the element simply appears with no motion,
// which is why the frame is asked for at all.
//
// The frame is the *preferred* moment to start, never the only one. A window whose animation clock never ticks — an
// occluded or non-compositing webview, a backgrounded tab, a throttled frame budget — would otherwise leave every
// entrance in the app at `opacity: 0` for good: not a missed animation but an invisible page. So a timer races the
// frame, and whichever arrives first starts the entrance exactly once. A timer is enough here because the only thing
// being waited for is "one paint has happened", not a smooth per-frame clock.
//
// It also reports the reduced-motion preference, so a caller never has to remember to check it (WCAG 2.3.3).
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useState } from 'react'
import { REDUCED_MOTION_QUERY } from '../../theme'

/** How long to wait for a frame before starting the entrance anyway, in ms. One frame at 60 Hz is ~17. */
const FRAME_FALLBACK_MS = 100

export interface Entrance {
  /** True once the resting state has been painted: start the transition. Always true under reduced motion. */
  entered: boolean
  /** The viewer prefers reduced motion: the travel is dropped for a cross-fade, and the stagger goes with it. */
  reduced: boolean
}

export function useEntrance(): Entrance {
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (reduced) {
      setEntered(true)
      return
    }
    // Whichever lands first wins, and only the first one does anything.
    let started = false
    const start = () => {
      if (started) return
      started = true
      setEntered(true)
    }
    const frame = requestAnimationFrame(start)
    const timer = setTimeout(start, FRAME_FALLBACK_MS)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, [reduced])

  return { entered: entered || reduced, reduced }
}
