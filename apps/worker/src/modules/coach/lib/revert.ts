// Owns: revert_review — undo a coach review in one call. The plan goes back to the version that was active before the
// review (plan.restoreVersion: a new version copying it; versions made after the review are undone too, and counted),
// then the review's other changes are undone newest first from its change log: settings and equipment statuses
// restored, added milestones removed, planned fasts cancelled or moved back, the scan date and dashboard note cleared.
// Templates the review created are kept (sessions may use them). Each step that cannot be undone (a fast that has
// already started) is reported, not fatal. A second revert of the same review returns the first result.
import { today } from '@fitness/shared/engine'
import { TemplateExerciseInput } from '@fitness/shared/schemas'
import * as z from 'zod'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { cancelFast, moveFast, planFast } from '../../fasting'
import { listVersions, restoreVersion } from '../../plan'
import { removeMilestone } from '../../scans'
import { updateSettings } from '../../settings'
import { updateEquipment, updateTemplate } from '../../training'
import { assertCoach } from './apply'
import { findCoachLog, findRevert, recordRevert, type UndoStep } from './log'
import { expireNote } from './note'
import { scheduleScan } from './scan-date'
import type { RevertReviewResult } from './schemas'

type StepResult = { kind: 'undone' | 'kept'; text: string }

async function undoOne(deps: Deps, u: UndoStep): Promise<StepResult> {
  switch (u.op) {
    case 'settings':
      if (u.field === 'training_days') await updateSettings(deps, { settings: { training_days: u.before } })
      else await updateSettings(deps, { settings: { reminders: u.before } })
      return { kind: 'undone', text: `${u.label} restored` }
    case 'equipment':
      if (u.before.length) await updateEquipment(deps, { items: u.before })
      return u.added.length
        ? { kind: 'kept', text: `${u.label} restored; newly added equipment kept: ${u.added.join(', ')}` }
        : { kind: 'undone', text: `${u.label} restored` }
    case 'template_created':
      return { kind: 'kept', text: `${u.label} kept (delete it in the app if unwanted)` }
    case 'template_updated': {
      // Restores the template exactly as it was before the review. It is Aaron's own earlier content (read from the
      // database at apply time, never model output), so it is written as his edit and skips the AI workout guards.
      const exercises = z.array(TemplateExerciseInput).parse(u.before.exercises)
      await updateTemplate({ ...deps, actor: 'user' }, u.id, {
        name: u.before.name,
        notes: u.before.notes,
        exercises,
      })
      return { kind: 'undone', text: `${u.label} restored` }
    }
    case 'milestone_added':
      await removeMilestone(deps, u.id)
      return { kind: 'undone', text: `${u.label} removed` }
    case 'fast_planned':
      await cancelFast(deps, u.id)
      return { kind: 'undone', text: `${u.label} cancelled` }
    case 'fast_moved':
      await moveFast(deps, u.id, { started_at: u.before_started_at, note: u.note ?? undefined })
      return { kind: 'undone', text: `${u.label} moved back` }
    case 'fast_cancelled':
      await planFast(deps, { id: u.id, started_at: u.started_at, note: u.note ?? undefined })
      return { kind: 'undone', text: `${u.label} planned again` }
    case 'scan_date':
      await scheduleScan(deps, u.before && u.before >= today(deps.now()) ? u.before : null)
      return { kind: 'undone', text: `${u.label} cleared${u.before ? ` (back to ${u.before})` : ''}` }
    case 'note':
      await expireNote(deps, u.id)
      return { kind: 'undone', text: `${u.label} removed` }
  }
}

export async function revertReview(deps: Deps, review_id: string): Promise<RevertReviewResult> {
  assertCoach(deps, 'revert_review')
  const log = await findCoachLog(deps, review_id)
  if (!log)
    throw notFound(`Coach review ${review_id} (only reviews applied through apply_review can be reverted)`)
  const prior = await findRevert(deps, review_id)
  if (prior) return { ...prior, already_reverted: true }

  let plan_version: RevertReviewResult['plan_version'] = null
  let later_versions_undone = 0
  if (log.plan_version) {
    const reviewVersion = log.plan_version.version
    later_versions_undone = (await listVersions(deps)).filter((v) => v.version > reviewVersion).length
    const restored = await restoreVersion(deps, log.plan_version_before.id)
    plan_version = { id: restored.id, version: restored.version }
  }

  const undone: string[] = []
  const kept: string[] = []
  const failed: string[] = []
  for (const step of [...log.undo].reverse()) {
    try {
      const r = await undoOne(deps, step)
      ;(r.kind === 'undone' ? undone : kept).push(r.text)
    } catch (e) {
      failed.push(`${step.label}: ${e instanceof HttpError || e instanceof Error ? e.message : String(e)}`)
    }
  }
  const result: RevertReviewResult = {
    review_id,
    already_reverted: false,
    plan_version,
    later_versions_undone,
    undone,
    kept,
    failed,
  }
  await recordRevert(deps, review_id, result, today(deps.now()))
  return result
}
