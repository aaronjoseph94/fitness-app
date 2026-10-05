// Owns: the shell's geometry — content column widths, side gutters and iOS safe-area insets — so the top bar, banners,
// page content and the quick-log button line up at every width.
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

/** Space under the content so the bottom nav (and the quick-log button, when shown) never cover the last card. */
export function contentBottomPadding(withQuickLog: boolean): string {
  const clearance = tokens.layout.bottomNavHeight + tokens.space(6) + (withQuickLog ? FAB_SIZE + tokens.space(4) : 0)
  return `calc(${clearance}px + ${safeArea.bottom})`
}
