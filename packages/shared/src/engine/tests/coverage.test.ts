// Owns: seam test for body-group coverage — which of the eight body groups a set of muscles reaches, what a split
// day's focus must reach, and which required groups are still missing.
import { describe, expect, test } from 'vitest'
import { BODY_GROUPS, bodyGroupsOf, focusGroups, missingGroups } from '../index'

describe('body-group coverage', () => {
  test('an upper day with chest, lats and shoulders is missing arms', () => {
    expect(missingGroups(focusGroups('upper'), ['chest', 'lats', 'shoulders'])).toEqual(['arms'])
  })

  test('a week that trains everything but the calves is missing calves', () => {
    expect(
      missingGroups(BODY_GROUPS, ['chest', 'middle back', 'shoulders', 'triceps', 'quadriceps', 'hamstrings', 'glutes']),
    ).toEqual(['calves'])
  })

  test('traps and forearms belong to no group', () => {
    expect(bodyGroupsOf(['traps', 'forearms'])).toEqual([])
  })

  test('groups come back unique and in group order; each focus lists its groups', () => {
    expect(bodyGroupsOf(['triceps', 'biceps', 'quadriceps', 'lats', 'middle back'])).toEqual(['back', 'arms', 'quads'])
    expect(focusGroups('lower')).toEqual(['quads', 'hamstrings', 'glutes', 'calves'])
    expect(focusGroups('full')).toEqual(['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'])
    expect(BODY_GROUPS).toEqual(['chest', 'back', 'shoulders', 'arms', 'quads', 'hamstrings', 'glutes', 'calves'])
  })
})
