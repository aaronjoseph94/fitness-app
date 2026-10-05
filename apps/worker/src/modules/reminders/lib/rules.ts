// Owns: what each reminder kind checks before it goes out and what it says (SPEC §8 "Reminders"). Each rule runs on a
// 5-minute tick inside the waking day, claims its local period (lib/claims) at most once, and returns the notification
// to send, or nothing. Clock rules claim first, then check (one check per period); event rules (fasts, reviews) read
// first and claim only when there is something to say.
//   weigh_in      at its time, daily, unless today's weigh-in is logged
//   workout       at its time on a training day (daily_targets.training_planned, else settings.training_days),
//                 unless a session is logged today
//   scan_due      at its time on the due date (last confirmed scan + scan_interval_days), then every 7 days while
//                 overdue, never while a sheet uploaded on/after the due date waits to be confirmed
//   water         at each water slot (every 2 h 09:00–21:00, 90 min on a fast day) when behind pace
//   fast          at a planned fast's start, and at started_at + fast_hours for a fast still running
//   review_ready  once per week, from Sunday 20:00 through Monday, as soon as the week's review row exists
// rest_timer is not sent from here: the session page notifies on the device (a 5-minute cron can't time a rest).
import { addDays, daysBetween, isoWeek, isoWeekRange, weekdayOf } from '@fitness/shared/engine'
import type { PushNotification, ReminderKind, ReminderPrefs, Weekday } from '@fitness/shared/schemas'
import { DEFAULT_REMINDER_PREFS } from '@fitness/shared/schemas'
import { and, eq, gt, isNull, lte, sum } from 'drizzle-orm'
import { daily_targets, fast_logs, water_logs, weekly_reviews, weight_logs, workout_sessions } from '../../../db'
import type { Deps } from '../../../lib/deps'
import type { PushDelivery } from '../../push'
import { scanSchedule } from '../../scans'
import { claim, unclaimed } from './claims'
import { anyWaterSlot, dueWaterSlot, GRACE_MIN, slotDue, waterPace } from './clock'

/** One tick's view: the Edmonton date and time, the reminder prefs and the settings the rules read. */
export interface Tick {
  deps: Deps
  date: string
  time: string
  prefs: ReminderPrefs
  settings: { water_target_ml: number; training_days: Weekday[]; fast_hours: number }
}

/** A claimed reminder ready to send. */
export interface Due {
  kind: ReminderKind
  period_key: string
  notification: PushNotification
  delivery: Partial<PushDelivery>
}

const HOUR_S = 3600
const MIN_MS = 60_000
/** Week reviews are announced from Sunday 20:00 (when the weekly job runs) through Monday. */
const REVIEW_FROM = '20:00'

const litres = (ml: number) => `${(ml / 1000).toFixed(1)} L`

/** The time a clock reminder fires at: its own, else the default (e.g. scan due 09:00). */
const timeFor = (tick: Tick, kind: ReminderKind) => tick.prefs[kind]?.time ?? DEFAULT_REMINDER_PREFS[kind].time

async function todaysTargets(tick: Tick) {
  const [row] = await tick.deps.db
    .select({ water_ml: daily_targets.water_ml, is_fast_day: daily_targets.is_fast_day, training_planned: daily_targets.training_planned })
    .from(daily_targets)
    .where(eq(daily_targets.date, tick.date))
    .limit(1)
  return row ?? null
}

export async function weighIn(tick: Tick): Promise<Due[]> {
  const at = timeFor(tick, 'weigh_in')
  if (!at || !slotDue(tick.time, at) || !(await claim(tick.deps, 'weigh_in', tick.date))) return []
  const [logged] = await tick.deps.db.select({ id: weight_logs.id }).from(weight_logs).where(eq(weight_logs.date, tick.date)).limit(1)
  if (logged) return []
  return [
    {
      kind: 'weigh_in',
      period_key: tick.date,
      notification: { title: 'Weigh-in', body: 'Step on the scale before breakfast: same time, same conditions.', url: '/', tag: 'weigh_in' },
      delivery: { ttl_s: 3 * HOUR_S },
    },
  ]
}

export async function workout(tick: Tick): Promise<Due[]> {
  const at = timeFor(tick, 'workout')
  if (!at || !slotDue(tick.time, at) || !(await claim(tick.deps, 'workout', tick.date))) return []
  const [targets, [session]] = await Promise.all([
    todaysTargets(tick),
    tick.deps.db.select({ id: workout_sessions.id }).from(workout_sessions).where(eq(workout_sessions.date, tick.date)).limit(1),
  ])
  const planned = targets ? targets.training_planned : tick.settings.training_days.includes(weekdayOf(tick.date))
  if (!planned || session) return []
  return [
    {
      kind: 'workout',
      period_key: tick.date,
      notification: {
        title: 'Training day',
        body: targets?.is_fast_day ? 'Fast day: keep today’s session light.' : 'Today’s session is planned. Start it when you get to the gym.',
        url: '/train',
        tag: 'workout',
      },
      delivery: { ttl_s: 2 * HOUR_S },
    },
  ]
}

