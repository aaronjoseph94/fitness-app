// Owns: `PageHeader`, the page's hero content on the 1d sky (README §3) — an uppercase eyebrow (DM Sans 600, +.16em),
// the page's single `h1` (Outfit 300, fluid 34–56 px; 32–48 on a compact sky), a one-line subtitle (17 px; Today's
// 18), the page's controls (they wrap under the title on a phone and take the sky's glass look: a segmented control
// becomes a glass track with a white selected segment, outline/text/icon buttons glass pills, the contained primary
// button the gold CTA), an always-visible `primaryAction` slot, and a `extras` slot for what a page draws in its sky
// (Today's mountain). Every button and link in it takes the sky's keyboard ring (white with a deep-ink band: the violet
// one is 1.09:1 on plum). While mounted it claims the shell's hero slot (`claim()`), so the shell drops its own fallback heading.
//
// It renders through the shell's hero slot (`HeroSlotProvider`): a page writes `<PageHeader>` wherever it likes and the
// content lands on the sky above the cream panel, while the page's own cards stay in the panel. Outside the shell it
// renders in place, on a sky of its own. Its entrance follows README §6: the eyebrow fades, the h1 de-blurs, the
// subtitle fades and the controls rise (opacity, transform and filter only, so no CLS); under reduced motion it
// cross-fades in place.
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { COARSE_POINTER_QUERY, enterEasing, reducedEntrance, tokens, type HeroVariant } from '../../theme'
import { useHeroSlot } from './heroSlot'
import { SkyHero } from './SkyHero'
import { skyFocusWithin } from './surfaces'
import { useEntrance } from './useEntrance'

const { summit, font, motion, layout } = tokens

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

const glass = {
  bgcolor: summit.glass.control,
  border: `1px solid ${summit.glass.controlBorder}`,
  color: summit.onSky.text,
  backdropFilter: `blur(${summit.glass.blur}px)`,
} as const

/**
 * The sky's look for the hero's own controls (direct children of the action row, so a composite control a page builds
 * keeps its own look): glass pills 46 px tall, the contained primary button as the gold CTA, a segmented control as a
 * glass track with a white selected segment (deep ink, 16.4:1), and the sky's two-tone keyboard ring on each. The glass
 * is a dark tint so white text clears 4.5:1 however low on the sky the row wraps (theme.ts header).
 */
export const skyControls = {
  ...skyFocusWithin,
  '& > .MuiButton-root': {
    minHeight: 46,
    px: '18px',
    borderRadius: `${summit.radius.pill}px`,
    fontSize: font.size.emphasis,
  },
  '& > .MuiButton-outlined, & > .MuiButton-text': {
    ...glass,
    '&:hover': { bgcolor: summit.glass.controlHover, border: `1px solid ${summit.glass.controlBorder}` },
    '&.Mui-disabled': { ...glass, color: summit.onSky.disabled },
  },
  '& > .MuiButton-contained.MuiButton-colorPrimary': {
    backgroundImage: summit.cta.gold.bg,
    color: summit.cta.gold.text,
    boxShadow: summit.cta.gold.shadow,
    '&:hover': { backgroundImage: summit.cta.gold.bg, boxShadow: summit.cta.gold.shadowHover },
  },
  '& > .MuiIconButton-root': {
    ...glass,
    width: 46,
    height: 46,
    borderRadius: '50%',
    '&:hover': { bgcolor: summit.glass.controlHover },
  },
  '& > .MuiToggleButtonGroup-root': {
    ...glass,
    p: '5px',
    gap: '4px',
    '& .MuiToggleButton-root': {
      px: '14px',
      py: '8px',
      fontSize: font.size.body,
      fontWeight: font.weight.heading,
      color: summit.onSky.subtitle,
      '&:hover': { color: summit.onSky.text, bgcolor: summit.glass.fill },
      '&.Mui-selected, &.Mui-selected:hover': {
        bgcolor: summit.avatar.bg,
        color: summit.avatar.text,
        boxShadow: 'none',
      },
      [COARSE_POINTER_QUERY]: { minHeight: tokens.tapTarget },
    },
  },
} as const

export interface PageHeaderProps {
  /** The uppercase line above the title ("Fuel log · Day 12"; the session logger's ← Train link and chips). */
  eyebrow?: ReactNode
  title: ReactNode
  /**
   * The page's own name, appended to the heading for assistive tech only. A hero that says "Welcome back" reads
   * warmly but names nothing, so a screen-reader user moving by heading would not learn which page they landed on.
   */
  pageName?: string
  /** One dated or explanatory line under the title. */
  subtitle?: ReactNode
  /** The page's controls, e.g. a `<Segmented>` window and a button. Wraps under the title on a phone. */
  action?: ReactNode
  /**
   * The hero's primary call to action, after `action` and shown at every width (Log: the gold "+ Log" that opens the
   * quick-log sheet — `<Button variant="contained" color="gold">`; Today draws its own in the headline column, clear
   * of the mountain).
   */
  primaryAction?: ReactNode
  /**
   * What a page draws in its sky beside or under the title row (Today's mountain): a flex item of the hero row (a
   * wrapping flex row), positioned against the sky's content box; it brings its own entrance (`Reveal`).
   */
  extras?: ReactNode
  /** The sky this page wants: `today`, `inner` or `compact`. Default: the route's (`RouteHandle.hero`). */
  variant?: HeroVariant
  /** Entrance delay in ms, for a page that brings several groups on screen in order. */
  delay?: number
  testId?: string
}

