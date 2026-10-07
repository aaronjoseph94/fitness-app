// Owns: the shape and reading of seed/equipment/anytime-fitness.json — Aaron's floor (every machine at his club, with
// the part of the gym it is in) plus the default exercise exclusions. Shared by build-seed.ts (which materialises the
// rows into seed.generated.sql) and build-equipment-inventory.ts (which generates the migration that brings an
// existing database onto the same profile), so both read the file under one schema.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import * as z from 'zod'
import { equipment_profile } from '../../src/db'

export const EquipmentSeed = z.object({
  /** e.g. "Anytime Fitness — Lacombe". */
  gym: z.string().min(1).optional(),
  equipment: z.array(
    z.object({
      equipment: z.string().min(1),
      kind: z.enum(equipment_profile.kind.enumValues),
      status: z.enum(equipment_profile.status.enumValues),
      note: z.string().nullable(),
      /** Which part of the gym it is (Life Fitness, Hammer Strength, …); absent on an absence. */
      area: z.string().min(1).max(40).nullable().optional(),
    }),
  ),
  exclusions: z.object({
    name_patterns: z.array(z.object({ pattern: z.string(), reason: z.string(), except_equipment: z.array(z.string()) })),
    categories: z.array(z.object({ category: z.string(), reason: z.string() })),
    equipment: z.array(z.object({ equipment: z.string(), reason: z.string() })),
  }),
})
export type EquipmentSeed = z.infer<typeof EquipmentSeed>
export type EquipmentSeedRow = EquipmentSeed['equipment'][number]

/** The one equipment file today (his club); a second gym would be a sibling file and a second seed. */
export const EQUIPMENT_SEED_FILE = 'equipment/anytime-fitness.json'

export function readEquipmentSeed(seedDir: string, file = EQUIPMENT_SEED_FILE): EquipmentSeed {
  return EquipmentSeed.parse(JSON.parse(readFileSync(path.join(seedDir, file), 'utf8')) as unknown)
}
