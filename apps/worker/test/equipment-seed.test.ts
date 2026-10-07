// Owns: the guard on Aaron's floor — seed/equipment/anytime-fitness.json against the pinned free-exercise-db library.
// The profile is what a generated workout may pull from, so this test runs the app's own rules over the real files: the
// seed's name patterns / categories / equipment values (scripts/lib/seed-exclusions.ts) plus the equipment statuses
// (training/lib/library.ts). If the inventory is edited, or the library commit bumped, the numbers here move
// deliberately and are updated with it.
import { LibraryEquipment, EQUIPMENT_AREAS } from '@fitness/shared/schemas'
import { exercises as library } from '@fitness/exercises'
import { describe, expect, it } from 'vitest'
import { exclusionReason, toRules } from '../src/modules/training'
import { exclusionReason as seedReason } from '../scripts/lib/seed-exclusions'
import { EquipmentSeed } from '../scripts/lib/seed-equipment'
import seedJson from '../../../seed/equipment/anytime-fitness.json' with { type: 'json' }

const seed = EquipmentSeed.parse(seedJson)
const LIBRARY_VALUES: readonly string[] = LibraryEquipment.options
/** The rules as loadLibrary wires them: nothing hidden per exercise (the seed materialises its patterns), so the
 *  name patterns / categories / equipment values are the seed's own rules and the statuses are the library's. */
const rules = toRules([], seed.equipment)

/** Why this exercise is outside the allowed set, exactly as the app decides it (seed rules first, then the statuses). */
const excludedBecause = (ex: (typeof library)[number]) =>
  seedReason(ex, seed.exclusions) ?? exclusionReason({ id: '', name: ex.name, category: ex.category, equipment: ex.equipment }, rules)

const allowed = library.filter((ex) => excludedBecause(ex) === null)
const byName = (name: string) => library.find((ex) => ex.name === name)!

