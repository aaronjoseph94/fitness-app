// Owns: the week view (GET /api/week-plans/view, get_week_plan) — a week's active and newest proposed plan, its days
// and last week's from v_day (targets, intake, water, steps, fasts, sessions), and what the shown plan changes from
// last week, one short line each per plan (no names: an LLM may read them).
import { addDays, today, weekdayOf } from '@fitness/shared/engine'
import { Weekday, type WeekDayActual, type WeekPlan, type WeekPlanView } from '@fitness/shared/schemas'
import { between } from 'drizzle-orm'
import { v_day } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { ensureTargetsThrough } from '../../plan'
import { listPlans } from './rows'

/** The spine never reaches further ahead than the day module's (today + 14). */
const SPINE_AHEAD_DAYS = 14

const LABEL: Record<Weekday, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' }
const fmt = (n: number) => Math.round(n).toLocaleString('en-CA')

type VDayRow = typeof v_day.$inferSelect

function actual(date: string, row: VDayRow | undefined): WeekDayActual {
  return {
    date,
    weekday: weekdayOf(date),
    target_kcal: row ? row.target_kcal : null,
    intake_kcal: Math.round(row?.intake_kcal ?? 0),
    intake_protein_g: Math.round(row?.intake_protein_g ?? 0),
    meals_logged: row?.meals_logged ?? 0,
    water_ml: row?.water_ml ?? 0,
    steps: row?.steps ?? null,
    is_fast_day: row?.is_fast_day ?? false,
    fasted: row?.fasted ?? false,
    training_planned: row?.training_planned ?? false,
    sessions_done: row?.sessions_done ?? 0,
  }
}

const days = (start: string, rows: Map<string, VDayRow>) => Weekday.options.map((_, i) => actual(addDays(start, i), rows.get(addDays(start, i))))

/** "Mon, Tue" or "every day". */
const dayList = (ws: readonly Weekday[]) => (ws.length === 7 ? 'every day' : ws.map((w) => LABEL[w]).join(', '))

/** Weekdays grouped by identical from → to, as "Calories Mon, Tue: 1,600 → 1,550 kcal". */
function grouped(label: string, unit: string, moves: { weekday: Weekday; from: number; to: number }[]): string[] {
  const groups = new Map<string, Weekday[]>()
  for (const m of moves) {
    if (Math.round(m.from) === Math.round(m.to)) continue
    const key = `${fmt(m.from)} → ${fmt(m.to)} ${unit}`
    groups.set(key, [...(groups.get(key) ?? []), m.weekday])
  }
  return [...groups].map(([move, ws]) => `${label} ${dayList(ws)}: ${move}`)
}

/**
 * What `shown` changes from last week: calories and protein per weekday (against last week's plan, else last week's
 * materialised calorie targets), water, steps and sessions against last week's plan, then this week's fasts and scan.
 */
export function weekChanges(shown: WeekPlan | null, last: WeekPlan | null, lastDays: readonly WeekDayActual[]): string[] {
  if (!shown) return []
  const p = shown.plan
  const fastDay = (start: string, i: number, fasts: readonly string[]) => fasts.includes(addDays(start, i))
  const out: string[] = []
  const kcal: { weekday: Weekday; from: number; to: number }[] = []
  const protein: typeof kcal = []
  Weekday.options.forEach((weekday, i) => {
    if (fastDay(shown.week_start, i, p.fast_dates)) return
    if (last) {
      if (fastDay(last.week_start, i, last.plan.fast_dates)) return
      kcal.push({ weekday, from: last.plan.targets[weekday].kcal, to: p.targets[weekday].kcal })
      protein.push({ weekday, from: last.plan.targets[weekday].protein_g, to: p.targets[weekday].protein_g })
    } else {
      const d = lastDays[i]
      if (d && d.target_kcal !== null && !d.is_fast_day) kcal.push({ weekday, from: d.target_kcal, to: p.targets[weekday].kcal })
    }
  })
  out.push(...grouped('Calories', 'kcal', kcal), ...grouped('Protein', 'g', protein))
  if (last) {
    if (last.plan.water_ml !== p.water_ml) out.push(`Water: ${fmt(last.plan.water_ml)} → ${fmt(p.water_ml)} ml`)
    if (last.plan.steps !== p.steps) out.push(`Steps: ${fmt(last.plan.steps)} → ${fmt(p.steps)}`)
    for (const w of Weekday.options) {
      const before = last.plan.sessions[w]?.name ?? null
      const after = p.sessions[w]?.name ?? null
      if (before !== after) out.push(`${LABEL[w]}: ${before ?? 'rest'} → ${after ?? 'rest'}`)
    }
  }
  for (const d of p.fast_dates) out.push(`Fast day ${LABEL[weekdayOf(d)]} ${d}`)
  if (p.scan_date) out.push(`Scan ${LABEL[weekdayOf(p.scan_date)]} ${p.scan_date}`)
  return out
}

export async function weekView(deps: Deps, week_start: string): Promise<WeekPlanView> {
  const last_start = addDays(week_start, -7)
  const end = addDays(week_start, 6)
  const ahead = addDays(today(deps.now()), SPINE_AHEAD_DAYS)
  await ensureTargetsThrough(deps, end < ahead ? end : ahead)
  const [plans, [last = null], rows] = await Promise.all([
    listPlans(deps, { week_start }),
    listPlans(deps, { week_start: last_start, status: 'active' }),
    deps.db.select().from(v_day).where(between(v_day.date, last_start, end)),
  ])
  const byDate = new Map(rows.map((r) => [r.date, r]))
  const active = plans.find((p) => p.status === 'active') ?? null
  const proposed = plans.find((p) => p.status === 'proposed') ?? null
  const lastDays = days(last_start, byDate)
  return {
    week_start,
    active,
    proposed,
    days: days(week_start, byDate),
    last_week: { week_start: last_start, plan: last, days: lastDays },
    changes: { active: weekChanges(active, last, lastDays), proposed: weekChanges(proposed, last, lastDays) },
  }
}
