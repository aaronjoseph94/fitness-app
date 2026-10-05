// Owns: the muscle-map colour scale (level → token colour), level names, and display names for the 17 muscle keys.
import type { Muscle } from '@fitness/shared/schemas'
import { tokens } from '../../theme'

/** 0 = not trained (body grey); 1–4 = the four indigo steps. */
export type MuscleLevel = 0 | 1 | 2 | 3 | 4

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

export function levelColor(level: MuscleLevel): string {
  return level === 0 ? tokens.muscleMap.body : tokens.muscleMap.steps[level - 1]!
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
