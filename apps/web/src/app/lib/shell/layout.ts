// Owns: the shell's geometry — content column widths, side gutters, the desktop navigation rail's footprint and iOS
// safe-area insets — so the top bar, banners, page content and the quick-log button line up at every width.
import type { Theme } from '@mui/material/styles'
import { tokens } from '../../../theme'
import type { PageWidth } from '../route-handle'

const GUTTER = `${tokens.space(4)}px`

export const safeArea = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
} as const

export const TOP_BAR_HEIGHT = tokens.tapTarget + tokens.space(3)
export const FAB_SIZE = 56

/**
 * The width the desktop navigation rail takes out of the window. Zero on a phone, where the bottom tabs are the
 * navigation instead. Spread into a full-bleed layer's `sx` (the app column, the quick-log button's fixed layer) so
 * everything inside it is laid out to the right of the rail; the rail is not printed, so the offset is not either.
 */
export const railInset = {
  pl: { xs: 0, md: `${tokens.layout.railWidth}px` },
  '@media print': { pl: 0 },
}

/**
 * Minimum content width for the board layouts. A page only gets its desktop columns once the *content* is this wide,
 * not the window: the rail takes its share first, so a window that just crosses `md` still reads as one column.
 */
export const DESKTOP_BOARD_AT = tokens.layout.railWidth + 764

/** One centred column: phone-width pages cap at the `sm` breakpoint; wide pages at the token max content width. Spread into `sx`. */
export function columnSx(width: PageWidth) {
  return {
    width: '100%',
    maxWidth: (theme: Theme) => (width === 'wide' ? tokens.layout.maxContent : theme.breakpoints.values.sm),
    mx: 'auto',
    pl: `max(${GUTTER}, env(safe-area-inset-left, 0px))`,
    pr: `max(${GUTTER}, env(safe-area-inset-right, 0px))`,
  }
}

/**
 * Space under the content so the bottom nav (and the quick-log button, when shown) never cover the last card. A phone
 * carries the bottom nav, so it needs that much more; from `md` up the rail is the navigation and only the button has
 * to clear. Returned as a responsive value, so it can be handed straight to `pb`.
 */
export function contentBottomPadding(withQuickLog: boolean): Record<'xs' | 'md', string> {
  const fab = withQuickLog ? FAB_SIZE + tokens.space(4) : 0
  return {
    xs: `calc(${tokens.layout.bottomNavHeight + tokens.space(6) + fab}px + ${safeArea.bottom})`,
    md: `calc(${tokens.space(8) + fab}px + ${safeArea.bottom})`,
  }
}
