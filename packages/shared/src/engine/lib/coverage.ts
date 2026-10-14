// Owns: body-group coverage — which of the eight body groups a set of muscles reaches, which groups a split day's focus
// must reach (and, for a full-body day, the groups no other day of its split requires), and which required groups are
// still missing (the training week's "uncovered" list and the AI's check).
import type { Muscle } from '../../schemas/common'
import { BodyGroup, type SplitSlot } from '../../schemas/training'
import { splitNameKey } from './split'

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

/**
 * What one split day must reach, given every day of its split (`slots`, the day itself among them; a day is known by
 * its name, engine splitNameKey):
 *   required(slot) = focusGroups(slot.focus) ∪ (slot.focus = 'full' ? { g ∈ BODY_GROUPS : no other slot's focusGroups ∋ g } : ∅)
 * in BODY_GROUPS order. So a full-body day of an all-full-body week (1 or 2 days) also takes arms and calves, while
 * Full body beside Upper A and Lower A keeps its six.
 */
export function requiredGroups(slot: SplitSlot, slots: readonly SplitSlot[]): BodyGroup[] {
  const own = new Set(focusGroups(slot.focus))
  const others = new Set(slots.filter((s) => splitNameKey(s.name) !== splitNameKey(slot.name)).flatMap((s) => focusGroups(s.focus)))
  return BODY_GROUPS.filter((g) => own.has(g) || (slot.focus === 'full' && !others.has(g)))
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
