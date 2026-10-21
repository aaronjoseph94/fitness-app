// Owns: the seam between a page's `PageHeader` and the sky hero the shell draws above the cream panel — where the
// header's content renders (the shell's hero slot, through a portal, so a header written anywhere in a page lands on
// the sky), which sky variant the page asks for, and whether a page header is on screen at all (so the shell shows its
// fallback title only for a page without one). Without a provider (a page rendered outside the app shell) the header
// renders in place.
import { createContext, useContext } from 'react'
import type { HeroVariant } from '../../theme'

export interface HeroSlot {
  /** The element a page header portals into; null until the shell's sky has mounted. */
  target: HTMLElement | null
  /** The sky variant on screen (the header sizes its title by it: a compact sky takes the smaller h1). */
  variant: HeroVariant
  /**
   * A page header announces itself while it is mounted, with the sky it wants (`null`: the route's). Returns the
   * release. Called from a layout effect, so the shell drops its fallback title before the first paint.
   */
  claim: (variant: HeroVariant | null) => () => void
}

const HeroSlotContext = createContext<HeroSlot | null>(null)

/** The shell provides the slot; a page header reads it. */
export const HeroSlotProvider = HeroSlotContext.Provider

export function useHeroSlot(): HeroSlot | null {
  return useContext(HeroSlotContext)
}
