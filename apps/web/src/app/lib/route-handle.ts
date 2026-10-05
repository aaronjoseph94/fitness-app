// Owns: the per-route shell settings (title, tab, width, quick-log button) carried in each route's `handle`, and the
// hook the shell uses to read the deepest one. The route table is the single place a page declares its chrome.
import { useMatches } from 'react-router'
import type { TabKey } from '../ui-store'

export type PageWidth = 'narrow' | 'wide'

export interface RouteHandle {
  /** Top bar title (and document title). */
  title: string
  /** The bottom tab this page is. Pages without one get a back arrow instead. */
  tab?: TabKey
  /** 'wide' lets the page use the desktop width; ≥ 900 px it may lay out two columns. Default 'narrow'. */
  width?: PageWidth
  /** Show the floating quick-log button. */
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
