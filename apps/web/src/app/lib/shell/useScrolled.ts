// Owns: the one scroll observation the chrome needs — whether the page has scrolled past a point, so the phone's top
// bar can show the page's name once the page's own title has gone beneath it. One passive listener and no animation
// frame: the handler is a single numeric comparison and the state setter is the identity function, so React bails
// out unless the answer actually changed. That matters because a coalescing frame is exactly the thing a throttled or
// non-compositing window never delivers — and a bar that can silently stop updating is worse than none at all.
import { useEffect, useState } from 'react'

/**
 * True once the window has scrolled past `threshold` px. Read once on mount so a restored scroll position (React
 * Router's `ScrollRestoration`) is reflected immediately.
 */
export function useScrolled(threshold = 6): boolean {
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const read = () => setScrolled((prev) => {
      const next = window.scrollY > threshold
      return prev === next ? prev : next
    })
    read()
    window.addEventListener('scroll', read, { passive: true })
    return () => window.removeEventListener('scroll', read)
  }, [threshold])
  return scrolled
}