/** One entrance step: fade (and rise, or de-blur) after `delay` ms; a cross-fade under reduced motion. */
function step(
  entered: boolean,
  reduced: boolean,
  delay: number,
  kind: 'fade' | 'rise' | 'deblur',
  duration = enterDurationFor(kind),
) {
  const resting =
    kind === 'rise'
      ? { transform: `translateY(${motion.rise}px)` }
      : kind === 'deblur'
        ? { transform: 'translateY(12px)', filter: `blur(${motion.blur}px)` }
        : {}
  const props = ['opacity', ...Object.keys(resting)]
  return {
    opacity: entered ? 1 : 0,
    ...(entered ? { transform: 'none', filter: 'none' } : resting),
    transition: reduced
      ? 'none'
      : props.map((p) => `${p} ${duration}ms ${enterEasing()} ${delay}ms`).join(', '),
    animation: reducedEntrance(delay, reduced),
  }
}

function enterDurationFor(kind: 'fade' | 'rise' | 'deblur'): number {
  return kind === 'deblur' ? motion.duration.deblur : motion.duration.nav
}

/** The hero row: the title block, the controls, then the page's extras. */
function HeroContent({
  eyebrow,
  title,
  pageName,
  subtitle,
  action,
  primaryAction,
  extras,
  delay = 0,
  testId,
  sky,
}: PageHeaderProps & { sky: HeroVariant }) {
  const { entered, reduced } = useEntrance()
  const controls = action || primaryAction
  const compact = sky === 'compact'
  return (
    <Box
      data-testid={testId}
      sx={{
        ...skyFocusWithin,
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'flex-end',
        gap: '20px',
        minWidth: 0,
        pt: `${compact ? 14 : layout.hero.padTop}px`,
      }}
    >
      {/* Basis = the copy's own width, so the controls drop under the title before the title is squeezed (§4). */}
      <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
        {eyebrow && (
          <Box
            sx={{
              ...step(entered, reduced, delay + 200, 'fade'),
              mb: '8px',
              fontSize: font.size.eyebrowHero,
              fontWeight: font.weight.heading,
              lineHeight: font.leading.label,
              letterSpacing: font.em.eyebrowHero,
              textTransform: 'uppercase',
              color: summit.onSky.eyebrow,
              // A link or button in the eyebrow (the session's ← Train) reads on the sky, not in the panel's ink.
              '& a, & .MuiButtonBase-root': { color: summit.onSky.subtitle },
              '& a:hover, & .MuiButtonBase-root:hover': { color: summit.onSky.text },
            }}
          >
            {eyebrow}
          </Box>
        )}
        <Typography
          component="h1"
          variant="h1"
          sx={{
            ...step(entered, reduced, delay + 320, 'deblur'),
            m: 0,
            color: summit.onSky.text,
            overflowWrap: 'break-word',
            ...(compact && { fontSize: font.fluid.h1Compact }),
          }}
        >
          {title}
          {pageName && <Box component="span" sx={visuallyHidden}>{` · ${pageName}`}</Box>}
        </Typography>
        {subtitle && (
          <Box
            sx={{
              ...step(entered, reduced, delay + 560, 'fade'),
              mt: '12px',
              fontSize: sky === 'today' ? font.size.subtitleToday : font.size.subtitle,
              fontWeight: font.weight.body,
              lineHeight: font.leading.small,
              color: summit.onSky.subtitle,
              '& a': { color: summit.onSky.text, textDecoration: 'underline' },
            }}
          >
            {subtitle}
          </Box>
        )}
      </Box>
      {controls && (
        <Box
          sx={{
            ...step(entered, reduced, delay + 500, 'rise'),
            ...skyControls,
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            maxWidth: '100%',
          }}
        >
          {action}
          {primaryAction}
        </Box>
      )}
      {extras}
    </Box>
  )
}

export function PageHeader(props: PageHeaderProps) {
  const slot = useHeroSlot()
  const { variant } = props
  const claim = slot?.claim

  // While this header is on screen the shell drops its fallback title and its sky takes the variant asked for.
  useLayoutEffect(() => claim?.(variant ?? null), [claim, variant])

  if (!slot) {
    // Outside the shell: a sky of its own, in place.
    return (
      <SkyHero variant={variant}>
        <Box sx={{ px: layout.gutter }}>
          <HeroContent {...props} sky={variant ?? 'inner'} />
        </Box>
      </SkyHero>
    )
  }
  if (!slot.target) return null
  return createPortal(<HeroContent {...props} sky={slot.variant} />, slot.target)
}
