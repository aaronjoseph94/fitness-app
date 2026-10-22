// Owns: the two 1d gradient cards (README §2) — `DeepSkyCard`, one per screen for the plan-level fact (the deep-sky
// gradient, white text, 8 % white inner wells, 10 % white hairlines, its own shadow: "This week", "Against the
// plan", "Camps on the way", fasting, "About this data"), and `CoachCard`, the coach / AI highlight (the coach
// gradient: the coach note, the AI suggestion strip, the rails card). Both are radius-30 cards with an optional
// uppercase eyebrow row and title; `deepSkySurface` (the deep-sky look for an element that is not this card),
// `deepSkyWell` and `deepSkyRule` are its pieces as `sx` fragments. A button or link inside either takes the white
// keyboard ring with a deep-ink band (the theme's violet one is under 3:1 on both gradients).
import Box from '@mui/material/Box'
import type { ReactNode } from 'react'
import { tokens } from '../../theme'
import { skyFocusWithin } from './surfaces'

const { summit, font, pad } = tokens

/** The deep-sky card's own look — its gradient, radius 30, shadow and white text — for a custom element drawn as one. */
export const deepSkySurface = {
  borderRadius: `${summit.radius.large}px`,
  background: summit.deepSky.bg,
  color: summit.deepSky.text,
  boxShadow: summit.deepSky.shadow,
} as const

/** The coach card's look: the coach gradient, radius 30, its shadow, white text. */
const coachSurface = {
  borderRadius: `${summit.radius.large}px`,
  background: summit.coach.bg,
  color: summit.coach.text,
  boxShadow: summit.coach.shadow,
} as const

/** An inner well on the deep sky (a stat cell, a row group): `.08` white, radius 16. */
export const deepSkyWell = {
  bgcolor: summit.deepSky.well,
  borderRadius: `${summit.radius.well}px`,
} as const

/** A hairline between rows on the deep sky. */
export const deepSkyRule = `1px solid ${summit.deepSky.hairline}`

interface SkyCardProps {
  /** The uppercase eyebrow (DM Sans 600, +.12em), e.g. "Coach note". */
  eyebrow?: ReactNode
  /** Leading glyph for the eyebrow row (a 18 px icon, gold on the deep sky). */
  icon?: ReactNode
  /** Right of the eyebrow, e.g. "Claude · until Oct 11". */
  aside?: ReactNode
  title?: ReactNode
  headingComponent?: 'h2' | 'h3' | 'h4'
  children?: ReactNode
  component?: 'section' | 'aside' | 'div' | 'article'
  ariaLabel?: string
  testId?: string
}

function SkyCard({
  eyebrow,
  icon,
  aside,
  title,
  headingComponent = 'h2',
  children,
  component = 'section',
  ariaLabel,
  testId,
  surface,
  muted,
}: SkyCardProps & { surface: typeof deepSkySurface | typeof coachSurface; muted: string }) {
  return (
    <Box
      component={component}
      aria-label={ariaLabel}
      data-testid={testId}
      sx={{
        ...surface,
        ...skyFocusWithin,
        position: 'relative',
        overflow: 'hidden',
        minWidth: 0,
        px: `${pad.card.x}px`,
        py: `${pad.card.y}px`,
        breakInside: 'avoid',
      }}
    >
      {(eyebrow || aside) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: font.size.eyebrow,
            fontWeight: font.weight.heading,
            letterSpacing: font.em.eyebrow,
            textTransform: 'uppercase',
            color: muted,
          }}
        >
          {icon}
          <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
            {eyebrow}
          </Box>
          {aside && (
            <Box component="span" sx={{ textTransform: 'none', letterSpacing: 0, flex: 'none' }}>
              {aside}
            </Box>
          )}
        </Box>
      )}
      {title && (
        <Box
          component={headingComponent}
          sx={{
            m: 0,
            mt: eyebrow || aside ? '10px' : 0,
            fontFamily: font.display,
            fontSize: font.size.cardTitle,
            fontWeight: font.weight.title,
            letterSpacing: font.em.card,
            lineHeight: font.leading.cardTitle,
          }}
        >
          {title}
        </Box>
      )}
      {children && <Box sx={{ mt: eyebrow || aside || title ? '12px' : 0, minWidth: 0 }}>{children}</Box>}
    </Box>
  )
}

export type DeepSkyCardProps = SkyCardProps

/** The deep-sky card (README: one per screen, for the plan-level fact). */
export function DeepSkyCard(props: DeepSkyCardProps) {
  return <SkyCard {...props} surface={deepSkySurface} muted={summit.deepSky.muted} />
}

export type CoachCardProps = SkyCardProps

/** The coach / AI highlight card (the coach note, the AI suggestion strip). */
export function CoachCard(props: CoachCardProps) {
  return <SkyCard {...props} surface={coachSurface} muted={summit.coach.muted} />
}
