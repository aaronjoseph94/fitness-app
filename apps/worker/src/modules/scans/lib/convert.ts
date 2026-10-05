// Owns: turning what the sheet reader returned (values as printed, in the sheet's mass unit) into the kg draft the
// confirm form opens with (SPEC §2: Evolt sheets print lb; kg = lb × 0.4536), and the printed wall-clock time into an
// instant on Edmonton clocks (the reader never applies an offset: the zone's rules change, e.g. UTC−6 all year from
// 2026-11-01, and the runtime's tz data knows them).
import { lbToKg, localDate, localTime } from '@fitness/shared/engine'
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

/**
 * The instant of an Edmonton wall-clock time the reader returned as printed with a "Z" suffix (2026-11-20T07:15:00Z →
 * 2026-11-20 07:15 local): the offset (−06:00, else −07:00) whose Edmonton date and time read back as printed.
 */
export function printedToInstant(printed: string): string {
  const date = printed.slice(0, 10)
  const time = printed.slice(11, 16)
  const seconds = printed.slice(16, 19) || ':00'
  for (const offset of ['-06:00', '-07:00']) {
    const iso = new Date(`${date}T${time}${seconds}${offset}`).toISOString()
    if (localDate(iso) === date && localTime(iso) === time) return iso
  }
  return new Date(`${date}T${time}${seconds}-07:00`).toISOString()
}

/** The draft stored in `scans.extracted`: every mass field and segment value in kg; scanned_at on Edmonton clocks. */
export function toDraft(out: ScanExtractOutput): ScanDraft {
  const { units, segments, ...rest } = out
  if (rest.scanned_at) rest.scanned_at = printedToInstant(rest.scanned_at)
  const masses = Object.fromEntries(MASS_FIELDS.map((f) => [f, massToKg(out[f], units)]))
  const segs = Object.fromEntries(
    ScanSegment.options.map((s) => [s, { lean_kg: massToKg(segments[s].lean_kg, units), fat_kg: massToKg(segments[s].fat_kg, units) }]),
  )
  return ScanDraft.parse({ ...rest, ...masses, segments: segs, source_units: units })
}
