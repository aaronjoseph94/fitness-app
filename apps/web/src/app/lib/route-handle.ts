// Owns: the per-route shell settings (title, tab, trail, width, sky) carried in each route's `handle`, and the hook
// the shell uses to read the deepest one. The route table is the single place a page declares its chrome.
import { useMatches } from 'react-router'
import type { HeroVariant } from '../../theme'
import type { TabKey } from '../ui-store'
import { APP_NAME } from '../brand'

export type PageWidth = 'narrow' | 'wide'

/** One step of a breadcrumb trail: the page's name and where it lives. */
export interface Crumb {
  title: string
  path: string
}

export interface RouteHandle {
  /** The page's name: the sky's fallback title (a page without its own header) and the document title. */
  title: string
  /**
   * The bottom tab this page is. Pages without one get a back circle on the phone instead of the logo — except the
   * nav's own Scans and Settings, which it links to directly.
   */
  tab?: TabKey
  /**
   * The pages above this one, outermost first ("Train" above "Session"). The nav marks the first as the section the
   * page belongs to. A top-level page has none.
   */
  trail?: readonly Crumb[]
  /**
   * 'wide' gives the page the whole content column (1d's 1,328 px); 'narrow' keeps a reading column (820 px from
   * `md`, a phone-width one under it). Default 'narrow'.
   */
  width?: PageWidth
  /** The sky: Today's full one, an inner page's (default) or the compact one (Ask AI, Settings). A page's
   * `PageHeader variant` overrides it while mounted. */
  hero?: HeroVariant
}

const FALLBACK: RouteHandle = { title: APP_NAME }

function isRouteHandle(handle: unknown): handle is RouteHandle {
  return typeof handle === 'object' && handle !== null && typeof (handle as RouteHandle).title === 'string'
}

export function useRouteHandle(): RouteHandle {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]?.handle
    if (isRouteHandle(handle)) return handle
  }
  return FALLBACK
}
