// Owns: the swap list behind the picker's swap mode (sameMuscleCandidates): same primary muscle and same kind of lift,
// closest first, with exercises already in the workout left out. Swap fields match the engine's swap fixture (rows of the
// pinned free-exercise-db); the rest of each row is filler the rule never reads.
import type { ExerciseSummary } from '@fitness/shared/schemas'
import { describe, expect, it } from 'vitest'
import { sameMuscleCandidates } from './filter'

const row = (
  id: string,
  name: string,
  category: ExerciseSummary['category'],
  equipment: string,
  mechanic: ExerciseSummary['mechanic'],
  primary_muscles: ExerciseSummary['primary_muscles'],
  secondary_muscles: ExerciseSummary['secondary_muscles'],
): ExerciseSummary => ({
  id,
  created_at: '2026-10-09T00:00:00.000Z',
  updated_at: '2026-10-09T00:00:00.000Z',
  slug: id,
  name,
  category,
  equipment,
  mechanic,
  force: null,
  level: 'beginner',
  primary_muscles,
  secondary_muscles,
  image_paths: [],
  video_search_url: 'https://www.youtube.com/results?search_query=x',
  gif_url: null,
  source: 'free-exercise-db',
  allowed: true,
})

const legPress = row('Leg_Press', 'Leg Press', 'strength', 'machine', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings'])
const library: ExerciseSummary[] = [
  legPress,
  row('Bicycling_Stationary', 'Bicycling, Stationary', 'cardio', 'machine', null, ['quadriceps'], ['calves', 'glutes', 'hamstrings']),
  row('Jogging_Treadmill', 'Jogging, Treadmill', 'cardio', 'machine', null, ['quadriceps'], ['glutes', 'hamstrings']),
  row('Barbell_Squat', 'Barbell Squat', 'strength', 'barbell', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings', 'lower back']),
  row('Hack_Squat', 'Hack Squat', 'strength', 'machine', 'compound', ['quadriceps'], ['calves', 'glutes', 'hamstrings']),
  row('Leg_Extensions', 'Leg Extensions', 'strength', 'machine', 'isolation', ['quadriceps'], []),
  row('Lying_Leg_Curls', 'Lying Leg Curls', 'strength', 'machine', 'isolation', ['hamstrings'], []),
]

const names = (list: readonly ExerciseSummary[]) => list.map((e) => e.name)

describe('sameMuscleCandidates', () => {
  // The bug: cardio shares the quadriceps tag, so the bike and the treadmill ranked above Barbell Squat.
  it('offers lifts for Leg Press, closest first (Hack Squat 20, Barbell Squat 17, Leg Extensions 13), never a bike or treadmill', () => {
    const result = names(sameMuscleCandidates(library, legPress))
    expect(result).toEqual(['Hack Squat', 'Barbell Squat', 'Leg Extensions'])
    expect(result).not.toContain('Bicycling, Stationary')
  })

  it('leaves out an exercise already in the workout', () => {
    expect(names(sameMuscleCandidates(library, legPress, new Set(['Hack_Squat', 'Leg_Press'])))).toEqual(['Barbell Squat', 'Leg Extensions'])
  })
})
