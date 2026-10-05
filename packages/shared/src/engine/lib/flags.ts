// Owns: the safety flags (SPEC §3, §8, §9) — shown to Aaron and the coach, never silently applied: rapid loss,
// plateau, protein under target for a week, and a week of very low steps with a stalled trend.
import type { LocalDate } from '../../schemas/common'
import { adherence } from './adherence'
import { addDays } from './dates'
import { mean } from './math'
import { trendOn } from './trend'
import type { DayRow } from './types'

/** Rapid loss: trend loss above this % of bodyweight per week … */
export const RAPID_LOSS_PCT_PER_WEEK = 1
/** … for this many consecutive weeks. */
export const RAPID_LOSS_WEEKS = 3
/** Plateau: trend loss under this (kg) across PLATEAU_DAYS with adherence ≥ PLATEAU_MIN_ADHERENCE. */
export const PLATEAU_KG = 0.2
export const PLATEAU_DAYS = 21
export const PLATEAU_MIN_ADHERENCE = 0.8
/** Low steps: the week's mean below this share of the steps target (or below LOW_STEPS_FLOOR with no target) … */
export const LOW_STEPS_SHARE = 0.6
export const LOW_STEPS_FLOOR = 5000
/** … while the trend lost less than this (kg) over the same 7 days. */
export const STALLED_KG = 0.1

export type SafetyFlag =
  | { kind: 'rapid_loss'; message: string; weekly_loss_pct: number[] }
  | { kind: 'plateau'; message: string; trend_loss_kg: number; adherence: number }
  | { kind: 'protein_low'; message: string; avg_protein_g: number; target_protein_g: number }
  | { kind: 'low_steps_stalled'; message: string; avg_steps: number; steps_threshold: number; trend_loss_kg: number }

const fmt = (x: number, dp = 1) => x.toFixed(dp)

/**
 * Flags as of a date, from v_day rows with the trend merged in (pass at least the last 22 days). Trend loss over
 * [a, b] = trend(a) − trend(b).
 *   rapid_loss:        for each of the last 3 weeks (b = as_of − 7k, a = b − 7, k = 0…2):
 *                      loss / trend(a) × 100 > 1 % — all three weeks
 *   plateau:           loss over [as_of − 21, as_of] < 0.2 kg ∧ adherence share over as_of − 20 … as_of ≥ 80 %
 *   protein_low:       over as_of − 6 … as_of, days with meals logged, not fast days, with targets:
 *                      mean protein_g < mean target protein_g
 *   low_steps_stalled: mean steps over the week's days with steps (≥ 4 of them) < 60 % of the mean steps target
 *                      (5,000 without targets) ∧ trend loss over [as_of − 7, as_of] < 0.1 kg
 */
export function safetyFlags(input: { as_of: LocalDate; days: readonly DayRow[] }): SafetyFlag[] {
  const { as_of, days } = input
  const flags: SafetyFlag[] = []
  const at = (offset: number) => trendOn(days, addDays(as_of, -offset))
  const lossOver = (a: number, b: number): number | null => {
    const start = at(a)
    const end = at(b)
    return start === null || end === null ? null : start - end
  }
  const within = (n: number) => days.filter((d) => d.date > addDays(as_of, -n) && d.date <= as_of)

  // Rapid loss
  const weekly = Array.from({ length: RAPID_LOSS_WEEKS }, (_, k) => {
    const loss = lossOver(7 * k + 7, 7 * k)
    const start = at(7 * k + 7)
    return loss === null || start === null ? null : (loss / start) * 100
  })
  if (weekly.every((p) => p !== null && p > RAPID_LOSS_PCT_PER_WEEK)) {
    const pct = weekly as number[]
    flags.push({
      kind: 'rapid_loss',
      message: `Trend loss above ${RAPID_LOSS_PCT_PER_WEEK} % of bodyweight a week for ${RAPID_LOSS_WEEKS} weeks (${pct.map((p) => fmt(p)).join(', ')} %)`,
      weekly_loss_pct: pct,
    })
  }

  // Plateau
  const plateauLoss = lossOver(PLATEAU_DAYS, 0)
  const share = adherence(within(PLATEAU_DAYS), PLATEAU_DAYS).share
  if (plateauLoss !== null && plateauLoss < PLATEAU_KG && share >= PLATEAU_MIN_ADHERENCE) {
    flags.push({
      kind: 'plateau',
      message: `Plateau: trend down ${fmt(plateauLoss, 2)} kg in ${PLATEAU_DAYS} days at ${fmt(share * 100, 0)} % adherence — a conversation with the dietitian (diet break, refeed), never below the floor`,
      trend_loss_kg: plateauLoss,
      adherence: share,
    })
  }

  // Protein under target for the week
  const week = within(7)
  const eaten = week.filter((d) => d.meals_logged > 0 && !d.is_fast_day && d.targets !== null)
  const protein = mean(eaten.map((d) => d.intake.protein_g))
  const proteinTarget = mean(eaten.map((d) => d.targets!.protein_g))
  if (protein !== null && proteinTarget !== null && protein < proteinTarget) {
    flags.push({
      kind: 'protein_low',
      message: `Protein averaged ${fmt(protein, 0)} g this week against a ${fmt(proteinTarget, 0)} g target`,
      avg_protein_g: protein,
      target_protein_g: proteinTarget,
    })
  }

  // Very low steps with a stalled trend
  const stepDays = week.filter((d) => d.steps !== null)
  const steps = stepDays.length >= 4 ? mean(stepDays.map((d) => d.steps!)) : null
  const stepsTarget = mean(week.flatMap((d) => (d.targets ? [d.targets.steps] : [])))
  const threshold = stepsTarget !== null ? LOW_STEPS_SHARE * stepsTarget : LOW_STEPS_FLOOR
  const weekLoss = lossOver(7, 0)
  if (steps !== null && weekLoss !== null && steps < threshold && weekLoss < STALLED_KG) {
    flags.push({
      kind: 'low_steps_stalled',
      message: `Steps averaged ${fmt(steps, 0)} a day this week while the trend moved ${fmt(-weekLoss, 2)} kg`,
      avg_steps: steps,
      steps_threshold: threshold,
      trend_loss_kg: weekLoss,
    })
  }
  return flags
}
