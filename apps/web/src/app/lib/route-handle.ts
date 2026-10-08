// Owns: the per-route shell settings (title, tab, breadcrumb trail, width, quick-log button) carried in each route's
// `handle`, and the hook the shell uses to read the deepest one. The route table is the single place a page declares
// its chrome.
import { useMatches } from 'react-router'
import type { TabKey } from '../ui-store'

export type PageWidth = 'narrow' | 'wide'

/** One step of a breadcrumb trail: the page's name and where it lives. */
export interface Crumb {
  title: string
  path: string
}

export interface RouteHandle {
  /** The page's name: the breadcrumb's last step, the phone bar's title and the document title. */
  title: string
  /** The bottom tab this page is. Pages without one get a back arrow on the phone instead. */
  tab?: TabKey
  /**
   * The pages above this one, outermost first ("Train" above "Session"). The header's breadcrumb links each, and the
   * sidebar marks the first as the section the page belongs to. A top-level page has none.
   */
  trail?: readonly Crumb[]
  /**
   * 'wide' gives the page the whole content column (2a's 1,144 px at a 1,440 px window); 'narrow' keeps a reading
   * column (a phone-width one under `md`). Default 'narrow'.
   */
  width?: PageWidth
  /** Show the floating quick-log button (phones; the desktop pages carry their own "Log" button). */
  quickLog?: boolean
}

const FALLBACK: RouteHandle = { title: 'Fitness' }

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
