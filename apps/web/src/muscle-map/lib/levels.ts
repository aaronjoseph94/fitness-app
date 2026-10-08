// Owns: the muscle-map colour scales (level → token colour: the four blue volume steps, or the four rose steps a
// scan's fat share uses), level names, and display names for the 17 muscle keys.
import type { Muscle } from '@fitness/shared/schemas'
import { tokens } from '../../theme'

/** 0 = not trained (the body colour); 1–4 = the four steps of the scale. */
export type MuscleLevel = 0 | 1 | 2 | 3 | 4

/**
 * `volume`: training load in the blue steps (`muscleMap.steps`, lightest → accent). `fat`: a scan segment's fat share
 * in the rose steps (`muscleMap.fatSteps`).
 */
export type MuscleScale = 'volume' | 'fat'

export const LEVEL_LABELS: Readonly<Record<MuscleLevel, string>> = {
  0: 'Not trained',
  1: 'Light',
  2: 'Moderate',
  3: 'Hard',
  4: 'Heavy',
}

export function levelLabel(level: MuscleLevel): string {
  return LEVEL_LABELS[level]
}

export function levelColor(level: MuscleLevel, scale: MuscleScale = 'volume'): string {
  if (level === 0) return tokens.muscleMap.body
  return (scale === 'fat' ? tokens.muscleMap.fatSteps : tokens.muscleMap.steps)[level - 1]!
}

export const MUSCLE_LABELS: Readonly<Record<Muscle, string>> = {
  abdominals: 'Abdominals',
  abductors: 'Abductors',
  adductors: 'Adductors',
  biceps: 'Biceps',
  calves: 'Calves',
  chest: 'Chest',
  forearms: 'Forearms',
  glutes: 'Glutes',
  hamstrings: 'Hamstrings',
  lats: 'Lats',
  'lower back': 'Lower back',
  'middle back': 'Middle back',
  neck: 'Neck',
  quadriceps: 'Quadriceps',
  shoulders: 'Shoulders',
  traps: 'Traps',
  triceps: 'Triceps',
}
