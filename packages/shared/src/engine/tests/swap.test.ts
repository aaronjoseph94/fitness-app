// Owns: seam test for swap candidates (same primary muscle, same kind of lift, ranked by the swap score).
// Fixture rows are copied field for field from the pinned free-exercise-db (packages/exercises/data/free-exercise-db.json;
// id = its source id). The shared package cannot import @fitness/exercises (that package depends on this one).
import { describe, expect, test } from 'vitest'
import { sameLiftKind, swapCandidates, swapScore, type SwapInfo } from '../index'

const row = (
  id: string,
  name: string,
  category: string,
  equipment: string,
  mechanic: string | null,
  primary_muscles: SwapInfo['primary_muscles'],
  secondary_muscles: SwapInfo['secondary_muscles'],
): SwapInfo => ({ id, name, category, equipment, mechanic, primary_muscles, secondary_muscles, allowed: true })

const legPress = row('Leg_Press', 'Leg Press', 'strength', 'machine', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings'])
const barbellSquat = row('Barbell_Squat', 'Barbell Squat', 'strength', 'barbell', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings', 'lower back'])
const bike = row('Bicycling_Stationary', 'Bicycling, Stationary', 'cardio', 'machine', null, ['quadriceps'], ['calves', 'glutes', 'hamstrings'])
const boxSquat = row('Box_Squat', 'Box Squat', 'powerlifting', 'barbell', 'compound', ['quadriceps'], ['adductors', 'calves', 'glutes', 'hamstrings', 'lower back'])
const hangClean = row('Hang_Clean', 'Hang Clean', 'olympic weightlifting', 'barbell', 'compound', ['quadriceps'], ['calves', 'forearms', 'glutes', 'hamstrings', 'lower back', 'shoulders', 'traps'])

const library: SwapInfo[] = [
  legPress,
  barbellSquat,
  bike,
  hangClean,
  row('Hack_Squat', 'Hack Squat', 'strength', 'machine', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings']),
  row('Leg_Extensions', 'Leg Extensions', 'strength', 'machine', 'isolation', ['quadriceps'], []),
  row('Lying_Leg_Curls', 'Lying Leg Curls', 'strength', 'machine', 'isolation', ['hamstrings'], []),
  row('Jogging_Treadmill', 'Jogging, Treadmill', 'cardio', 'machine', null, ['quadriceps'], ['glutes', 'hamstrings']),
  // Would score 20 for Leg Press (machine, compound, same secondaries), but it is outside the allowed set here.
  { ...row('Smith_Machine_Squat', 'Smith Machine Squat', 'strength', 'machine', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings', 'lower back']), allowed: false },
]

const names = (list: readonly SwapInfo[]) => list.map((e) => e.name)

describe('swap candidates', () => {
  test('Leg Press → Hack Squat 20, Barbell Squat 17, Leg Extensions 13; no bike, treadmill, clean, leg curl or disallowed machine', () => {
    const result = swapCandidates(legPress, library)
    // Hack Squat:     10×1 + 4 (compound) + 3 (machine) + 3 (calves, glutes, hamstrings) = 20
    // Barbell Squat:  10×1 + 4 (compound) + 0 (barbell) + 3 (calves, glutes, hamstrings) = 17
    // Leg Extensions: 10×1 + 0 (isolation) + 3 (machine) + 0                               = 13
    expect(names(result)).toEqual(['Hack Squat', 'Barbell Squat', 'Leg Extensions'])
    expect(result.map((e) => swapScore(legPress, e))).toEqual([20, 17, 13])
    // Already in the workout → left out.
    expect(names(swapCandidates(legPress, library, new Set(['Hack_Squat'])))).toEqual(['Barbell Squat', 'Leg Extensions'])
  })

  test('powerlifting swaps with strength (Box Squat → Barbell Squat 21 first); cardio and Olympic lifts only within their own kind', () => {
    // Barbell Squat: 10 + 4 (compound) + 3 (barbell) + 4 (calves, glutes, hamstrings, lower back) = 21
    // Hack Squat, Leg Press: 10 + 4 + 0 + 3 = 17, then by name; Leg Extensions: 10
    expect(names(swapCandidates(boxSquat, [...library, boxSquat]))).toEqual(['Barbell Squat', 'Hack Squat', 'Leg Press', 'Leg Extensions'])
    expect(names(swapCandidates(bike, library))).toEqual(['Jogging, Treadmill'])
    expect(swapCandidates(hangClean, library)).toEqual([])
  })

  test('a user exercise with no category counts as a lift', () => {
    const custom: SwapInfo = { id: 'u1', name: 'Pendulum Squat (club)', category: null, equipment: null, mechanic: null, primary_muscles: ['quadriceps'], secondary_muscles: [] }
    // 10×1 + 0 + 0 + 0 = 10: after Leg Extensions (13).
    expect(names(swapCandidates(legPress, [...library, custom]))).toEqual(['Hack Squat', 'Barbell Squat', 'Leg Extensions', 'Pendulum Squat (club)'])
  })

  test('same kind of lift: Box Squat (powerlifting) with Leg Press (strength) yes; Bicycling, Stationary (cardio) no', () => {
    expect(sameLiftKind(boxSquat, legPress)).toBe(true)
    expect(sameLiftKind(bike, legPress)).toBe(false)
    expect(sameLiftKind(hangClean, hangClean)).toBe(true)
  })
})
