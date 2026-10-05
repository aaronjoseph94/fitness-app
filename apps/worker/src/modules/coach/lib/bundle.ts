// Owns: the review bundle (get_review_bundle) — the one compact JSON a coach reads for a period (SPEC §8): profile and
// rails, the active plan with its forecast and recent versions, per-week aggregates (the reviews module's weekly
// metrics, so the numbers match the weekly report), period totals, training per muscle against the block before,
// PRs, fasts, tape, the latest scan with the lean-loss guard, milestones, open proposals, upcoming fasts / scan /
// week plans, the dashboard note, safety flags, equipment limits and templates. Aggregates only, no raw rows.
//   weeks          = every Monday–Sunday week overlapping [from, to] (≤ 8)
//   previous block = the same number of weeks just before (≤ 4), for volume per muscle vs the last block
//   totals         = days_logged-weighted means of the weekly values (water, steps, sleep: weighted by days in week)
import {
  addDays,
  daysBetween,
  fastDay,
  isoWeek,
  KCAL_STEP,
  localDate,
  SESSION_SETS,
  today,
  weekStart,
} from '@fitness/shared/engine'
import type { MuscleScores, Nutrients, Scan, ScanChange, WeeklyMetrics } from '@fitness/shared/schemas'
import { and, desc, eq, gte, inArray } from 'drizzle-orm'
import { ai_events, week_plans } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { badRequest } from '../../../lib/http-error'
import { getTrend } from '../../body'
import { listFasts } from '../../fasting'
import { activeNote } from '../../notes'
import { ensureTargetsThrough, getActivePlan, listVersions } from '../../plan'
import { buildWeeklyMetrics } from '../../reviews'
import { listScans } from '../../scans'
import { getSettings } from '../../settings'
import { getEquipment, listTemplates } from '../../training'
import { nextScan } from './scan-date'
import type { BundleQuery, ReviewBundle, ScanDelta } from './schemas'
import { reviewWeekStart } from './time'

const MAX_DAYS = 56
const MAX_PREVIOUS_WEEKS = 4
const RECENT_VERSIONS = 5
const MAX_PRS = 20
const MAX_PROPOSALS = 15
/** SPEC §3: body fat at or under 18 % at goal. */
const GOAL_BODY_FAT_PCT = 18

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Σ a·w / Σ w over entries with a value and a positive weight; null when none. */
function weighted(entries: readonly { value: number | null; weight: number }[], dp: number): number | null {
  const xs = entries.filter((e): e is { value: number; weight: number } => e.value !== null && e.weight > 0)
  const w = xs.reduce((s, e) => s + e.weight, 0)
  return w === 0 ? null : round(xs.reduce((s, e) => s + e.value * e.weight, 0) / w, dp)
}

function sumScores(maps: readonly MuscleScores[], dp: number): MuscleScores {
  const out: Record<string, number> = {}
  for (const m of maps) for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + (v ?? 0)
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round(v, dp)])) as MuscleScores
}

function trainingBlock(weeks: readonly WeeklyMetrics[]) {
  return {
    weeks: weeks.length,
    sessions_done: weeks.reduce((n, w) => n + w.sessions_done, 0),
    sessions_planned: weeks.reduce((n, w) => n + w.sessions_planned, 0),
    volume_kg: round(
      weeks.reduce((n, w) => n + w.volume_kg, 0),
      0,
    ),
    muscle_scores: sumScores(
      weeks.map((w) => w.muscle_scores),
      1,
    ),
    volume_by_muscle: sumScores(
      weeks.map((w) => w.volume_by_muscle),
      0,
    ),
  }
}

