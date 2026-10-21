// Owns: the shell's geometry — the page gutter (nav, hero row, panel: content 1,328 px at most, centred), the narrow
// page's reading column, the nav's height over the sky, the phone's tab-bar clearance and the iOS safe-area insets — so
// the nav, the sky's content and the panel line up at every width.
import { theme, tokens } from '../../../theme'
import type { PageWidth } from '../route-handle'

const { layout } = tokens

export const safeArea = {
  top: 'env(safe-area-inset-top, 0px)',
  bottom: 'env(safe-area-inset-bottom, 0px)',
} as const

/** A narrow page's reading column on a desktop; a phone keeps the `sm` width. */
export const READING_MAX = layout.readingMax

/** The shell's column: the page gutter on both sides (README §3), never under the safe areas of a landscape phone. */
export const shellColumnSx = {
  pl: `max(${layout.gutter}, env(safe-area-inset-left, 0px))`,
  pr: `max(${layout.gutter}, env(safe-area-inset-right, 0px))`,
} as const

/**
 * The page's own width inside the panel: a wide page takes all of it; a narrow one keeps a reading column — the phone
 * width, centred, under `md`, and 820 px from the column's left edge on a desktop. Spread into `sx`.
 */
export function pageWidthSx(width: PageWidth) {
  if (width === 'wide') return {}
  return {
    maxWidth: { xs: theme.breakpoints.values.sm, md: READING_MAX },
    mx: { xs: 'auto', md: 0 },
  }
}

/** What a phone page leaves under its content (README §3: 84 px + the home indicator), so the tab bar never covers
 * the last card. */
export function tabBarClearance(): string {
  return `calc(${layout.tabBar.clearance}px + ${safeArea.bottom})`
}

/** The nav's height over the sky, the safe area included: what the sky keeps clear above the page's hero. */
export function navInset(wide: boolean): string {
  return `calc(${wide ? layout.navHeight.wide : layout.navHeight.narrow}px + ${safeArea.top})`
}
