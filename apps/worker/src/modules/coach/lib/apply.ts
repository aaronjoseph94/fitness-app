// Owns: apply_review — a coach's whole weekly review applied as one unit (SPEC §8, §10):
//   1. every target change → ONE plan version through plan.createVersion (guards as deps.actor: floor ≤ kcal ≤ ceiling,
//      protein ≥ min, fat ≥ min, ≤150 kcal now with later steps scheduled as pending proposals a week apart)
//   2. the other changes in order, each through its module's own guarded entry point (templates and swaps: allowed
//      exercise set and 12–28 sets; fasts: the monthly pattern; settings: never a rail) — one that fails is dropped
//      with the rule it broke and the rest still applies
//   3. the review through reviews.recordCoachReview (Claude's narrative replaces the Gemini draft; one 'review' event),
//      or with record_review false (scan debrief, program design, plateau check) the narrative as an ai_events note,
//      whose id is then the review_id revert_review takes — the week's review and its Sunday draft are left alone
//   4. the change log (log.ts) linking the review to the versions before/after and the undo steps revert_review replays
// D1 has no transactions: each step is its module's own batch, so a crash mid-way leaves the earlier steps applied.
import { isoWeek, targetValue, today, weekdayOf } from '@fitness/shared/engine'
import {
  type FieldChange,
  type PlanChange,
  type ReminderPrefs,
  type ReviewProposal,
  type TemplateExerciseInput,
} from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { badRequest, HttpError } from '../../../lib/http-error'
import { cancelFast, listFasts, moveFast, planFast } from '../../fasting'
import { createVersion, getActivePlan } from '../../plan'
import { recordCoachReview } from '../../reviews'
import { addMilestone } from '../../scans'
import { getSettings, updateSettings } from '../../settings'
import { createTemplate, getEquipment, getTemplate, templateSwapped, updateEquipment, updateTemplate } from '../../training'
import { eventInsert } from '../../events'
import { coachLogInsert, type UndoStep } from './log'
import { setDashboardNote } from './note'
import { scheduledScanDate, scheduleScan } from './scan-date'
import type {
  AppliedChange,
  ApplyReviewInput,
  ApplyReviewResult,
  DroppedChange,
  ReviewChange,
} from './schemas'
import { localInstant, reviewWeekStart } from './time'

/** Planned fasts start at dinner by default (24 h dinner to dinner), as the app's plan form does. */
export const DEFAULT_FAST_TIME = '19:00'

type Outcome = { summary: string; changes: FieldChange[]; undo: UndoStep }
type TargetChange = Extract<ReviewChange, { kind: 'target' }>

const label = (c: { field: string; weekday: string | null }) => `${c.weekday ?? 'daily'} ${c.field}`

/** Only Aaron (the app) and the coach (MCP, approved in the chat) apply a review; Ask AI writes proposals instead. */
export function assertCoach(deps: Deps, what: string): void {
  if (deps.actor === 'ai')
    throw new HttpError(
      403,
      'needs_approval',
      `${what} is for the coach through the Claude connector; Ask AI proposes changes with propose_plan_change`,
    )
}

