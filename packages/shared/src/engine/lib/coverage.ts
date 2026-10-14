// Owns: body-group coverage — which of the eight body groups a set of muscles reaches, which groups a split day's focus
// must reach, and which required groups are still missing (the training week's "uncovered" list and the AI's check).
import type { Muscle } from '../../schemas/common'
import { BodyGroup, type SplitSlot } from '../../schemas/training'

/** All eight body groups, in order. */
export const BODY_GROUPS: readonly BodyGroup[] = BodyGroup.options

/**
 * The group each muscle counts toward; muscles with no group (abdominals, abductors, adductors, forearms, lower back,
 * neck, traps) are null:
 *   chest ← chest        back ← lats | middle back      shoulders ← shoulders   arms ← biceps | triceps
 *   quads ← quadriceps   hamstrings ← hamstrings        glutes ← glutes         calves ← calves
 */
const GROUP_OF: Record<Muscle, BodyGroup | null> = {
  abdominals: null,
  abductors: null,
  adductors: null,
  biceps: 'arms',
  calves: 'calves',
  chest: 'chest',
  forearms: null,
  glutes: 'glutes',
  hamstrings: 'hamstrings',
  lats: 'back',
  'lower back': null,
  'middle back': 'back',
  neck: null,
  quadriceps: 'quads',
  shoulders: 'shoulders',
  traps: null,
  triceps: 'arms',
}

/** What a split day of this focus must reach: upper = chest, back, shoulders, arms; lower = quads, hamstrings, glutes, calves; full = chest, back, shoulders, quads, hamstrings, glutes. */
export function focusGroups(focus: SplitSlot['focus']): BodyGroup[] {
  if (focus === 'upper') return ['chest', 'back', 'shoulders', 'arms']
  if (focus === 'lower') return ['quads', 'hamstrings', 'glutes', 'calves']
  return ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes']
}

/** The groups the muscles reach: { GROUP_OF[m] : m ∈ muscles } without nulls, unique, in BODY_GROUPS order. */
export function bodyGroupsOf(muscles: readonly Muscle[]): BodyGroup[] {
  const reached = new Set(muscles.map((m) => GROUP_OF[m]))
  return BODY_GROUPS.filter((g) => reached.has(g))
}

/** The required groups no muscle reaches: required ∖ bodyGroupsOf(muscles), in the order required lists them. */
export function missingGroups(required: readonly BodyGroup[], muscles: readonly Muscle[]): BodyGroup[] {
  const reached = new Set(bodyGroupsOf(muscles))
  return required.filter((g) => !reached.has(g))
}
