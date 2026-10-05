// Owns: turning what the sheet reader returned (values as printed, in the sheet's mass unit) into the kg draft the
// confirm form opens with (SPEC §2: Evolt sheets print lb; kg = lb × 0.4536).
import { lbToKg } from '@fitness/shared/engine'
import { ScanDraft, ScanSegment, type MassUnit, type ScanExtractOutput } from '@fitness/shared/schemas'

/** Whole-body fields the sheet prints as a mass (their `_kg` names keep the seed-record shape). */
export const MASS_FIELDS = [
  'weight_kg',
  'lean_body_mass_kg',
  'skeletal_muscle_mass_kg',
  'protein_kg',
  'mineral_kg',
  'total_body_water_kg',
  'icf_kg',
  'ecf_kg',
  'body_fat_mass_kg',
  'subcutaneous_fat_kg',
  'visceral_fat_kg',
] as const

/** kg = lb × 0.4536 when the sheet printed lb (kg passes through), to 0.01 kg (finer than the sheet's 0.1 lb). null stays null. */
export function massToKg(value: number | null, units: MassUnit): number | null {
  if (value === null) return null
  const kg = units === 'lb' ? lbToKg(value) : value
  return Math.round(kg * 100) / 100
}

/** The draft stored in `scans.extracted`: every mass field and segment value in kg; everything else as read. */
export function toDraft(out: ScanExtractOutput): ScanDraft {
  const { units, segments, ...rest } = out
  const masses = Object.fromEntries(MASS_FIELDS.map((f) => [f, massToKg(out[f], units)]))
  const segs = Object.fromEntries(
    ScanSegment.options.map((s) => [s, { lean_kg: massToKg(segments[s].lean_kg, units), fat_kg: massToKg(segments[s].fat_kg, units) }]),
  )
  return ScanDraft.parse({ ...rest, ...masses, segments: segs, source_units: units })
}
