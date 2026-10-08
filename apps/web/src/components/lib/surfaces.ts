// Owns: the 2a surface recipes as `sx` fragments, for an element that is not a kit component but must look like one —
// a link styled as a card, a custom tile, an outlined icon button, a stat's big figure — so no feature re-types a
// border, a radius, a shadow or a type role. `Panel`, `ListRow variant="card"` and `EmptyState` are built from the same
// values.
import { tokens } from '../../theme'

/** A white card: 1 px `ink.border`, radius 12, the card whisper. */
export const cardSurface = {
  bgcolor: tokens.ink.card,
  border: `1px solid ${tokens.ink.border}`,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.card,
} as const

/** A tinted panel: `ink.panel`, 1 px `ink.border`, radius 12, no shadow (goal rail, next-scan card, "About this data"). */
export const panelSurface = {
  bgcolor: tokens.ink.panel,
  border: `1px solid ${tokens.ink.border}`,
  borderRadius: `${tokens.radius.card}px`,
} as const

/** An empty slot: dashed `ink.dashed` on `ink.panel`, radius 12. */
export const dashedSurface = {
  bgcolor: tokens.ink.panel,
  border: `1px dashed ${tokens.ink.dashed}`,
  borderRadius: `${tokens.radius.card}px`,
} as const

/** The highlighted card (today's template, the current exercise): accent border + a 3 px `accent.soft` ring. */
export const highlightSurface = {
  bgcolor: tokens.ink.card,
  border: `1px solid ${tokens.accent.main}`,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.highlight,
} as const

/** A small `ink.panel` well inside a card (a stat tile, the proposal strip), radius 8. */
export const wellSurface = {
  bgcolor: tokens.ink.panel,
  borderRadius: `${tokens.radius.control}px`,
} as const

/** Spread onto an `<IconButton>` for 2a's outlined icon button (the header's notifications): white, 1 px border. */
export const outlinedIconButton = {
  border: `1px solid ${tokens.ink.border}`,
  bgcolor: tokens.ink.card,
  color: tokens.ink.text,
  '&:hover': { bgcolor: tokens.ink.fill },
} as const

/** Tabular figures for a column of numbers. */
export const tabularNums = { fontVariantNumeric: 'tabular-nums' } as const

const STAT_SIZE = {
  small: tokens.font.size.bigNumberSmall,
  standard: tokens.font.size.bigNumber,
  medium: tokens.font.size.bigNumberMedium,
  large: tokens.font.size.bigNumberLarge,
} as const

/**
 * A stat's big figure, 600 tabular: `small` 22, `standard` 28 (−.02em), `medium` 34 and `large` 40 (−.03em). The
 * caller keeps its own line height, margin and colour.
 */
export function statValue(size: keyof typeof STAT_SIZE) {
  return {
    fontSize: STAT_SIZE[size],
    fontWeight: tokens.font.weight.number,
    letterSpacing: size === 'medium' || size === 'large' ? tokens.font.em.hero : tokens.font.em.number,
    fontVariantNumeric: 'tabular-nums',
  } as const
}
