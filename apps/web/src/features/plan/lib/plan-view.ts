// Owns: how the plan reads on the plan history page (pure) — target labels and units, a diff line (from → to, per field
// and weekday), the diff a restore would make (active targets → an older version's), the forecast in a sentence, who
// made a version, which events are the guards' verdicts, and each pending change re-checked against today's rails
// with the engine's own applyGuards (the Worker re-runs the guards on accept; this only shows what they would say).
import { applyGuards, type TargetChange } from '@fitness/shared/engine'
import type { Actor, AiEvent, Forecast, PlanChange, PlanDiff, PlanTargets, Rails, TargetField, Weekday } from '@fitness/shared/schemas'
import { formatNumber, formatSigned } from '../../../components'

export const FIELD: Record<TargetField, { label: string; unit: string }> = {
  kcal: { label: 'Calories', unit: 'kcal' },
  protein_g: { label: 'Protein', unit: 'g' },
  carbs_g: { label: 'Carbs', unit: 'g' },
  fat_g: { label: 'Fat', unit: 'g' },
  fibre_g: { label: 'Fibre', unit: 'g' },
  water_ml: { label: 'Water', unit: 'ml' },
  steps: { label: 'Steps', unit: 'steps' },
}

const FIELD_ORDER: TargetField[] = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g', 'water_ml', 'steps']
const WEEKDAYS: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Mondays',
  tue: 'Tuesdays',
  wed: 'Wednesdays',
  thu: 'Thursdays',
  fri: 'Fridays',
  sat: 'Saturdays',
  sun: 'Sundays',
}

/** GLOSSARY: `user` is Aaron, `ai` the Clerk (free-tier LLM), `mcp` the Coach (Claude). */
export function actorLabel(actor: Actor): string {
  return actor === 'mcp' ? 'Coach' : actor === 'ai' ? 'AI' : 'You'
}

export function amount(field: TargetField, value: number | null): string {
  return value === null ? '—' : `${formatNumber(value)} ${FIELD[field].unit}`
}

export interface DiffRow {
  key: string
  label: string
  from: string
  to: string
  /** Signed change when both sides are numbers, e.g. "−100". */
  delta: string | null
}

export function diffRows(diff: PlanDiff): DiffRow[] {
  return diff.map((d) => ({
    key: `${d.field}:${d.weekday ?? 'all'}`,
    label: `${FIELD[d.field].label}${d.weekday ? `, ${WEEKDAY_LABEL[d.weekday]}` : ''}`,
    from: amount(d.field, d.from),
    to: amount(d.field, d.to),
    delta: d.from !== null && d.to !== null && d.from !== d.to ? formatSigned(d.to - d.from) : null,
  }))
}

export function changeRows(changes: readonly PlanChange[]): DiffRow[] {
  return diffRows(changes.map((c) => ({ field: c.field, weekday: c.weekday, from: c.from, to: c.to })))
}

/** What changes going from `from` to `to`: every default that differs, then every weekday override that differs. */
export function targetsDiff(from: PlanTargets, to: PlanTargets): PlanDiff {
  const out: PlanDiff = []
  for (const field of FIELD_ORDER) {
    if (from.defaults[field] !== to.defaults[field]) out.push({ field, weekday: null, from: from.defaults[field], to: to.defaults[field] })
  }
  for (const weekday of WEEKDAYS) {
    for (const field of FIELD_ORDER) {
      const a = from.overrides[weekday]?.[field] ?? null
      const b = to.overrides[weekday]?.[field] ?? null
      if (a !== b) out.push({ field, weekday, from: a, to: b })
    }
  }
  return out
}

/** The per-weekday overrides as rows ("Calories, Saturdays: 1,600 kcal"). */
export function overrideRows(targets: PlanTargets): { key: string; label: string; value: string }[] {
  return WEEKDAYS.flatMap((weekday) =>
    FIELD_ORDER.flatMap((field) => {
      const v = targets.overrides[weekday]?.[field]
      return v === undefined ? [] : [{ key: `${weekday}:${field}`, label: `${FIELD[field].label}, ${WEEKDAY_LABEL[weekday]}`, value: amount(field, v) }]
    }),
  )
}

export const DEFAULT_ROWS = FIELD_ORDER

/** "0.9 kg a week (0.7–1.1) · goal 2027-04-16 · expenditure about 2,551 kcal" */
export function forecastText(f: Forecast): string {
  const rate = f.weekly_rate_kg > 0 ? `${formatNumber(f.weekly_rate_kg, 2)} kg a week` : 'no loss at this target'
  const band = f.weekly_rate_kg > 0 ? ` (${formatNumber(Math.min(f.band.low, f.band.high), 2)}–${formatNumber(Math.max(f.band.low, f.band.high), 2)})` : ''
  const finish = f.finish_date ? ` · goal ${f.finish_date}` : ''
  return `${rate}${band}${finish} · expenditure about ${formatNumber(f.tdee_est)} kcal`
}

/** The guards' verdicts in the feed: notes the plan module writes when a change or proposal broke a rail. */
export function isGuardNote(e: AiEvent): e is Extract<AiEvent, { kind: 'note' }> {
  return e.kind === 'note' && /^(Plan change rejected|Proposal dropped)/.test(e.summary)
}

export interface GuardLine {
  key: string
  label: string
  ok: boolean
  /** The rail it breaks, or how it will be stepped. */
  detail: string
}

/**
 * Each change of a pending proposal re-checked now: applyGuards with today's rails and active targets as the proposer.
 * A kcal move over 150 shows how it would be stepped (the first step now, the rest a week apart).
 */
export function guardLines(changes: readonly PlanChange[], ctx: { actor: Actor; rails: Rails; plan: PlanTargets; autoApplySafe: boolean }): GuardLine[] {
  const batch: TargetChange[] = changes.map((c) => ({ kind: 'target', field: c.field, weekday: c.weekday, from: c.from, to: c.to }))
  const result = applyGuards(batch, {
    actor: ctx.actor,
    rails: ctx.rails,
    plan: ctx.plan,
    exercises: [],
    excluded_categories: [],
    planned_fast_dates: [],
    auto_apply_safe: ctx.autoApplySafe,
  })
  const label = (c: TargetChange) => `${FIELD[c.field].label}${c.weekday ? `, ${WEEKDAY_LABEL[c.weekday]}` : ''}`
  return batch.map((change, i) => {
    const key = `${i}:${change.field}:${change.weekday ?? 'all'}`
    const rejected = result.rejected.find((r) => r.change === change)
    if (rejected) return { key, label: label(change), ok: false, detail: rejected.reason }
    const accepted = result.accepted.find((a) => a.change.field === change.field && a.change.weekday === change.weekday)
    const later = result.scheduled.filter((s) => s.change.field === change.field && s.change.weekday === change.weekday)
    const detail =
      later.length > 0 && accepted
        ? `Within the rails; stepped ≤ 150 kcal at a time: ${amount(change.field, accepted.change.to)} now, then ${later.map((s) => amount(change.field, s.change.to)).join(', ')} a week apart`
        : 'Within the rails'
    return { key, label: label(change), ok: true, detail }
  })
}

/** The rails as one line ("1,400–1,700 kcal · protein ≥ 130 g · fat ≥ 45 g · 2 × 24 h fasts a month"). */
export function railsText(r: Rails): string {
  return `${formatNumber(r.calorie_floor)}–${formatNumber(r.calorie_ceiling)} kcal · protein ≥ ${formatNumber(r.protein_min_g)} g · fat ≥ ${formatNumber(r.fat_min_g)} g · ${r.fasts_per_month} × ${r.fast_hours} h fasts a month`
}
