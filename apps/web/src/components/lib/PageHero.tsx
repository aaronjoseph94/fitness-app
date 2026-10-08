// Owns: `PageHeader`, the page title row every 2a page opens with — the page's single `h1` (26/600, −.02em), a 14 px
// muted subtitle under it, and the page's own controls on the right (a segmented window, "+ Log", "Export"), wrapping
// under the title on a phone. The shell sees this `h1` in `main` and drops its own fallback heading.
//
// It rises into place once on mount (2a: 26 px over 700 ms, expo-out; opacity + transform only, so no CLS). Under
// `prefers-reduced-motion` it cross-fades in place instead.
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import type { ReactNode } from 'react'
import { enterDuration, enterEasing, reducedEntrance, tokens } from '../../theme'
import { useEntrance } from './useEntrance'

/**
 * Rules that hide content from sight while leaving it in the accessibility tree: no size, clipped, and out of flow, so
 * it costs no layout and cannot be reached by a tap. Exported so any screen can name something for assistive tech
 * without inventing a second way of doing it.
 *
 * The size must be written as `'1px'`, never as the bare number `1`: MUI's `sx` treats a number between 0 and 1 as a
 * **percentage**, so `width: 1` compiles to `width: 100%` and this "hidden" element becomes a full-viewport box that
 * gives every page a horizontal scrollbar. The height stays `'auto'` rather than 1 px so a long string cannot be
 * clipped mid-glyph by the 1 px box — `overflow: hidden` and the clip do the hiding either way.
 */
export const visuallyHidden = {
  position: 'absolute',
  width: '1px',
  height: 'auto',
  p: 0,
  m: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: 0,
} as const

export interface PageHeaderProps {
  /** A small 13 px line above the title (the session logger's ← Train link and chips). */
  eyebrow?: ReactNode
  title: ReactNode
  /**
   * The page's own name, appended to the heading for assistive tech only. A hero that says "Welcome back" reads
   * warmly but names nothing, so a screen-reader user moving by heading would not learn which page they landed on.
   */
  pageName?: string
  /** One dated or explanatory line under the title. */
  subtitle?: ReactNode
  /** Right-hand controls, e.g. a `<Segmented>` window and a primary button. Wraps under the title on a phone. */
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

export function PageHeader({ eyebrow, title, pageName, subtitle, action, delay = 0, testId }: PageHeaderProps) {
  const { entered, reduced } = useEntrance()
  return (
    <Box
      data-testid={testId}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        columnGap: 4,
        rowGap: 3,
        minWidth: 0,
        opacity: entered ? 1 : 0,
        transform: entered ? 'none' : `translateY(${tokens.motion.rise}px)`,
        transition: reduced
          ? 'none'
          : `opacity ${enterDuration()}ms ${enterEasing()} ${delay}ms, transform ${enterDuration()}ms ${enterEasing()} ${delay}ms`,
        animation: reducedEntrance(delay, reduced),
      }}
    >
      <Box sx={{ flex: '1 1 280px', minWidth: 0 }}>
        {eyebrow && (
          <Box sx={{ mb: '2px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary }}>{eyebrow}</Box>
        )}
        <Typography component="h1" variant="h1" sx={{ m: 0, color: 'text.primary', overflowWrap: 'anywhere' }}>
          {title}
          {pageName && <Box component="span" sx={visuallyHidden}>{` · ${pageName}`}</Box>}
        </Typography>
        {subtitle && (
          <Box sx={{ mt: '4px', fontSize: tokens.font.size.body, lineHeight: tokens.font.leading.body, color: tokens.ink.secondary }}>{subtitle}</Box>
        )}
      </Box>
      {action && <Box sx={{ flex: 'none', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, maxWidth: '100%' }}>{action}</Box>}
    </Box>
  )
}
