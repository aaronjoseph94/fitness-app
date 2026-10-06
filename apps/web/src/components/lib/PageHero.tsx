// Owns: the page hero — the greeting band a tab opens with (a small time-of-day line, one big welcome, a dated
// subtitle and a right-hand slot for the page's own control). It carries the page's single `h1`, which is why a route
// that shows one marks its handle `hero: true` so the top bar drops its own title rather than repeating it.
//
// It rises into place once on mount (opacity + transform only, so it costs no CLS), and under `prefers-reduced-motion`
// `useEntrance` reports the resting state immediately, so nothing is hidden or delayed.
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { useEntrance } from './useEntrance'

/**
 * Rules that hide content from sight while leaving it in the accessibility tree: no size, clipped, and out of flow, so
 * it costs no layout and cannot be reached by a tap. Exported so any screen can name something for assistive tech
 * without inventing a second way of doing it.
 */
export const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

export interface PageHeroProps {
  /** The small line above the title, e.g. "Good morning". */
  eyebrow?: ReactNode
  title: ReactNode
  /**
   * The page's own name, appended to the heading for assistive tech only. A hero that says "Welcome back" reads
   * warmly but names nothing, so a screen-reader user moving by heading would not learn which page they landed on.
   */
  pageName?: string
  /** One dated or explanatory line under the title. */
  subtitle?: ReactNode
  /** Right-hand slot, e.g. the Dashboard's window picker. Wraps under the title on a phone. */
  action?: ReactNode
  /** Entrance delay in ms, for a page that brings several groups on screen in order. */
  delay?: number
  testId?: string
}

/**
 * The salute for an hour of the local day (0–23). Pure, so the boundary hours are easy to pin in a test: morning
 * starts at 5 and afternoon at 12, evening at 18 — an hour-based split, which is what a person expects from a
 * greeting rather than a precise solar one.
 */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good night'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function PageHero({ eyebrow, title, pageName, subtitle, action, delay = 0, testId }: PageHeroProps) {
  const { entered, reduced } = useEntrance()
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: { xs: 2, sm: 3 },
        opacity: entered ? 1 : 0,
        transform: entered ? 'none' : `translateY(${tokens.motion.rise}px)`,
        transition: reduced
          ? 'none'
          : `opacity ${tokens.motion.duration.slow}ms ${tokens.motion.easing.enter} ${delay}ms, transform ${tokens.motion.duration.slow}ms ${tokens.motion.easing.enter} ${delay}ms`,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 0.5 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography component="h1" variant="h1" sx={{ m: 0, color: 'text.primary' }}>
          {title}
          {pageName && <Box component="span" sx={visuallyHidden}>{` · ${pageName}`}</Box>}
        </Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ mt: 1, color: 'text.secondary' }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action && <Box sx={{ flex: 'none', pb: 0.5 }}>{action}</Box>}
    </Box>
  )
}
