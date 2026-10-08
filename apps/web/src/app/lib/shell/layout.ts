// Owns: the shell's geometry — the desktop navigation's footprint (2a's 240 px sidebar, or the 76 px icon rail it
// collapses to), the content column and its reading-width variant, the main padding, the side gutters and iOS
// safe-area insets — so the header, banners, page content and the quick-log button line up at every width.
import { theme, tokens } from '../../../theme'
import type { PageWidth } from '../route-handle'

const { layout } = tokens

export const safeArea = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
} as const

/** The desktop header and the phone's top bar: 56 px either way, so a sticky bar below them (Log's date switcher) sits flush. */
export const HEADER_HEIGHT = layout.headerHeight
export const FAB_SIZE = 56

/** The desktop navigation's width: the labelled sidebar, or the icon rail it collapses to. */
export function navWidth(collapsed: boolean): number {
  return collapsed ? layout.railWidth : layout.sidebarWidth
}

/**
 * The CSS custom property that carries the navigation's current footprint (0 on a phone, where the bottom tabs are the
 * navigation). The shell sets it once on its root; the fixed layers (the sidebar itself, the quick-log button) and the
 * app column read it, so a collapse moves all of them together.
 */
export const NAV_VAR = '--shell-nav-width'
export const navInset = `var(${NAV_VAR}, 0px)`

/**
 * 2a's content column: 1,144 px is what its 1,440 px design leaves between the 240 px sidebar and the 28 px main
 * padding on each side. Wider windows centre the column rather than stretching the cards past their drawn proportions.
 */
export const CONTENT_MAX = 1440 - layout.sidebarWidth - 2 * layout.mainPadding.x

/** A narrow page's reading column on a desktop (2a Settings' content column); a phone keeps the `sm` width. */
export const READING_MAX = 820

const GUTTER = `${tokens.space(4)}px`

/**
 * The shell's column — the header's row, the banners and `main` share it, so the breadcrumb, a banner and the page's
 * title start on one edge: a 16 px gutter (or the safe area) on a phone, 2a's 28 px from `md` up, centred and capped
 * at the content width.
 */
export const shellColumnSx = {
  width: '100%',
  mx: 'auto',
  maxWidth: { md: CONTENT_MAX + 2 * layout.mainPadding.x },
  pl: { xs: `max(${GUTTER}, env(safe-area-inset-left, 0px))`, md: `${layout.mainPadding.x}px` },
  pr: { xs: `max(${GUTTER}, env(safe-area-inset-right, 0px))`, md: `${layout.mainPadding.x}px` },
} as const

/**
 * The page's own width inside the column: a wide page takes all of it; a narrow one keeps a reading column — the
 * phone width, centred, under `md`, and 2a's 820 px from the column's left edge on a desktop. Spread into `sx`.
 */
export function pageWidthSx(width: PageWidth) {
  if (width === 'wide') return {}
  return {
    maxWidth: { xs: theme.breakpoints.values.sm, md: READING_MAX },
    mx: { xs: 'auto', md: 0 },
  }
}

/**
 * Padding inside `main`. A phone clears the bottom tabs (and the quick-log button, when shown) so neither covers the last
 * card; from `md` up it is 2a's `24px 28px 36px` (the sides come from the column).
 */
export function mainPaddingSx(withQuickLog: boolean) {
  const fab = withQuickLog ? FAB_SIZE + tokens.space(4) : 0
  return {
    pt: { xs: `${tokens.space(4)}px`, md: `${layout.mainPadding.top}px` },
    pb: {
      xs: `calc(${layout.bottomNavHeight + tokens.space(6) + fab}px + ${safeArea.bottom})`,
      md: `calc(${layout.mainPadding.bottom}px + ${safeArea.bottom})`,
    },
  }
}