describe("Aaron's equipment profile", () => {
  it('lists the 47 machines at Anytime Fitness Lacombe, each under its area of the gym', () => {
    const rows = seed.equipment.filter((e) => !LIBRARY_VALUES.includes(e.equipment))
    expect(seed.equipment.filter((e) => LIBRARY_VALUES.includes(e.equipment))).toHaveLength(12)
    expect(rows.filter((r) => !r.area)).toHaveLength(8) // the absences, listed without an area
    const machines = rows.filter((r) => r.area)
    // 47 from his list plus the adjustable bench the racks imply (the only row not on it).
    expect(machines.map((m) => m.equipment)).toContain('adjustable bench')
    expect(machines.filter((m) => m.equipment !== 'adjustable bench')).toHaveLength(47)
    for (const area of machines.map((m) => m.area)) expect(EQUIPMENT_AREAS).toContain(area)
    // The areas and how many machines each holds, in his order.
    const count = (area: string) => machines.filter((m) => m.area === area).length
    expect(EQUIPMENT_AREAS.map((a) => [a, count(a)])).toEqual([
      ['Life Fitness', 11],
      ['Hammer Strength', 20],
      ['Racks & rigs', 5],
      ['Free weights', 4],
      ['Cardio', 8],
    ])
  })

  it('holds every machine he listed, and nothing that is not there without saying so', () => {
    const names = new Set(seed.equipment.map((e) => e.equipment))
    for (const machine of [
      'low row',
      'lat pulldown',
      'dual pulley pulldown',
      'dual pulley row',
      'cable crossover',
      'cable (adjustable pulley station)',
      'multi-station cable tower',
      'assist dip / chin',
      'linear leg press',
      'smith machine',
      'hip abduction / adduction',
      'abdominal crunch',
      'iso-lateral row',
      'iso-lateral shoulder press',
      'iso-lateral horizontal bench press',
      'iso-lateral incline press',
      'v-squat',
      'seated arm curl (preacher)',
      'mts biceps curl',
      'mts triceps extension',
      'mts decline press',
      'mts incline press',
      'chest press',
      'seated leg press',
      'seated leg curl',
      'lying leg curl',
      'leg extension',
      'standing calf raise',
      'hip & glute',
      'pectoral fly / rear deltoid',
      'shoulder press (selectorized)',
      'squat rack / power rack (with platform)',
      'half rack',
      'power rack (functional area)',
      'functional training rig',
      'synergy360',
      'dumbbell rack',
      'fixed ez curl bar rack',
      'fixed straight barbell rack',
      'curved manual treadmill',
      'treadmill',
      'stair climber',
      'upright bike',
      'indoor cycling bike',
      'indoor rower',
      'sparc arc trainer',
      'air bike',
    ])
      expect(names, machine).toContain(machine)
    // Nothing a workout could be built on is quietly listed as present.
    expect(seed.equipment.filter((e) => e.status !== 'have').map((e) => e.equipment)).toEqual([
      'bands',
      'exercise ball',
      'foam roll',
      't-bar row',
      'glute ham raise',
      'reverse hyperextension',
      'back extension',
      'lying machine squat',
      'standing leg curl',
      'chair squat',
      'elliptical',
    ])
    // Every absence explains itself: the reason is what the prompt's "Not at your gym" list and the library show.
    for (const row of seed.equipment.filter((e) => e.status !== 'have')) expect(row.note, row.equipment).toBeTruthy()
    expect(new Set(seed.equipment.map((e) => e.equipment)).size).toBe(seed.equipment.length)
  })

  it('allows exactly the exercises his floor can perform', () => {
    expect(library).toHaveLength(876)
    expect(allowed).toHaveLength(466)
    expect(allowed.filter((e) => e.category === 'strength' || e.category === 'powerlifting')).toHaveLength(421)

    // Machines he has: the Hammer Strength line files under the generic 'machine' in free-exercise-db, so the named
    // machines above are the only thing standing between these and the allowed set.
    for (const name of [
      'Smith Machine Bench Press',
      'Smith Machine Squat',
      'Leverage Iso Row',
      'Leverage Chest Press',
      'Machine Preacher Curls',
      'Ab Crunch Machine',
      'Lying Leg Curls',
      'Thigh Abductor',
      'Standing Calf Raises',
      'Dip Machine',
      'Hack Squat', // the V-Squat performs it
      'Seated Cable Rows', // Life Fitness low row / dual pulley row
      'Narrow Stance Leg Press', // seated leg press
    ])
      expect(excludedBecause(byName(name)), name).toBeNull()

    // What the floor is missing, each with its own reason.
    const why = Object.fromEntries(
      [
        'Lying T-Bar Row',
        'Glute Ham Raise',
        'Reverse Hyperextension',
        'Hyperextensions (Back Extensions)',
        'Lying Machine Squat',
        'Standing Leg Curl',
        'Seated Calf Raise',
        'Elliptical Trainer',
        'Sled Row',
        'Trap Bar Deadlift',
        'Band Pull Apart',
        'Battling Ropes',
        'Bench Press with Chains',
        'Wrist Roller',
        'Donkey Calf Raises',
        'Inverted Row with Straps',
        'Seated Head Harness Neck Resistance',
        'Bodyweight Mid Row',
        'Weighted Pull Ups', // bodyweight, and the pattern's own bug: "Pull Ups" was not matched before
      ].map((name) => [name, excludedBecause(byName(name))]),
    )
    for (const [name, reason] of Object.entries(why)) expect(reason, name).toBeTruthy()
    expect(why['Lying T-Bar Row']).toMatch(/t-bar row/)
    expect(why['Elliptical Trainer']).toMatch(/elliptical/)
    expect(why['Band Pull Apart']).toMatch(/bands/)
    expect(why['Bench Press with Chains']).toMatch(/chains/)
    expect(why['Weighted Pull Ups']).toMatch(/Bodyweight hang/)
    // A barbell seated calf raise needs only a bench and a bar, so only the machine version goes.
    expect(excludedBecause(byName('Barbell Seated Calf Raise'))).toBeNull()
    // The one kickback in the library is filed as bodyweight, so the rail takes it whatever the machines offer.
    expect(excludedBecause(byName('Glute Kickback'))).toMatch(/Bodyweight exercise/)
  })
})
