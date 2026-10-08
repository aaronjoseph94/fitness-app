// Owns: how Ask AI words a moment (pure) — a chat row's "Today · 2:15 PM" / "Yesterday" / "Sep 30", a proposal's
// "2:16 PM" (today) or "Mon 9:02 AM", and a reply's "2:15 PM · 1.8 s", all on Edmonton's clock.
import { addDays, localDate, TIMEZONE, today } from '@fitness/shared/engine'
import { formatShortDate } from '../../../components'

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, hour: 'numeric', minute: '2-digit' })
const weekdayClock = new Intl.DateTimeFormat('en-US', { timeZone: TIMEZONE, weekday: 'short', hour: 'numeric', minute: '2-digit' })

/** "2026-10-07T21:15:00Z" → "3:15 PM" (Edmonton). */
export function clockTime(instant: string): string {
  return clock.format(new Date(instant))
}

/** A chat row's date: "Today · 2:15 PM", "Yesterday", else "Sep 30". */
export function chatWhen(instant: string, now: number = Date.now()): string {
  const day = localDate(instant)
  const current = today(now)
  if (day === current) return `Today · ${clockTime(instant)}`
  if (day === addDays(current, -1)) return 'Yesterday'
  return formatShortDate(day)
}

/** A proposal's time: "2:16 PM" when it is from today, else "Mon 9:02 AM". */
export function proposalWhen(instant: string, now: number = Date.now()): string {
  return localDate(instant) === today(now) ? clockTime(instant) : weekdayClock.format(new Date(instant)).replace(',', '')
}

/**
 * A reply's caption: "2:15 PM · 1.8 s" — the reply's time and how long the turn took after the question was stored
 * (left out when it is under 0.1 s, as for the instant "isn't set up" reply, or makes no sense).
 */
export function replyWhen(asked: string, answered: string): string {
  const seconds = (Date.parse(answered) - Date.parse(asked)) / 1000
  const took = seconds >= 0.1 && seconds < 600 ? ` · ${seconds.toFixed(1)} s` : ''
  return `${clockTime(answered)}${took}`
}
