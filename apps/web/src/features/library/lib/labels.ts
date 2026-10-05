// Owns: display words for the library's enums — equipment, categories, levels, equipment statuses — in sentence case.
import type { EquipmentStatus, ExerciseCategory } from '@fitness/shared/schemas'
import { LibraryEquipment } from '@fitness/shared/schemas'

/** "e-z curl bar" → "E-z curl bar". Named machines are free text and keep Aaron's wording, capitalised. */
export function sentence(text: string): string {
  return text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1)
}

export const LIBRARY_EQUIPMENT: readonly string[] = LibraryEquipment.options

export function isLibraryEquipment(name: string): boolean {
  return LIBRARY_EQUIPMENT.includes(name)
}

export function equipmentLabel(name: string | null): string {
  if (name === null) return 'No equipment'
  if (name === 'kettlebells') return 'Kettlebell'
  if (name === 'e-z curl bar') return 'EZ curl bar'
  return sentence(name)
}

export function categoryLabel(category: ExerciseCategory): string {
  return sentence(category)
}

export const LEVELS = ['beginner', 'intermediate', 'expert'] as const

export const STATUS_LABEL: Readonly<Record<EquipmentStatus, string>> = {
  have: 'Have',
  dont_have: "Don't have",
  dislike: 'Dislike',
  cant_use: "Can't use",
}

/** Named machines the equipment screen offers as one-tap suggestions. */
export const MACHINE_SUGGESTIONS = [
  'leg press',
  'hack squat',
  'pec deck',
  'lat pulldown',
  'seated cable row',
  'chest press machine',
  'shoulder press machine',
  'leg extension',
  'seated leg curl',
  'lying leg curl',
  'hip abductor',
  'hip adductor',
  'smith machine',
  'standing calf raise',
  'seated calf raise',
  'cable crossover',
  'assisted pull-up machine',
  'glute kickback machine',
  'preacher curl bench',
  't-bar row',
] as const