export async function scanDue(tick: Tick): Promise<Due[]> {
  const at = timeFor(tick, 'scan_due')
  if (!at || !slotDue(tick.time, at) || !(await claim(tick.deps, 'scan_due', tick.date))) return []
  const schedule = await scanSchedule(tick.deps)
  const { due } = schedule
  if (!due || due > tick.date || daysBetween(due, tick.date) % 7 !== 0) return []
  if (schedule.awaiting_confirmation && schedule.awaiting_confirmation >= due) return []
  const why = schedule.source === 'scheduled' ? 'as planned' : `every ${schedule.interval_days} days`
  const body =
    due === tick.date
      ? `Evolt scan due today (${why}). Same conditions: morning, fasted, no training the day before.`
      : `Evolt scan overdue since ${due}. Same conditions: morning, fasted, no training the day before.`
  return [
    {
      kind: 'scan_due',
      period_key: tick.date,
      notification: { title: due === tick.date ? 'Scan due' : 'Scan overdue', body, url: '/scans', tag: 'scan_due' },
      delivery: { ttl_s: 12 * HOUR_S },
    },
  ]
}

export async function water(tick: Tick): Promise<Due[]> {
  if (!anyWaterSlot(tick.time)) return []
  const { db } = tick.deps
  const [targets, [logged]] = await Promise.all([
    todaysTargets(tick),
    db.select({ ml: sum(water_logs.amount_ml).mapWith(Number) }).from(water_logs).where(eq(water_logs.date, tick.date)),
  ])
  const fastDay = targets?.is_fast_day ?? false
  const slot = dueWaterSlot(tick.time, fastDay)
  if (!slot) return []
  const period_key = `${tick.date}T${slot}`
  if (!(await claim(tick.deps, 'water', period_key))) return []
  const target_ml = targets?.water_ml ?? tick.settings.water_target_ml
  const logged_ml = logged?.ml ?? 0
  const pace = waterPace({ logged_ml, target_ml, time: tick.time })
  if (!pace.behind) return []
  return [
    {
      kind: 'water',
      period_key,
      notification: {
        title: fastDay ? 'Water (fast day)' : 'Water',
        body: `${litres(logged_ml)} of ${litres(target_ml)} so far, about ${litres(pace.behind_ml)} behind pace. Have a glass now.`,
        url: '/',
        tag: 'water',
      },
      delivery: { ttl_s: HOUR_S },
    },
  ]
}

export async function fasts(tick: Tick, now: Date): Promise<Due[]> {
  const { db } = tick.deps
  const iso = (ms: number) => new Date(ms).toISOString()
  const hours = tick.settings.fast_hours
  const grace = GRACE_MIN * MIN_MS
  const endShift = hours * HOUR_S * 1000
  // Instants are UTC 'Z' strings, so comparing them as text is comparing times.
  const [starting, ending] = await Promise.all([
    db
      .select({ id: fast_logs.id })
      .from(fast_logs)
      .where(
        and(
          eq(fast_logs.planned, true),
          isNull(fast_logs.ended_at),
          gt(fast_logs.started_at, iso(now.getTime() - grace)),
          lte(fast_logs.started_at, now.toISOString()),
        ),
      ),
    db
      .select({ id: fast_logs.id })
      .from(fast_logs)
      .where(
        and(
          isNull(fast_logs.ended_at),
          gt(fast_logs.started_at, iso(now.getTime() - endShift - grace)),
          lte(fast_logs.started_at, iso(now.getTime() - endShift)),
        ),
      ),
  ])
  const out: Due[] = []
  for (const f of starting) {
    if (!(await claim(tick.deps, 'fast', `${f.id}:start`))) continue
    out.push({
      kind: 'fast',
      period_key: `${f.id}:start`,
      notification: {
        title: 'Fast starts now',
        body: `Your ${hours} h fast has begun. Water target is up today and training stays light.`,
        url: '/',
        tag: 'fast',
      },
      delivery: { ttl_s: HOUR_S },
    })
  }
  for (const f of ending) {
    if (!(await claim(tick.deps, 'fast', `${f.id}:end`))) continue
    out.push({
      kind: 'fast',
      period_key: `${f.id}:end`,
      notification: { title: 'Fast complete', body: `${hours} h done. Tap to end the fast, then log your first meal.`, url: '/', tag: 'fast' },
      delivery: { ttl_s: HOUR_S },
    })
  }
  return out
}

export async function reviewReady(tick: Tick): Promise<Due[]> {
  const weekday = weekdayOf(tick.date)
  const sunday = weekday === 'sun' && tick.time >= REVIEW_FROM ? tick.date : weekday === 'mon' ? addDays(tick.date, -1) : null
  if (!sunday) return []
  const week = isoWeek(sunday)
  const [review] = await tick.deps.db
    .select({ author: weekly_reviews.author })
    .from(weekly_reviews)
    .where(and(eq(weekly_reviews.week_start, isoWeekRange(week).from), unclaimed('review_ready', week)))
    .limit(1)
  if (!review || !(await claim(tick.deps, 'review_ready', week))) return []
  const who = review.author === 'claude_mcp' ? 'Claude’s review' : 'Your review'
  return [
    {
      kind: 'review_ready',
      period_key: week,
      notification: {
        title: 'Weekly review ready',
        body: `${who} of week ${Number(week.slice(6))} is ready, with next week’s plan.`,
        url: `/reports/week/${week}`,
        tag: 'review_ready',
      },
      delivery: { ttl_s: 24 * HOUR_S },
    },
  ]
}
