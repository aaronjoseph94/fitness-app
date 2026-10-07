// Owns: building apps/worker/drizzle/0007_equipment_inventory.sql — the data migration that brings a database seeded
// before 2026-10-06 onto Aaron's real floor (seed/equipment/anytime-fitness.json: every machine at Anytime Fitness
// Lacombe). The seed itself is INSERT OR IGNORE, so it only ever fills a fresh database; an existing one keeps the old,
// partly speculative list (and keeps `bands`, `t-bar row`, `back extension` and `elliptical` as 'have', which is what
// would silently defeat the strict floor). This migration is that delta, generated from the same files the seed reads.
//
// Run: pnpm --filter @fitness/worker db:equipment (after editing the equipment seed; then commit the .sql).
// Idempotent: INSERT OR IGNORE for rows that are missing, an UPDATE of kind/note/area for every row in the seed (a
// status is set only for the rows the gym does NOT have, so a 'dislike' Aaron set himself survives), a DELETE of the
// names the new inventory replaces, and INSERT OR IGNORE of one exclusion row per excluded exercise (an exercise he
// un-hid is a soft-deleted row, which this leaves alone).
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { exercises as library } from '@fitness/exercises'
import type { equipment_profile, NewRow } from '../src/db'
import { exclusionReason } from './lib/seed-exclusions'
import { readEquipmentSeed } from './lib/seed-equipment'
import { seedId } from './lib/seed-sql'

const ROOT = path.resolve(import.meta.dirname, '..')
const SEED_DIR = path.resolve(ROOT, '..', '..', 'seed')
const OUT = path.join(ROOT, 'drizzle', '0007_equipment_inventory.sql')
const BREAK = '--> statement-breakpoint'

/** Names the 2026-10-06 inventory replaces with the real machines at the club (a renamed machine is not deleted). */
const SUPERSEDED = [
  'leg press',
  'hack squat',
  'squat rack',
  'seated cable row',
  'pec deck',
  'chest press machine',
  'shoulder press machine',
  'hip abductor',
  'hip adductor',
  'seated calf raise',
  'functional trainer',
  'preacher curl bench',
  'assisted pull-up / dip machine',
  'ab crunch machine',
  'back extension bench',
  'glute kickback machine',
  'stationary bike',
  'rowing machine',
]

const seed = readEquipmentSeed(SEED_DIR)

/** A SQL string literal (or NULL) — the seed's notes carry apostrophes. */
const q = (value: string | null | undefined) => (value === null || value === undefined ? 'NULL' : `'${value.replaceAll("'", "''")}'`)

const rows: NewRow<typeof equipment_profile>[] = seed.equipment.map((e) => ({
  id: seedId(`equipment:${e.equipment}`),
  equipment: e.equipment,
  kind: e.kind,
  status: e.status,
  note: e.note,
  area: e.area ?? null,
}))

/** One exclusion row per exercise the seed's rules exclude (the equipment-status rules are evaluated live instead). */
const exclusionRows = library.flatMap((ex) => {
  const reason = exclusionReason(ex, seed.exclusions)
  return reason ? [{ id: seedId(`exclusion:${ex.slug}`), exercise_id: seedId(`exercise:${ex.slug}`), reason }] : []
})

/**
 * The exclusions as inserts that join the library: a migration runs before the seed, so on a database with no
 * exercises yet (the test database, a brand-new local one) the join matches nothing and inserts nothing — the seed
 * writes them there — while on a seeded database it adds exactly the rows that exercise is missing (an un-hide is a
 * soft-deleted row, which the OR IGNORE leaves alone). Plain VALUES rows would fail the foreign key on an empty library.
 */
const exclusionInserts = (() => {
  const out: string[] = []
  // Rows ride in as a VALUES list (its columns are column1, column2, …) — D1's SQLite rejects a UNION of even a
  // handful of SELECTs, and one 50-row statement is what the seed already writes.
  for (let start = 0; start < exclusionRows.length; start += 50) {
    const chunk = exclusionRows.slice(start, start + 50)
    out.push(
      [
        'INSERT OR IGNORE INTO exercise_exclusions (id, exercise_id, reason)',
        'SELECT v.column1, v.column2, v.column3 FROM (VALUES',
        chunk.map((r) => `  (${q(r.id)}, ${q(r.exercise_id)}, ${q(r.reason)})`).join(',\n'),
        ') AS v JOIN exercises e ON e.id = v.column2;',
      ].join('\n'),
    )
  }
  return out
})()

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
const areaRows = seed.equipment.filter((e) => e.area)
const absentRows = seed.equipment.filter((e) => e.status !== 'have')

/**
 * A database that has never been seeded (the test database, a brand-new local one) gets its whole profile from the seed
 * instead: every statement here is guarded on the exercise library being present, the same reason the exclusion
 * inserts join it. Nothing is skipped on Aaron's database, which has been seeded since 2026-09-26.
 */
const SEEDED = 'EXISTS (SELECT 1 FROM exercises)'

const profileInserts = (() => {
  const out: string[] = []
  for (let start = 0; start < rows.length; start += 50) {
    const chunk = rows.slice(start, start + 50)
    out.push(
      [
        'INSERT OR IGNORE INTO equipment_profile (id, equipment, kind, status, note, area)',
        'SELECT v.column1, v.column2, v.column3, v.column4, v.column5, v.column6 FROM (VALUES',
        chunk
          .map((r) => `  (${q(r.id)}, ${q(r.equipment)}, ${q(r.kind)}, ${q(r.status)}, ${q(r.note)}, ${q(r.area as string | null)})`)
          .join(',\n'),
        `) AS v WHERE ${SEEDED};`,
      ].join('\n'),
    )
  }
  return out
})()

const statements = [
  ...profileInserts,
  // Every row in the seed: the note and the part of the gym are the inventory's, the status is his (see the header).
  ...rows.map(
    (r) =>
      `UPDATE \`equipment_profile\` SET \`kind\` = ${q(r.kind)}, \`note\` = ${q(r.note)}, \`area\` = ${q(r.area as string | null)}` +
      `${r.status === 'have' ? '' : `, \`status\` = ${q(r.status)}`}, \`updated_at\` = ${NOW} WHERE \`equipment\` = ${q(r.equipment)} AND ${SEEDED};`,
  ),
  ...(SUPERSEDED.length > 0
    ? [`DELETE FROM \`equipment_profile\` WHERE \`equipment\` IN (${SUPERSEDED.map((n) => q(n)).join(', ')}) AND ${SEEDED};`]
    : []),
  ...exclusionInserts,
]

writeFileSync(
  OUT,
  [
    '-- Owns: the equipment profile and exercise exclusions of a database seeded before 2026-10-06, moved onto the',
    "-- machines at Anytime Fitness Lacombe (seed/equipment/anytime-fitness.json) — 47 machines grouped by area, the",
    '-- library values he does and does not have, and the exercises that follow from it.',
    '-- GENERATED by apps/worker/scripts/build-equipment-inventory.ts (pnpm db:equipment). Do not edit by hand.',
    '',
    statements.join(`\n${BREAK}\n`),
    '',
  ].join('\n'),
)

console.log(
  `equipment inventory → ${path.relative(process.cwd(), OUT)}: ${rows.length} profile rows ` +
    `(${areaRows.length} machines, ${absentRows.length} not his), ${SUPERSEDED.length} superseded names dropped, ` +
    `${exclusionRows.length} exclusions`,
)
