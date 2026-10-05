// Owns: the reminder clock — pure arithmetic on Edmonton wall-clock "HH:MM": quiet hours, when a clock reminder is due
// on a 5-minute tick, the water check slots (every 2 h from 09:00 to 21:00, every 90 min on a fast day), and the water
// pace (target × elapsed share of the waking day).
import { REMINDER_HOURS } from '@fitness/shared/schemas'

/** A slot fires on the first tick at or after it, up to this many minutes late (a delayed or skipped cron tick). */
export const GRACE_MIN = 30

/** Water checks run from 09:00 to 21:00 inclusive. */
export const WATER_WINDOW = { from: '09:00', to: '21:00' } as const
/** Minutes between water checks: 120 normally, 90 on a fast day (SPEC §8; the fast-day target is higher). */
export const WATER_EVERY_MIN = { normal: 120, fast: 90 } as const
/** Behind pace means at least this far below the expected amount (one glass), so a sip short never nags. */
export const WATER_SLACK_ML = 250

/** "HH:MM" → minutes since midnight. */
export function minutesOf(time: string): number {
  const [h, m] = time.split(':')
  return Number(h) * 60 + Number(m)
}

/** Minutes since midnight → "HH:MM". */
export function timeOf(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Not quiet: REMINDER_HOURS.from ≤ time < REMINDER_HOURS.to. */
export function awake(time: string): boolean {
  return time >= REMINDER_HOURS.from && time < REMINDER_HOURS.to
}

/** A slot is due on a tick at `time` when slot ≤ time < slot + GRACE_MIN (same local day). */
export function slotDue(time: string, slot: string): boolean {
  const t = minutesOf(time)
  const s = minutesOf(slot)
  return t >= s && t < s + GRACE_MIN
}

/** Water check slots for a day: 09:00, then every 120 min (90 on a fast day), the last at or before 21:00. */
export function waterSlots(fastDay: boolean): string[] {
  const step = fastDay ? WATER_EVERY_MIN.fast : WATER_EVERY_MIN.normal
  const out: string[] = []
  for (let m = minutesOf(WATER_WINDOW.from); m <= minutesOf(WATER_WINDOW.to); m += step) out.push(timeOf(m))
  return out
}

/** The water slot due at `time` for this kind of day, or null. */
export function dueWaterSlot(time: string, fastDay: boolean): string | null {
  return waterSlots(fastDay).find((slot) => slotDue(time, slot)) ?? null
}

/** Whether any water slot (either cadence) is due at `time`: the cheap gate before reading the day. */
export function anyWaterSlot(time: string): boolean {
  return dueWaterSlot(time, false) !== null || dueWaterSlot(time, true) !== null
}

export interface WaterPace {
  /** target × share, share = clamp((time − 07:00) / (22:00 − 07:00), 0, 1), rounded to the ml. */
  expected_ml: number
  /** max(0, expected − logged). */
  behind_ml: number
  /** behind_ml ≥ WATER_SLACK_ML. */
  behind: boolean
}

/** Water pace at `time`: expected = target_ml × elapsed share of the waking day (07:00–22:00). */
export function waterPace(input: { logged_ml: number; target_ml: number; time: string }): WaterPace {
  const from = minutesOf(REMINDER_HOURS.from)
  const span = minutesOf(REMINDER_HOURS.to) - from
  const share = Math.min(1, Math.max(0, (minutesOf(input.time) - from) / span))
  const expected_ml = Math.round(input.target_ml * share)
  const behind_ml = Math.max(0, expected_ml - input.logged_ml)
  return { expected_ml, behind_ml, behind: behind_ml >= WATER_SLACK_ML }
}
