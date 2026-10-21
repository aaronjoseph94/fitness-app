// Owns: the 1d list row (Settings, "More", any card of rows) — a full-width row, 14 × 26 padding, an `ink.hairline`
// rule above it, a 14/500 label with an optional 12 px muted help line, the value on the right in `ink.label`
// (tabular), and a chevron when the row goes somewhere; hover the warm well. It is a button (`onClick`), a router link
// (`component` + `to`) or, with neither, a plain row whose `trailing` slot holds its own control (a Switch).
// `variant="card"` is the same content as a standalone white radius-30 card (Train's tool cards), its label in Outfit.
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import type { SvgIconComponent } from '@mui/icons-material'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import type { ElementType, ReactNode } from 'react'
import { tokens, transitionOf } from '../../theme'
import { cardSurface, displayTitle } from './surfaces'

export interface ListRowProps {
  label: ReactNode
  /** A muted line under the label. */
  help?: ReactNode
  /** Right-aligned value (`ink.label`, tabular). */
  value?: ReactNode
  /** Replaces the value + chevron, e.g. a `<Switch>` (give it an accessible name) or a status chip. */
  trailing?: ReactNode
  /** Leading 18 px glyph in muted ink; with `iconTile` it sits in a 40 px violet-tint tile in violet instead. */
  icon?: SvgIconComponent
  iconTile?: boolean
  onClick?: () => void
  /** A router link: `component={Link} to="/plan"`. An interactive row without `trailing` shows the chevron. */
  component?: ElementType
  to?: string
  disabled?: boolean
  /** `row` (default): flush in a card, hairline above. `card`: a bordered card of its own. */
  variant?: 'row' | 'card'
  testId?: string
}

export function ListRow({
  label,
  help,
  value,
  trailing,
  icon: Icon,
  iconTile = false,
  onClick,
  component,
  to,
  disabled = false,
  variant = 'row',
  testId,
}: ListRowProps) {
  const interactive = Boolean(onClick || to)
  const showChevron = interactive && !trailing
  const card = variant === 'card'

  const content = (
    <>
      {Icon &&
        (iconTile ? (
          <Box
            aria-hidden
            sx={{
              width: 40,
              height: 40,
              flex: 'none',
              display: 'grid',
              placeItems: 'center',
              borderRadius: `${tokens.summit.radius.wellSmall}px`,
              bgcolor: tokens.accent.soft,
              color: tokens.accent.deep,
            }}
          >
            <Icon sx={{ fontSize: 20 }} />
          </Box>
        ) : (
          <Icon aria-hidden sx={{ fontSize: 18, color: tokens.ink.secondary, flex: 'none' }} />
        ))}
      <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
        <Box
          component="span"
          sx={{
            display: 'block',
            fontSize: tokens.font.size.body,
            fontWeight: tokens.font.weight.label,
            ...(card && { ...displayTitle('card'), fontSize: 17 }),
            color: tokens.ink.text,
          }}
        >
          {label}
        </Box>
        {help && (
          <Box
            component="span"
            sx={{
              display: 'block',
              mt: '1px',
              fontSize: tokens.font.size.caption,
              lineHeight: tokens.font.leading.caption,
              color: tokens.ink.secondary,
            }}
          >
            {help}
          </Box>
        )}
      </Box>
      {trailing ??
        (value !== undefined && value !== null && (
          <Box
            component="span"
            sx={{
              flex: 'none',
              maxWidth: '50%',
              textAlign: 'right',
              fontSize: tokens.font.size.body,
              color: tokens.ink.label,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {value}
          </Box>
        ))}
      {showChevron && (
        <ChevronRightRounded aria-hidden sx={{ fontSize: 18, color: tokens.ink.faint, flex: 'none' }} />
      )}
    </>
  )

  const sx = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    width: '100%',
    minHeight: tokens.tapTarget,
    px: card ? '20px' : `${tokens.pad.card.x}px`,
    py: card ? '18px' : '14px',
    textAlign: 'left',
    font: 'inherit',
    color: tokens.ink.text,
    bgcolor: tokens.ink.card,
    ...(card ? cardSurface : { borderTop: `1px solid ${tokens.ink.hairline}` }),
    ...(interactive && {
      transition: transitionOf('background-color', tokens.motion.duration.instant),
      '@media (hover: hover)': { '&:hover': { bgcolor: tokens.ink.panel } },
      '&:active': { bgcolor: tokens.ink.panel },
      // The row sits flush in a card that clips its corners: draw the keyboard ring inside it.
      '&.Mui-focusVisible': { outlineOffset: -2 },
    }),
    ...(disabled && { opacity: 0.5 }),
  } as const

  if (!interactive) {
    return (
      <Box data-testid={testId} sx={sx}>
        {content}
      </Box>
    )
  }
  // A router link (`component` + `to`) or a button: ButtonBase renders whichever element it is given and keeps one
  // focus ring and one press state for both.
  const as: Record<string, unknown> = component ? { component, to } : {}
  return (
    <ButtonBase data-testid={testId} onClick={onClick} disabled={disabled} {...as} sx={sx}>
      {content}
    </ButtonBase>
  )
}