/** Apply one non-target change through its module. Throws HttpError when a guard or check refuses it. */
async function applyOne(deps: Deps, c: Exclude<ReviewChange, TargetChange>): Promise<Outcome> {
  switch (c.kind) {
    case 'template': {
      const exercises: TemplateExerciseInput[] = c.exercises
      const sets = exercises.reduce((n, e) => n + e.sets, 0)
      if (c.template_id) {
        const before = await getTemplate(deps, c.template_id)
        const after = await updateTemplate(deps, c.template_id, {
          name: c.name,
          notes: c.notes ?? before.notes,
          exercises,
        })
        return {
          summary: `template "${after.name}" rewritten (${exercises.length} exercises, ${sets} sets)`,
          changes: [{ path: `templates.${after.id}`, from: before.name, to: after.name }],
          undo: {
            op: 'template_updated',
            label: `template "${before.name}" rewrite`,
            id: before.id,
            before: {
              name: before.name,
              notes: before.notes,
              exercises: before.exercises.map(({ id: _id, ...e }) => e),
            },
          },
        }
      }
      const created = await createTemplate(deps, {
        id: crypto.randomUUID(),
        name: c.name,
        origin: 'ai',
        notes: c.notes,
        exercises,
      })
      return {
        summary: `template "${created.name}" created (${exercises.length} exercises, ${sets} sets)`,
        changes: [{ path: `templates.${created.id}`, from: null, to: created.name }],
        undo: { op: 'template_created', label: `template "${created.name}"`, id: created.id },
      }
    }
    case 'exercise_swap': {
      const before = await getTemplate(deps, c.template_id)
      if (!before.exercises.some((e) => e.exercise_id === c.from_exercise_id))
        throw new HttpError(
          404,
          'not_in_template',
          `Exercise ${c.from_exercise_id} is not in template "${before.name}"`,
        )
      const exercises = before.exercises.map(({ id: _id, ...e }) =>
        e.exercise_id === c.from_exercise_id
          ? { ...e, exercise_id: c.to_exercise_id, target_load_kg: null }
          : e,
      )
      await updateTemplate(deps, c.template_id, { exercises })
      await templateSwapped(deps, { template_id: c.template_id, from_exercise_id: c.from_exercise_id, to_exercise_id: c.to_exercise_id })
      return {
        summary: `swapped an exercise in "${before.name}"`,
        changes: [
          { path: `templates.${before.id}.exercises`, from: c.from_exercise_id, to: c.to_exercise_id },
        ],
        undo: {
          op: 'template_updated',
          label: `swap in "${before.name}"`,
          id: before.id,
          before: {
            name: before.name,
            notes: before.notes,
            exercises: before.exercises.map(({ id: _id, ...e }) => e),
          },
        },
      }
    }
    case 'week_split': {
      const { settings } = await getSettings(deps)
      await updateSettings(deps, { settings: { training_days: c.training_days } })
      return {
        summary: `training days ${c.training_days.join(', ')}`,
        changes: [{ path: 'settings.training_days', from: settings.training_days, to: c.training_days }],
        undo: {
          op: 'settings',
          label: 'training days',
          field: 'training_days',
          before: settings.training_days,
        },
      }
    }
    case 'equipment': {
      const current = new Map((await getEquipment(deps)).map((e) => [e.equipment.toLowerCase(), e]))
      await updateEquipment(deps, { items: c.items })
      const before = c.items.flatMap((i) => {
        const e = current.get(i.equipment.toLowerCase())
        return e ? [{ equipment: e.equipment, status: e.status, note: e.note }] : []
      })
      return {
        summary: `equipment ${c.items.map((i) => `${i.equipment} → ${i.status}`).join(', ')}`,
        changes: c.items.map((i) => ({
          path: `equipment.${i.equipment}`,
          from: current.get(i.equipment.toLowerCase())?.status ?? null,
          to: i.status,
        })),
        undo: {
          op: 'equipment',
          label: 'equipment statuses',
          before,
          added: c.items.filter((i) => !current.has(i.equipment.toLowerCase())).map((i) => i.equipment),
        },
      }
    }
    case 'reminder_time': {
      const { settings } = await getSettings(deps)
      const prev = settings.reminders[c.reminder] ?? { enabled: true, time: null }
      const next = { enabled: c.enabled ?? prev.enabled, time: c.time === undefined ? prev.time : c.time }
      if (next.enabled === prev.enabled && next.time === prev.time)
        throw new HttpError(400, 'no_change', `The ${c.reminder} reminder is already set that way`)
      const reminders: ReminderPrefs = { ...settings.reminders, [c.reminder]: next }
      await updateSettings(deps, { settings: { reminders } })
      return {
        summary: `${c.reminder} reminder ${next.enabled ? `on${next.time ? ` at ${next.time}` : ''}` : 'off'}`,
        changes: [{ path: `settings.reminders.${c.reminder}`, from: prev, to: next }],
        undo: {
          op: 'settings',
          label: `${c.reminder} reminder`,
          field: 'reminders',
          before: settings.reminders,
        },
      }
    }
    case 'milestone': {
      if (c.milestone_kind === 'segment' && !c.segment)
        throw badRequest("A 'segment' milestone needs its segment (e.g. torso)")
      const id = await addMilestone(deps, { kind: c.milestone_kind, segment: c.segment ?? null, target_value: c.target_value, label: c.label })
      return {
        summary: `milestone "${c.label}" added`,
        changes: [{ path: `milestones.${id}`, from: null, to: c.label }],
        undo: { op: 'milestone_added', label: `milestone "${c.label}"`, id },
      }
    }
    case 'fast': {
      const started_at = localInstant(c.date, c.time ?? DEFAULT_FAST_TIME)
      if (c.fast_id) {
        const row = (await listFasts(deps, {})).find((f) => f.id === c.fast_id)
        if (!row) throw new HttpError(404, 'not_found', 'Fast not found')
        const moved = await moveFast(deps, c.fast_id, { started_at, note: c.note })
        return {
          summary: `planned fast moved to ${c.date} ${c.time ?? DEFAULT_FAST_TIME}`,
          changes: [{ path: `fasts.${moved.id}`, from: row.started_at, to: moved.started_at }],
          undo: {
            op: 'fast_moved',
            label: `fast moved to ${c.date}`,
            id: moved.id,
            before_started_at: row.started_at,
            note: row.note,
          },
        }
      }
      const fast = await planFast(deps, { id: crypto.randomUUID(), started_at, note: c.note })
      return {
        summary: `fast planned ${c.date} ${c.time ?? DEFAULT_FAST_TIME}`,
        changes: [{ path: `fasts.${fast.id}`, from: null, to: fast.started_at }],
        undo: { op: 'fast_planned', label: `fast on ${c.date}`, id: fast.id },
      }
    }
    case 'fast_cancel': {
      const row = (await listFasts(deps, {})).find((f) => f.id === c.fast_id)
      if (!row) throw new HttpError(404, 'not_found', 'Fast not found')
      await cancelFast(deps, c.fast_id)
      return {
        summary: `planned fast of ${row.started_at} cancelled`,
        changes: [{ path: `fasts.${row.id}`, from: row.started_at, to: null }],
        undo: {
          op: 'fast_cancelled',
          label: 'cancelled fast',
          id: row.id,
          started_at: row.started_at,
          note: row.note,
        },
      }
    }
    case 'scan_date': {
      const before = await scheduledScanDate(deps)
      await scheduleScan(deps, c.date)
      return {
        summary: `next scan ${c.date}`,
        changes: [{ path: 'scan_date', from: before, to: c.date }],
        undo: { op: 'scan_date', label: `scan date ${c.date}`, before },
      }
    }
    case 'dashboard_note': {
      const note = await setDashboardNote(deps, { text: c.text, until: c.until })
      return {
        summary: 'dashboard note pinned',
        changes: [{ path: 'dashboard_note', from: null, to: note.text }],
        undo: { op: 'note', label: 'dashboard note', id: note.id },
      }
    }
  }
}

