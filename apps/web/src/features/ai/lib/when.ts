// Owns: how Ask AI words a moment (pure) — a chat row's "Today · 2:15 PM" / "Yesterday · 9:02 AM" / "Sep 30 · 6:40 PM" and a reply's
// "2:15 PM · 1.8 s", all on Edmonton's clock (the kit's formatClock).
import { addDays, localDate, today } from '@fitness/shared/engine'
import { formatClock, formatShortDate } from '../../../components'

/**
 * A chat row's when: "Today · 2:15 PM", "Yesterday · 2:15 PM", else "Sep 30 · 2:15 PM". The time is always there, so
 * chats opened with the same starter (and so the same title) still tell apart.
 */
export function chatWhen(instant: string, now: number = Date.now()): string {
  const day = localDate(instant)
  const current = today(now)
  const label = day === current ? 'Today' : day === addDays(current, -1) ? 'Yesterday' : formatShortDate(day)
  return `${label} · ${formatClock(instant)}`
}

/**
 * A reply's caption: "2:15 PM · 1.8 s" — the reply's time and how long the turn took after the question was stored
 * (left out when it is under 0.1 s, as for the instant "isn't set up" reply, or makes no sense).
 */
export function replyWhen(asked: string, answered: string): string {
  const seconds = (Date.parse(answered) - Date.parse(asked)) / 1000
  const took = seconds >= 0.1 && seconds < 600 ? ` · ${seconds.toFixed(1)} s` : ''
  return `${formatClock(answered)}${took}`
}
