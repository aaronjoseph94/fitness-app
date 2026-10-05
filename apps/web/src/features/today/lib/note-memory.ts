// Owns: remembering the pinned coach note on this phone between launches, so Today paints it in its place before the
// day answers — the note sits at the top, and arriving late it would push every card below it down. The day's copy
// always replaces it once it arrives (and is remembered in turn). A note past its `until` is never shown from memory.
import { DashboardNote } from '@fitness/shared/schemas'

const KEY = 'fitness.today-note'

/** The note the day last carried, if it is still pinned at `now`; null when there is none or storage is unavailable. */
export function rememberedNote(now = Date.now()): DashboardNote | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = DashboardNote.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    return parsed.data.until && Date.parse(parsed.data.until) <= now ? null : parsed.data
  } catch {
    return null
  }
}

/** Keep the day's note (or forget it when the day has none). */
export function rememberNote(note: DashboardNote | null): void {
  try {
    if (note) localStorage.setItem(KEY, JSON.stringify(note))
    else localStorage.removeItem(KEY)
  } catch {
    // Private mode or storage full: Today simply waits for the day.
  }
}
