// Owns: the one hook behind every entrance animation — it reports whether the first frame has passed, so a component
// can render its resting state and then transition to the final one. Without that frame the browser coalesces both
// styles into a single paint and the element simply appears with no motion. It also reports the reduced-motion
// preference, so a caller never has to remember to check it (WCAG 2.3.3).
import useMediaQuery from '@mui/material/useMediaQuery'
import { useEffect, useState } from 'react'
import { REDUCED_MOTION_QUERY } from '../../theme'

export interface Entrance {
  /** True once a frame has rendered: start the transition. Always true under reduced motion, so nothing is hidden. */
  entered: boolean
  /** The viewer prefers reduced motion: no transition, no delay, no stagger. */
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
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [reduced])

  return { entered: entered || reduced, reduced }
}
