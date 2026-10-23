// Owns: the 1d surface recipes as `sx` fragments, for an element that is not a kit component but must look like one —
// a link styled as a card, a custom tile, an outlined icon button, a stat's big figure — so no feature re-types a
// border, a radius, a shadow or a type role; and the keyboard ring for the sky and the dark cards (the deep-sky and
// coach cards), where the theme's violet ring is 1.09:1 on plum. `Panel`, `ListRow variant="card"` and `EmptyState`
// are built from the same values.
import { tokens } from '../../theme'

const { summit } = tokens

const lightRing = {
  outline: `${tokens.focusRing.width}px solid ${summit.onSky.text}`,
  outlineOffset: tokens.focusRing.offset,
} as const

/**
 * A keyboard ring for a control on the sky's dark top (the nav) or the phone's dark tab bar: white, 2 px, 2 px out.
 * Spread into the control's own `sx`.
 */
export const skyFocus = { '&.Mui-focusVisible, &:focus-visible': lightRing } as const

/**
 * The ring for every button and link inside a container whose ground runs from dark to light — the hero row (the
 * sky's plum top to its coral and peach foot) and the deep-sky and coach cards (which may hold a light well, such as a
 * proposed plan's banner): the white ring with a deep-ink band filling its 2 px gap, so one of the two clears 3:1 on
 * any of them (white ≥ 4.6 on the plum and the dark cards; deep ink ≥ 6.2 on the coral and peach and 13+ on a well).
 */
export const skyFocusWithin = {
  '& .MuiButtonBase-root.Mui-focusVisible, & a:focus-visible, & button:focus-visible': {
    ...lightRing,
    boxShadow: `0 0 0 ${tokens.focusRing.offset}px ${summit.ink.deep}`,
  },
} as const

/** A white card: radius 30, the soft violet card shadow, no border (1d). */
export const cardSurface = {
  bgcolor: tokens.ink.card,
  border: 0,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.card,
} as const

/** A tinted panel: the warm well, radius 30, no shadow (goal rail, next-scan card, a quiet card on the cream). */
export const panelSurface = {
  bgcolor: tokens.ink.panel,
  border: 0,
  borderRadius: `${tokens.radius.card}px`,
} as const

/** An empty slot: 2 px dashed lilac on the near-white slot fill, radius 30 ("Add dinner"). */
export const dashedSurface = {
  bgcolor: summit.surface.dashed.bg,
  border: `2px dashed ${summit.surface.dashed.border}`,
  borderRadius: `${tokens.radius.card}px`,
} as const

/** The highlighted card (today's template, the current exercise, the active chat): white with a 2 px gold ring. */
export const highlightSurface = {
  bgcolor: tokens.ink.card,
  border: 0,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.highlight,
} as const

/** A warm well inside a card (a stat tile, the proposal strip, a food row), radius 16. */
export const wellSurface = {
  bgcolor: tokens.ink.panel,
  borderRadius: `${tokens.radius.well}px`,
} as const

/** Spread onto an `<IconButton>` for 1d's soft icon button: soft violet, deep ink glyph. */
export const outlinedIconButton = {
  border: 0,
  bgcolor: summit.surface.soft,
  color: summit.ink.deep,
  '&:hover': { bgcolor: summit.surface.softHover },
} as const

/** Tabular figures for a column of numbers. */
export const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const

/** The uppercase eyebrow over a card's content (DM Sans 600, 13 px, +.12em, muted). */
export const eyebrow = {
  fontSize: tokens.font.size.eyebrow,
  fontWeight: tokens.font.weight.heading,
  lineHeight: tokens.font.leading.label,
  letterSpacing: tokens.font.em.eyebrow,
  textTransform: 'uppercase',
  color: tokens.ink.muted,
} as const

/** A card or section title (Outfit 400, −.01em): `card` 19 px, `section` 24 px. */
export function displayTitle(size: 'card' | 'section' = 'card') {
  return {
    fontFamily: tokens.font.display,
    fontSize: size === 'section' ? tokens.font.size.sectionTitle : tokens.font.size.cardTitle,
    fontWeight: tokens.font.weight.title,
    letterSpacing: tokens.font.em.card,
    lineHeight: size === 'section' ? tokens.font.leading.sectionTitle : tokens.font.leading.cardTitle,
  } as const
}

const STAT_SIZE = {
  small: tokens.font.size.bigNumberSmall,
  standard: tokens.font.size.bigNumber,
  medium: tokens.font.size.bigNumberMedium,
  large: tokens.font.size.bigNumberLarge,
} as const

/**
 * A stat's big figure in Outfit 400, tabular: `small` 22, `standard` 30 (−.015em), `medium` 40 and `large` 52
 * (−.03em). The caller keeps its own line height, margin and colour.
 */
export function statValue(size: keyof typeof STAT_SIZE) {
  return {
    fontFamily: tokens.font.display,
    fontSize: STAT_SIZE[size],
    fontWeight: tokens.font.weight.number,
    letterSpacing: size === 'medium' || size === 'large' ? tokens.font.em.hero : tokens.font.em.number,
    fontVariantNumeric: 'tabular-nums',
  } as const
}

/**
 * The keyboard ring for a chart on a light card (UX #35): spread onto the chart's wrapper (a `ChartCard` body, the Box
 * around a Recharts `<ResponsiveContainer>` or a custom SVG). Recharts' accessibility layer makes its `<svg>` a tab
 * stop, and the browser draws a black square there; this swaps it for the theme's violet ring, rounded, only for the
 * keyboard (`:focus-visible`), and hides the mouse-click outline. Give the focusable SVG an `aria-label` too, or drop
 * its tab stop (`accessibilityLayer={false}`) when the chart has a data table or a text alternative.
 */
export const chartFocus = {
  '& svg:focus, & .recharts-wrapper:focus, & .recharts-surface:focus': { outline: 'none' },
  '& svg:focus-visible, & .recharts-wrapper:focus-visible, & .recharts-surface:focus-visible, &:focus-visible':
    {
      outline: `${tokens.focusRing.width}px solid ${tokens.focusRing.color}`,
      outlineOffset: tokens.focusRing.offset,
      borderRadius: `${tokens.radius.well}px`,
    },
} as const
