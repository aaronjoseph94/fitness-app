// Owns: the 1d surface recipes as `sx` fragments, for an element that is not a kit component but must look like one —
// a link styled as a card, a custom tile, an outlined icon button, a stat's big figure — so no feature re-types a
// border, a radius, a shadow or a type role; and the keyboard ring for the dark surfaces (the sky, the deep-sky and
// coach cards), where the theme's violet ring is 1.09:1. `Panel`, `ListRow variant="card"` and `EmptyState` are built
// from the same values.
import { tokens } from '../../theme'

const { summit } = tokens

const lightRing = {
  outline: `${tokens.focusRing.width}px solid ${summit.onSky.text}`,
  outlineOffset: tokens.focusRing.offset,
} as const

/** A keyboard ring that reads on the sky or a dark card: white, 2 px, 2 px out. Spread into the control's own `sx`. */
export const skyFocus = { '&.Mui-focusVisible, &:focus-visible': lightRing } as const

const FOCUSED = '& .MuiButtonBase-root.Mui-focusVisible, & a:focus-visible, & button:focus-visible'

/** The same white ring for every button and link inside the sky's hero row. */
export const skyFocusWithin = { [FOCUSED]: lightRing } as const

/**
 * The ring inside a deep-sky or coach card, which may hold a light well (a proposed plan's soft violet banner): the
 * white ring with a deep-ink band filling its 2 px gap, so one of the two reads on either surface (white 4.65+ on the
 * gradients, deep ink 14+ on a light well).
 */
export const darkCardFocusWithin = {
  [FOCUSED]: { ...lightRing, boxShadow: `0 0 0 ${tokens.focusRing.offset}px ${summit.ink.deep}` },
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
