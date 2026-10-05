// Owns: the coach review's change log — one ai_events 'change' (entity 'coach_review') written by apply_review beside
// the reviews module's 'review' event. It links the review to the plan version before and after it, lists each applied
// change as a FieldChange (what the app shows), and carries the undo steps revert_review replays in reverse. A revert
// writes its own 'change' (entity 'coach_review_revert') so a second revert is a no-op until the review is applied again.
import { EquipmentStatus, FieldChange, Id, LocalDate, ReminderPrefs, Weekday } from '@fitness/shared/schemas'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import * as z from 'zod'
import { ai_events } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { eventInsert } from '../../events'
import { DroppedChange, RevertReviewResult } from './schemas'

const VersionRef = z.object({ id: Id, version: z.number().int().positive() })
const Before = z.object({
  equipment: z.string(),
  status: EquipmentStatus,
  note: z.string().nullable(),
})

/** Restoring a settings field: each field's `before` parsed with its own schema. */
const SettingsUndo = z.discriminatedUnion('field', [
  z.object({ op: z.literal('settings'), label: z.string(), field: z.literal('training_days'), before: z.array(Weekday) }),
  z.object({ op: z.literal('settings'), label: z.string(), field: z.literal('reminders'), before: ReminderPrefs }),
])

/** One step that undoes one applied change; `label` says what the change was, for the revert report. */
export const UndoStep = z.discriminatedUnion('op', [
  SettingsUndo,
  z.object({
    op: z.literal('equipment'),
    label: z.string(),
    before: z.array(Before),
    added: z.array(z.string()),
  }),
  z.object({ op: z.literal('template_created'), label: z.string(), id: Id }),
  z.object({
    op: z.literal('template_updated'),
    label: z.string(),
    id: Id,
    before: z.object({ name: z.string(), notes: z.string().nullable(), exercises: z.array(z.json()) }),
  }),
  z.object({ op: z.literal('milestone_added'), label: z.string(), id: Id }),
  z.object({ op: z.literal('fast_planned'), label: z.string(), id: Id }),
  z.object({
    op: z.literal('fast_moved'),
    label: z.string(),
    id: Id,
    before_started_at: z.string(),
    note: z.string().nullable(),
  }),
  z.object({
    op: z.literal('fast_cancelled'),
    label: z.string(),
    id: Id,
    started_at: z.string(),
    note: z.string().nullable(),
  }),
  z.object({ op: z.literal('scan_date'), label: z.string(), before: LocalDate.nullable() }),
  z.object({ op: z.literal('note'), label: z.string(), id: Id }),
])
export type UndoStep = z.infer<typeof UndoStep>

export const CoachLogBody = z.object({
  entity: z.literal('coach_review'),
  changes: z.array(FieldChange),
  review_id: Id,
  week_start: LocalDate,
  summary: z.string(),
  plan_version_before: VersionRef,
  plan_version: VersionRef.nullable(),
  undo: z.array(UndoStep),
  dropped: z.array(DroppedChange),
})
export type CoachLogBody = z.infer<typeof CoachLogBody>

const RevertLogBody = z.object({
  entity: z.literal('coach_review_revert'),
  changes: z.array(FieldChange),
  review_id: Id,
  result: RevertReviewResult,
})

/** Insert of the review's change log, for the caller's write. */
export function coachLogInsert(deps: Deps, body: CoachLogBody, date: string) {
  return eventInsert(deps, {
    kind: 'change',
    summary: `Coach review ${body.week_start}: ${body.summary}`,
    body,
    date,
    plan_version_id: body.plan_version?.id ?? null,
  })
}

async function latestBody(deps: Deps, entities: readonly string[], review_id: string): Promise<unknown> {
  const [row] = await deps.db
    .select({ body: ai_events.body })
    .from(ai_events)
    .where(
      and(
        eq(ai_events.kind, 'change'),
        inArray(sql`json_extract(${ai_events.body}, '$.entity')`, [...entities]),
        sql`json_extract(${ai_events.body}, '$.review_id') = ${review_id}`,
      ),
    )
    .orderBy(desc(ai_events.created_at), sql`rowid desc`)
    .limit(1)
  return row?.body
}

/** The newest change log of a review (a review re-applied for the same week has several; the newest wins). */
export async function findCoachLog(deps: Deps, review_id: string): Promise<CoachLogBody | null> {
  const parsed = CoachLogBody.safeParse(await latestBody(deps, ['coach_review'], review_id))
  return parsed.success ? parsed.data : null
}

/**
 * The revert of the review's newest apply, or null. A revert counts only when it is newer than the newest change log:
 * a review re-applied for the same week (same review_id) after a revert can be reverted again.
 */
export async function findRevert(
  deps: Deps,
  review_id: string,
): Promise<z.infer<typeof RevertReviewResult> | null> {
  const parsed = RevertLogBody.safeParse(await latestBody(deps, ['coach_review', 'coach_review_revert'], review_id))
  return parsed.success ? parsed.data.result : null
}

export async function recordRevert(
  deps: Deps,
  review_id: string,
  result: z.infer<typeof RevertReviewResult>,
  date: string,
): Promise<void> {
  const changes: FieldChange[] = result.undone.map((u) => ({
    path: 'coach_review.undone',
    from: u,
    to: null,
  }))
  if (result.plan_version)
    changes.unshift({ path: 'plan_versions.active', from: null, to: result.plan_version.version })
  await eventInsert(deps, {
    kind: 'change',
    summary: `Coach review reverted${result.plan_version ? ` (plan v${result.plan_version.version})` : ''}`,
    body: { entity: 'coach_review_revert', changes, review_id, result } satisfies z.infer<
      typeof RevertLogBody
    >,
    date,
    plan_version_id: result.plan_version?.id ?? null,
  }).statement
}