function scanDelta(c: ScanChange | null): ScanDelta | null {
  if (!c) return null
  const r2 = (x: number) => round(x, 2)
  return {
    vs_date: c.date,
    days: c.days,
    weight_kg: r2(c.fat_vs_lean.weight_kg),
    fat_kg: r2(c.fat_vs_lean.fat_kg),
    lean_kg: r2(c.fat_vs_lean.lean_kg),
    water_kg: r2(c.fat_vs_lean.water_kg),
    lean_share_of_loss: c.lean_share_of_loss === null ? null : round(c.lean_share_of_loss, 3),
    lean_loss: c.lean_loss,
    body_fat_pct: c.deltas.body_fat_pct === undefined ? null : round(c.deltas.body_fat_pct, 1),
    visceral_fat_level: c.deltas.visceral_fat_level ?? null,
    segment_fat_kg: Object.fromEntries(Object.entries(c.segments).map(([k, v]) => [k, r2(v.fat_kg)])),
  }
}

function latestScan(scans: readonly Scan[]): ReviewBundle['scan'] {
  const s = scans.find((x) => x.confirmed && x.record)
  if (!s?.record) return null
  const r = s.record
  return {
    latest: {
      id: s.id,
      date: s.date,
      weight_kg: r.weight_kg,
      body_fat_pct: r.body_fat_pct,
      body_fat_mass_kg: r.body_fat_mass_kg,
      lean_body_mass_kg: r.lean_body_mass_kg,
      skeletal_muscle_mass_kg: r.skeletal_muscle_mass_kg,
      visceral_fat_level: r.visceral_fat_level,
      waist_hip_ratio: r.waist_hip_ratio,
    },
    vs_previous: scanDelta(s.analysis?.vs_previous ?? null),
    vs_baseline: scanDelta(s.analysis?.vs_baseline ?? null),
    flags: (s.analysis?.flags ?? []).map((f) => ({ code: f.code, message: f.message })),
  }
}

/** Pending proposals, including scheduled later steps (with their due date), newest first. */
async function openProposals(deps: Deps): Promise<ReviewBundle['open_proposals']> {
  const rows = await deps.db
    .select()
    .from(ai_events)
    .where(and(eq(ai_events.kind, 'proposal'), eq(ai_events.proposal_status, 'pending')))
    .orderBy(desc(ai_events.created_at))
    .limit(MAX_PROPOSALS)
  return rows.map((r) => ({
    id: r.id,
    kind: typeof r.body === 'object' && r.body !== null && 'kind' in r.body ? String(r.body.kind) : 'unknown',
    summary: clip(r.summary, 200),
    actor: r.actor,
    created_at: r.created_at,
    due: r.date,
  }))
}

export function bundleRange(deps: Deps, q: BundleQuery): { from: string; to: string } {
  const from = q.from ?? (q.to ? addDays(q.to, -6) : reviewWeekStart(deps.now()))
  const to = q.to ?? addDays(from, 6)
  if (from > to) throw badRequest('`from` must be on or before `to`')
  if (daysBetween(from, to) + 1 > MAX_DAYS)
    throw badRequest(`At most ${MAX_DAYS} days per bundle; use query_metric for longer series`)
  return { from, to }
}

