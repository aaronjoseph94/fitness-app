// Owns: the 2a surface recipes as `sx` fragments, for an element that is not a kit component but must look like one —
// a link styled as a card, a custom tile, an outlined icon button — so no feature re-types a border, a radius or a
// shadow. `Panel`, `ListRow variant="card"` and `EmptyState` are built from the same values.
import { tokens } from '../../theme'

/** A white card: 1 px #E4E4E7, radius 12, the card whisper. */
export const cardSurface = {
  bgcolor: tokens.ink.card,
  border: `1px solid ${tokens.ink.border}`,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.card,
} as const

/** A tinted panel: #FAFAFA, 1 px #E4E4E7, radius 12, no shadow (goal rail, next-scan card, "About this data"). */
export const panelSurface = {
  bgcolor: tokens.ink.panel,
  border: `1px solid ${tokens.ink.border}`,
  borderRadius: `${tokens.radius.card}px`,
} as const

/** An empty slot: dashed #D4D4D8 on #FAFAFA, radius 12. */
export const dashedSurface = {
  bgcolor: tokens.ink.panel,
  border: `1px dashed ${tokens.ink.dashed}`,
  borderRadius: `${tokens.radius.card}px`,
} as const

/** The highlighted card (today's template, the current exercise): accent border + a 3 px #EFF6FF ring. */
export const highlightSurface = {
  bgcolor: tokens.ink.card,
  border: `1px solid ${tokens.accent.main}`,
  borderRadius: `${tokens.radius.card}px`,
  boxShadow: tokens.elevation.highlight,
} as const

/** A small #FAFAFA well inside a card (a stat tile, the proposal strip), radius 8. */
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
