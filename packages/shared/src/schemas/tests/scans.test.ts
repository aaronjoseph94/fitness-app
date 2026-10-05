// Owns: the scan schema seam — the SPEC §2 seed record must parse as a confirmed scan record, and a record whose masses
// cannot be one body (lean or fat above the weight, lean + fat more than 1 kg off the weight) is refused at the field.
import { describe, expect, test } from 'vitest'
import { ScanRecord } from '../index'

/** SPEC §2 "Seed record" (seed/scans/2026-09-26.json), verbatim. */
const seedRecord = {
  scanned_at: '2026-09-26T10:13:00-06:00',
  source: 'evolt360',
  source_units: 'lb',
  height_cm: 165.1,
  age: 31,
  sex: 'male',
  weight_kg: 95.1,
  lean_body_mass_kg: 59.6,
  skeletal_muscle_mass_kg: 32.5,
  protein_kg: 11.3,
  mineral_kg: 5.4,
  total_body_water_kg: 42.9,
  icf_kg: 29.0,
  ecf_kg: 13.9,
  body_fat_mass_kg: 35.5,
  body_fat_pct: 37.3,
  subcutaneous_fat_kg: 28.6,
  visceral_fat_kg: 6.9,
  visceral_fat_area_cm2: 188,
  visceral_fat_level: 16,
  bmr_kcal: 1657,
  tee_kcal: 2551,
  waist_hip_ratio: 1.02,
  bio_age: 38,
  bwi_score: 5.4,
  segments: {
    left_arm: { lean_kg: 3.59, fat_kg: 2.18 },
    right_arm: { lean_kg: 3.49, fat_kg: 2.29 },
    torso: { lean_kg: 27.7, fat_kg: 20.5 },
    left_leg: { lean_kg: 7.54, fat_kg: 5.23 },
    right_leg: { lean_kg: 7.52, fat_kg: 5.35 },
  },
  conditions: { time_of_day: 'morning', fasted: null, hours_since_training: null, notes: 'baseline' },
}

describe('ScanRecord', () => {
  test('the 2026-09-26 seed record parses with its sheet values intact', () => {
    expect(ScanRecord.parse(seedRecord)).toMatchObject({
      weight_kg: 95.1,
      tee_kcal: 2551,
      segments: { torso: { lean_kg: 27.7, fat_kg: 20.5 } },
      conditions: { time_of_day: 'morning', fasted: null, notes: 'baseline' },
    })
  })

  test('scanned_at with an Edmonton offset is stored as the UTC instant', () => {
    expect(ScanRecord.parse(seedRecord).scanned_at).toBe('2026-09-26T16:13:00.000Z')
  })

  test('the seed record adds up: lean 59.6 + fat 35.5 = weight 95.1 kg', () => {
    expect(seedRecord.lean_body_mass_kg + seedRecord.body_fat_mass_kg).toBeCloseTo(seedRecord.weight_kg, 6)
  })

  test('refuses lean mass above the weight (a typo: 120 kg lean on 91.1 kg), on the lean field', () => {
    const result = ScanRecord.safeParse({ ...seedRecord, weight_kg: 91.1, lean_body_mass_kg: 120, body_fat_mass_kg: 33.2 })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('lean_body_mass_kg')
  })

  test('refuses fat mass above the weight, on the fat field', () => {
    const result = ScanRecord.safeParse({ ...seedRecord, body_fat_mass_kg: 135.5 })

    expect(result.success).toBe(false)
    expect(result.error?.issues.map((i) => i.path.join('.'))).toContain('body_fat_mass_kg')
  })

  test('refuses lean + fat more than 1 kg off the weight (59.6 + 35.5 = 95.1 vs 97.1), and accepts 0.04 kg of rounding', () => {
    const off = ScanRecord.safeParse({ ...seedRecord, weight_kg: 97.1 })
    expect(off.success).toBe(false)
    expect(off.error?.issues.map((i) => i.path.join('.'))).toContain('weight_kg')

    // A sheet read in lb converts each value on its own (95.12 = 59.58 + 35.5 + rounding).
    expect(ScanRecord.safeParse({ ...seedRecord, weight_kg: 95.12, lean_body_mass_kg: 59.58 }).success).toBe(true)
  })
})