export async function reviewBundle(deps: Deps, q: BundleQuery): Promise<ReviewBundle> {
  const { from, to } = bundleRange(deps, q)
  const date = today(deps.now())
  const weekStarts: string[] = []
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weekStarts.push(w)
  const previousStarts = Array.from({ length: Math.min(weekStarts.length, MAX_PREVIOUS_WEEKS) }, (_, i) =>
    addDays(weekStarts[0]!, -7 * (i + 1)),
  ).reverse()

  // Materialise the target spine once, so the parallel weekly reads below never race to fill it.
  await ensureTargetsThrough(deps, addDays(date, 14))
  const [
    weeks,
    previous,
    sv,
    plan,
    versions,
    trend,
    scans,
    scan,
    proposals,
    fasts,
    plans,
    note,
    equipment,
    templates,
  ] = await Promise.all([
    Promise.all(weekStarts.map((w) => buildWeeklyMetrics(deps, w))),
    Promise.all(previousStarts.map((w) => buildWeeklyMetrics(deps, w))),
    getSettings(deps),
    getActivePlan(deps),
    listVersions(deps),
    getTrend(deps, { from, to }),
    listScans(deps),
    nextScan(deps),
    openProposals(deps),
    listFasts(deps, { from: date }),
    deps.db
      .select({
        id: week_plans.id,
        week_start: week_plans.week_start,
        status: week_plans.status,
        author: week_plans.author,
      })
      .from(week_plans)
      .where(
        and(gte(week_plans.week_start, weekStart(date)), inArray(week_plans.status, ['active', 'proposed'])),
      )
      .orderBy(week_plans.week_start),
    activeNote(deps),
    getEquipment(deps),
    listTemplates(deps),
  ])
  const { profile: p, settings: s } = sv
  const now = deps.now().toISOString()

  const points = trend.points
  const lastRaw = [...points].reverse().find((x) => x.weight_kg !== null)
  const lastTrend = [...points].reverse().find((x) => x.trend_kg !== null)?.trend_kg ?? null
  const firstTrend = points.find((x) => x.trend_kg !== null)?.trend_kg ?? null
  const latestScanRow = latestScan(scans)
  const age = scans.find((x) => x.record)?.record?.age ?? null

  const byLogged = (f: (w: WeeklyMetrics) => number | null, dp: number) =>
    weighted(
      weeks.map((w) => ({ value: f(w), weight: w.days_logged })),
      dp,
    )
  const byDays = (f: (w: WeeklyMetrics) => number | null, dp: number) =>
    weighted(
      weeks.map((w) => ({ value: f(w), weight: 7 })),
      dp,
    )
  const intakeAvg = (k: keyof Nutrients, dp: number) => byLogged((w) => w.intake_avg[k], dp) ?? 0

  const sites = new Map<string, { first: { date: string; cm: number }; last: { date: string; cm: number } }>()
  for (const m of [...trend.measurements].sort((a, b) => a.date.localeCompare(b.date))) {
    const e = sites.get(m.site)
    const point = { date: m.date, cm: m.value_cm }
    sites.set(m.site, { first: e?.first ?? point, last: point })
  }

  const flags = new Map<string, { kind: WeeklyMetrics['flags'][number]['kind']; message: string }>()
  for (const w of weeks) for (const f of w.flags) flags.set(f.kind, f)

  return {
    generated_at: now,
    period: { from, to, weeks: weekStarts.map(isoWeek), previous_weeks: previousStarts.map(isoWeek) },
    profile: {
      sex: p.sex,
      age,
      height_cm: p.height_cm,
      start: { date: p.start_date, weight_kg: p.start_weight_kg },
      goal: { date: p.goal_date, weight_kg: p.goal_weight_kg, body_fat_pct_target: GOAL_BODY_FAT_PCT },
    },
    rails: {
      calorie_floor: s.calorie_floor,
      calorie_ceiling: s.calorie_ceiling,
      protein_min_g: s.protein_min_g,
      fat_min_g: s.fat_min_g,
      fasts_per_month: s.fasts_per_month,
      fast_hours: s.fast_hours,
      kcal_step_max: KCAL_STEP,
      sets_per_session: { min: SESSION_SETS.min, max: SESSION_SETS.max },
    },
    preferences: {
      training_days: s.training_days,
      water_target_ml: s.water_target_ml,
      fibre_target_g: s.fibre_target_g,
      scan_interval_days: s.scan_interval_days,
      auto_apply_safe: s.auto_apply_safe,
    },
    plan: {
      id: plan.id,
      version: plan.version,
      created_by: plan.created_by,
      created_at: plan.created_at,
      reason: clip(plan.reason, 200),
      targets: plan.targets,
      forecast: plan.forecast,
      recent_versions: versions.slice(0, RECENT_VERSIONS).map((v) => ({
        version: v.version,
        created_by: v.created_by,
        created_at: v.created_at,
        reason: clip(v.reason, 120),
        diff: v.diff
          .map((d) => `${d.weekday ?? 'daily'} ${d.field} ${d.from ?? '—'}→${d.to ?? '—'}`)
          .join('; '),
      })),
    },
    weight: {
      latest_raw: lastRaw?.weight_kg != null ? { date: lastRaw.date, kg: lastRaw.weight_kg } : null,
      trend_kg: lastTrend,
      change_7d_kg: trend.change_7d_kg === null ? null : round(trend.change_7d_kg, 2),
      period_change_kg: lastTrend !== null && firstTrend !== null ? round(lastTrend - firstTrend, 2) : null,
      to_goal_kg: lastTrend === null ? null : round(lastTrend - p.goal_weight_kg, 1),
    },
    weeks: weeks.map((w) => ({
      week: w.week,
      week_start: w.week_start,
      trend_start_kg: w.trend_start_kg,
      trend_end_kg: w.trend_end_kg,
      trend_change_kg: w.trend_change_kg,
      intake_avg: w.intake_avg,
      target_kcal_avg: w.target_kcal_avg,
      target_protein_g: w.target_protein_g,
      days_logged: w.days_logged,
      protein_adherence: w.protein_adherence,
      water_avg_ml: w.water_avg_ml,
      steps_avg: w.steps_avg,
      sleep_avg_min: w.sleep_avg_min,
      sessions_done: w.sessions_done,
      sessions_planned: w.sessions_planned,
      volume_kg: w.volume_kg,
      logging_adherence: w.logging_adherence,
    })),
    totals: {
      days_logged: weeks.reduce((n, w) => n + w.days_logged, 0),
      intake_avg: {
        kcal: intakeAvg('kcal', 0),
        protein_g: intakeAvg('protein_g', 1),
        carbs_g: intakeAvg('carbs_g', 1),
        fat_g: intakeAvg('fat_g', 1),
        fibre_g: intakeAvg('fibre_g', 1),
      },
      protein_adherence: byLogged((w) => w.protein_adherence, 3) ?? 0,
      water_avg_ml: byDays((w) => (w.water_avg_ml > 0 ? w.water_avg_ml : null), 0) ?? 0,
      steps_avg: byDays((w) => w.steps_avg, 0),
      sleep_avg_min: byDays((w) => w.sleep_avg_min, 0),
      logging_adherence: byDays((w) => w.logging_adherence, 3) ?? 0,
    },
    training: {
      period: trainingBlock(weeks),
      previous: previous.length ? trainingBlock(previous) : null,
      prs: weeks
        .flatMap((w) => w.prs)
        .slice(0, MAX_PRS)
        .map((r) => ({
          exercise: r.exercise_name,
          kind: r.kind,
          reps: r.reps,
          load_kg: r.load_kg,
          e1rm_kg: round(r.e1rm_kg, 1),
          date: r.date,
        })),
    },
    fasts: weeks.flatMap((w) => w.fasts),
    measurements: [...sites.entries()].map(([site, v]) => ({
      site: site as ReviewBundle['measurements'][number]['site'],
      ...v,
    })),
    scan: latestScanRow,
    milestones: trend.milestones.map((m) => ({ label: m.label, reached_on: m.reached_on })),
    open_proposals: proposals,
    upcoming: {
      fasts: fasts
        .filter((f) => f.started_at > now)
        .map((f) => ({ id: f.id, date: localDate(f.started_at), fast_day: fastDay(f, s.fast_hours), starts_at: f.started_at, note: f.note })),
      scan,
      week_plans: plans,
    },
    dashboard_note: note ? { text: note.text, until: note.until, actor: note.actor } : null,
    flags: [...flags.values()],
    equipment_limits: equipment
      .filter((e) => e.status !== 'have')
      .map((e) => ({ equipment: e.equipment, status: e.status, note: e.note })),
    templates: templates.map((t) => ({
      id: t.id,
      name: t.name,
      exercises: t.exercises.length,
      sets: t.exercises.reduce((n, e) => n + e.sets, 0),
      muscle_scores: t.muscle_scores,
    })),
  }
}