function refusal(e: unknown): { rule: string; reason: string } {
  if (e instanceof HttpError) return { rule: e.code, reason: e.message }
  return { rule: 'error', reason: e instanceof Error ? e.message : String(e) }
}

export async function applyReview(deps: Deps, input: ApplyReviewInput): Promise<ApplyReviewResult> {
  assertCoach(deps, 'apply_review')
  const week_start = input.week_start ?? reviewWeekStart(deps.now())
  if (weekdayOf(week_start) !== 'mon')
    throw badRequest(`week_start must be a Monday (${week_start} is a ${weekdayOf(week_start)})`)

  const before = await getActivePlan(deps)
  const reason = (r?: string) => r ?? input.summary
  const applied: AppliedChange[] = []
  const dropped: DroppedChange[] = []
  const changes: FieldChange[] = []
  const undo: UndoStep[] = []
  const proposals: ReviewProposal[] = []

  // 1. Target changes → one plan version.
  const targets = input.changes.flatMap((c, index) => (c.kind === 'target' ? [{ index, c }] : []))
  const asPlan = (c: TargetChange): PlanChange => ({
    field: c.field,
    weekday: c.weekday,
    from: targetValue(before.targets, c.field, c.weekday),
    to: c.to,
    reason: reason(c.reason),
  })
  let version: ApplyReviewResult['plan_version'] = null
  let diff: ApplyReviewResult['diff'] = []
  let scheduled: ApplyReviewResult['scheduled'] = []
  if (targets.length > 0) {
    const result = await createVersion(deps, {
      changes: targets.map((t) => asPlan(t.c)),
      reason: `Coach review ${isoWeek(week_start)}: ${input.summary}`,
      created_by: deps.actor,
    })
    const unmatched = [...targets]
    for (const r of result.rejected) {
      const i = unmatched.findIndex(
        (t) => t.c.field === r.change.field && t.c.weekday === r.change.weekday && t.c.to === r.change.to,
      )
      const [t] = i >= 0 ? unmatched.splice(i, 1) : []
      dropped.push({ index: t?.index ?? targets[0]!.index, kind: 'target', rule: r.rule, reason: r.reason })
      proposals.push({ ...r.change, status: 'rejected', event_id: null, note: r.reason })
    }
    version = result.plan_version
      ? { id: result.plan_version.id, version: result.plan_version.version }
      : null
    diff = result.plan_version?.diff ?? []
    scheduled = result.scheduled.map((s) => ({ change: s.change, due: s.due, proposal_id: s.proposal_id }))
    for (const t of unmatched) {
      const line = diff.find((d) => d.field === t.c.field && d.weekday === t.c.weekday)
      const from = targetValue(before.targets, t.c.field, t.c.weekday)
      const to = line?.to ?? t.c.to
      const later = scheduled.filter((s) => s.change.field === t.c.field && s.change.weekday === t.c.weekday)
      if (!line && later.length) {
        // Nothing moves this week (150 kcal per rolling week): only the scheduled steps, as pending proposals.
        applied.push({
          index: t.index,
          kind: 'target',
          summary: `${label(t.c)} stays ${from} this week; ${later.map((s) => `${s.change.to} due ${s.due}`).join(', ')} as pending proposals`,
        })
        continue
      }
      const steps = later.length
        ? ` (step 1; ${later.map((s) => `${s.change.to} due ${s.due}`).join(', ')} as pending proposals)`
        : ''
      applied.push({ index: t.index, kind: 'target', summary: `${label(t.c)} ${from} → ${to}${steps}` })
      proposals.push({
        field: t.c.field,
        weekday: t.c.weekday,
        from,
        to,
        reason: reason(t.c.reason),
        status: 'auto_applied',
        event_id: null,
        note: null,
      })
    }
    for (const s of scheduled)
      proposals.push({
        ...s.change,
        status: 'pending',
        event_id: s.proposal_id,
        note: `Later step, due ${s.due}`,
      })
    if (version)
      changes.push(
        ...diff.map((d) => ({
          path: d.weekday ? `targets.overrides.${d.weekday}.${d.field}` : `targets.defaults.${d.field}`,
          from: d.from,
          to: d.to,
        })),
      )
  }

  // 2. Everything else, in the order given.
  for (const [index, c] of input.changes.entries()) {
    if (c.kind === 'target') continue
    try {
      const out = await applyOne(deps, c)
      applied.push({ index, kind: c.kind, summary: out.summary })
      changes.push(...out.changes)
      undo.push(out.undo)
    } catch (e) {
      dropped.push({ index, kind: c.kind, ...refusal(e) })
    }
  }
  applied.sort((a, b) => a.index - b.index)
  dropped.sort((a, b) => a.index - b.index)

  // 3. The review (supersedes the Gemini draft) or, off the weekly review, a note; then 4. its change log.
  let review_id: string
  if (input.record_review) {
    const review = await recordCoachReview(deps, {
      week_start,
      narrative: input.narrative,
      highlights: input.highlights,
      concerns: input.concerns,
      proposals,
    })
    review_id = review.id
  } else {
    const note = eventInsert(deps, { kind: 'note', summary: `Coach: ${input.summary}`, body: { text: input.narrative }, date: today(deps.now()) })
    await note.statement
    review_id = note.id
  }
  const plan_version_before = { id: before.id, version: before.version }
  await coachLogInsert(
    deps,
    {
      entity: 'coach_review',
      changes,
      review_id,
      week_start,
      summary: input.summary,
      plan_version_before,
      plan_version: version,
      undo,
      dropped,
    },
    today(deps.now()),
  ).statement

  return {
    review_id,
    week: isoWeek(week_start),
    week_start,
    plan_version: version,
    plan_version_before,
    diff,
    applied,
    dropped,
    scheduled,
  }
}
