// Owns: the engine-written review — a plain narrative, highlights and concerns from the weekly metrics alone, used when
// the router cannot answer (so the week still gets a review), and the "carry the active plan forward" week plan the
// weekly_review job output needs when no model wrote one.
import { addDays } from '@fitness/shared/engine'
import { Weekday, type PlanTargets, type WeekPlanContent, type WeeklyMetrics } from '@fitness/shared/schemas'

/** Sleep under this many minutes a night is a concern (7 h). */
const SLEEP_CONCERN_MIN = 420
/** Shares under this are concerns, at or over it highlights. */
const GOOD_SHARE = 0.8

const num = (x: number, dp = 0) => x.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const signed = (x: number, dp = 1) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${num(Math.abs(x), dp)}`
const pct = (share: number) => `${Math.round(share * 100)} %`
const hours = (min: number) => `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export interface EngineReview {
  narrative: string
  highlights: string[]
  concerns: string[]
}

/** A factual summary of the week, written by rules from the metrics (no model involved). */
export function engineReview(m: WeeklyMetrics, note?: string): EngineReview {
  const end = addDays(m.week_start, 6)
  const eatingDays = m.days_logged - m.fasts.filter((f) => f.status !== 'active').length
  const completedFasts = m.fasts.filter((f) => f.status === 'completed')
  const lines: string[] = [`Week ${m.week} (${m.week_start} to ${end}).`]

  lines.push(
    m.trend_change_kg !== null && m.trend_start_kg !== null && m.trend_end_kg !== null
      ? `Trend weight ${num(m.trend_start_kg, 1)} → ${num(m.trend_end_kg, 1)} kg (${signed(m.trend_change_kg)} kg).`
      : 'Not enough weigh-ins for a trend change this week.',
  )
  lines.push(
    m.days_logged > 0
      ? `Intake averaged ${num(m.intake_avg.kcal)} kcal${m.target_kcal_avg === null ? '' : ` against a ${num(m.target_kcal_avg)} kcal target`} with ${num(m.intake_avg.protein_g)} g protein over ${plural(m.days_logged, 'logged day')}; protein met its target on ${pct(m.protein_adherence)} of eating days.`
      : 'No intake was logged this week.',
  )
  const habits = [
    m.water_avg_ml > 0 ? `water ${num(m.water_avg_ml)} ml` : null,
    m.steps_avg !== null ? `steps ${num(m.steps_avg)}` : null,
    m.sleep_avg_min !== null ? `sleep ${hours(m.sleep_avg_min)}` : null,
  ].filter((x): x is string => x !== null)
  if (habits.length) lines.push(`Daily averages: ${habits.join(', ')}.`)
  lines.push(
    `${m.sessions_done} of ${plural(m.sessions_planned, 'planned session')} done${m.prs.length ? `, with ${plural(m.prs.length, 'PR')}` : ''}.`,
  )
  if (m.fasts.length) lines.push(`${completedFasts.length} of ${plural(m.fasts.length, 'fast')} completed.`)
  lines.push(`Logging adherence ${pct(m.logging_adherence)}.`)
  if (m.forecast)
    lines.push(
      `The forecast at the current plan is ${num(m.forecast.weekly_rate_kg, 2)} kg a week${m.forecast.finish_date ? `, reaching the goal around ${m.forecast.finish_date}` : ''}.`,
    )
  if (m.scan)
    lines.push(
      `Scan ${m.scan.date} vs ${m.scan.previous_date}: fat ${signed(m.scan.fat_vs_lean.fat_kg)} kg, lean ${signed(m.scan.fat_vs_lean.lean_kg)} kg, water ${signed(m.scan.fat_vs_lean.water_kg)} kg.`,
    )
  for (const f of m.flags) lines.push(`${f.message}.`)
  if (note) lines.push(note)

  const highlights: string[] = []
  const concerns: string[] = m.flags.map((f) => f.message)
  if (m.trend_change_kg !== null && m.trend_change_kg < 0) highlights.push(`Trend down ${num(-m.trend_change_kg, 1)} kg`)
  if (m.trend_change_kg !== null && m.trend_change_kg > 0) concerns.push(`Trend up ${num(m.trend_change_kg, 1)} kg`)
  if (eatingDays > 0) {
    if (m.protein_adherence >= GOOD_SHARE) highlights.push(`Protein target met on ${pct(m.protein_adherence)} of eating days`)
    else concerns.push(`Protein target met on only ${pct(m.protein_adherence)} of eating days`)
  }
  if (m.sessions_planned > 0 && m.sessions_done >= m.sessions_planned) highlights.push(`All ${plural(m.sessions_planned, 'planned session')} done`)
  else if (m.sessions_done < m.sessions_planned) concerns.push(`${m.sessions_planned - m.sessions_done} of ${plural(m.sessions_planned, 'planned session')} missed`)
  if (m.prs.length)
    highlights.push(`${plural(m.prs.length, 'PR')}: ${[...new Set(m.prs.map((p) => p.exercise_name))].slice(0, 3).join(', ')}`)
  if (completedFasts.length) highlights.push(`${plural(completedFasts.length, 'fast')} completed`)
  for (const f of m.fasts.filter((f) => f.status === 'partial')) concerns.push(`A fast ended early at ${num(f.hours, 1)} h`)
  if (m.sleep_avg_min !== null && m.sleep_avg_min < SLEEP_CONCERN_MIN) concerns.push(`Sleep averaged ${hours(m.sleep_avg_min)}, under 7 h`)
  if (m.logging_adherence >= GOOD_SHARE) highlights.push(`Logging adherence ${pct(m.logging_adherence)}`)
  else concerns.push(`Logging adherence ${pct(m.logging_adherence)}`)
  if (m.scan && m.scan.fat_vs_lean.fat_kg < 0) highlights.push(`Scan: ${num(-m.scan.fat_vs_lean.fat_kg, 1)} kg fat lost since ${m.scan.previous_date}`)

  return { narrative: lines.join(' '), highlights, concerns }
}

/**
 * The week plan the job output carries when no model wrote one: the active plan's targets per weekday (override,
 * else default), no sessions (training is planned separately), the plan's water and steps, the planned fasts of that
 * week, and no scan date.
 */
export function carryForwardPlan(targets: PlanTargets, fast_dates: readonly string[]): WeekPlanContent {
  const day = (w: Weekday) => {
    const t = { ...targets.defaults, ...targets.overrides[w] }
    return { kcal: t.kcal, protein_g: t.protein_g, carbs_g: t.carbs_g, fat_g: t.fat_g, fibre_g: t.fibre_g }
  }
  const byDay = Object.fromEntries(Weekday.options.map((w) => [w, day(w)])) as WeekPlanContent['targets']
  const sessions = Object.fromEntries(Weekday.options.map((w) => [w, null])) as WeekPlanContent['sessions']
  return {
    targets: byDay,
    sessions,
    water_ml: targets.defaults.water_ml,
    steps: targets.defaults.steps,
    fast_dates: fast_dates.slice(0, 7),
    scan_date: null,
    focus_note: 'Carry the current plan forward.',
  }
}
