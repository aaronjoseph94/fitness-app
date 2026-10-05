// Owns: the exercise library as the app sees it — the allowed exercise set (GLOSSARY), list/get/create of exercises,
// the equipment profile (library values and named machines) and exclusions (hide forever, with a reason).
//
// Allowed exercise set — an exercise is excluded, with the first reason that applies:
//   1. an exclusion row for the exercise id
//   2. an exclusion row whose category matches the exercise's category or equipment (case-insensitive)
//   3. the rail: equipment 'body only' (SPEC §2: machines and free weights only)
//   4. its equipment's status is dont_have, cant_use or dislike
//   5. a named machine with such a status whose name is in the exercise's name ("smith machine" → "Smith Machine
//      Bench Press"), since free-exercise-db files those under the generic 'machine'
// Equipment absent from the profile counts as available ("unknown" ≈ have).
import {
  LibraryEquipment,
  type EquipmentItem,
  type EquipmentStatus,
  type EquipmentUpdate,
  type ExclusionCreate,
  type Exercise,
  type ExerciseCreate,
  type ExerciseExclusion,
  type ExerciseQuery,
} from '@fitness/shared/schemas'
import { and, asc, eq, inArray, type SQL } from 'drizzle-orm'
import { equipment_profile, exercise_exclusions, exercises, type Row } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { HttpError, notFound } from '../../../lib/http-error'
import { chunk, toExercise, toSlug, unique, videoSearchUrl, type ExerciseRow, type ExerciseTags } from './rows'

/** Equipment the rails exclude whatever the profile says; also passed to the guards as an excluded category. */
export const RAIL_EXCLUDED_EQUIPMENT = ['body only'] as const
const BLOCKING: Partial<Record<EquipmentStatus, string>> = { dont_have: "don't have", cant_use: "can't use", dislike: 'dislike' }
const LIBRARY_VALUES: ReadonlySet<string> = new Set(LibraryEquipment.options)

type ExclusionRow = Row<typeof exercise_exclusions>
type EquipmentRow = Row<typeof equipment_profile>

/** The exclusion rules and equipment statuses, keyed for lookups. */
export interface Rules {
  byExercise: Map<string, string>
  byCategory: Map<string, string>
  equipment: Map<string, EquipmentRow>
  /** Named machines with a blocking status, by lower-case name (rule 5). */
  blockedMachines: { name: string; row: EquipmentRow }[]
  /** Excluded categories for the guards: category exclusions plus the rail. */
  excluded_categories: string[]
}

function toRules(exclusions: readonly ExclusionRow[], equipment: readonly EquipmentRow[]): Rules {
  const byExercise = new Map<string, string>()
  const byCategory = new Map<string, string>()
  for (const x of exclusions) {
    if (x.exercise_id) byExercise.set(x.exercise_id, x.reason)
    else if (x.category) byCategory.set(x.category.toLowerCase(), x.reason)
  }
  return {
    byExercise,
    byCategory,
    equipment: new Map(equipment.map((e) => [e.equipment.toLowerCase(), e])),
    blockedMachines: equipment.filter((e) => e.kind === 'machine' && BLOCKING[e.status]).map((row) => ({ name: row.equipment.toLowerCase(), row })),
    excluded_categories: unique([...byCategory.keys(), ...RAIL_EXCLUDED_EQUIPMENT]),
  }
}

const rulesQueries = (deps: Deps) =>
  [deps.db.select().from(exercise_exclusions), deps.db.select().from(equipment_profile).orderBy(asc(equipment_profile.equipment))] as const

export async function loadRules(deps: Deps): Promise<Rules & { equipmentRows: EquipmentRow[] }> {
  const [x, e] = await deps.db.batch(rulesQueries(deps))
  return { ...toRules(x, e), equipmentRows: e }
}

/** Why `row` is outside the allowed exercise set (rules 1–4 in the file header), or null when it is allowed. */
export function exclusionReason(row: Pick<ExerciseRow, 'id' | 'name' | 'category' | 'equipment'>, rules: Rules): string | null {
  const own = rules.byExercise.get(row.id)
  if (own) return own
  for (const c of [row.category, row.equipment]) {
    const r = c ? rules.byCategory.get(c.toLowerCase()) : undefined
    if (r) return r
  }
  const equipment = (row.equipment ?? 'body only').toLowerCase()
  if ((RAIL_EXCLUDED_EQUIPMENT as readonly string[]).includes(equipment))
    return 'Bodyweight (body only) exercises are excluded: machines and free weights only'
  const status = rules.equipment.get(equipment) ?? rules.blockedMachines.find((m) => row.name.toLowerCase().includes(m.name))?.row
  const blocked = status ? BLOCKING[status.status] : undefined
  if (status && blocked) return `Equipment ${status.equipment}: ${blocked}${status.note ? ` (${status.note})` : ''}`
  return null
}

/** One library entry with its allowed flag (structurally the engine's ExerciseInfo). */
export type LibraryEntry = ExerciseTags & { allowed: boolean; excluded_reason: string | null }

export interface Library {
  exercises: LibraryEntry[]
  byId: Map<string, LibraryEntry>
  excluded_categories: string[]
  equipment: EquipmentItem[]
}

const tagColumns = {
  id: exercises.id,
  slug: exercises.slug,
  name: exercises.name,
  category: exercises.category,
  equipment: exercises.equipment,
  mechanic: exercises.mechanic,
  level: exercises.level,
  primary_muscles: exercises.primary_muscles,
  secondary_muscles: exercises.secondary_muscles,
}

/** The whole library as tags + allowed flags, the excluded categories and the equipment profile (AI, guards). */
export async function loadLibrary(deps: Deps): Promise<Library> {
  const [rows, x, e] = await deps.db.batch([deps.db.select(tagColumns).from(exercises).orderBy(asc(exercises.name)), ...rulesQueries(deps)])
  const rules = toRules(x, e)
  const entries = rows.map((r) => {
    const excluded_reason = exclusionReason(r, rules)
    return { ...r, allowed: excluded_reason === null, excluded_reason }
  })
  return {
    exercises: entries,
    byId: new Map(entries.map((x) => [x.id, x])),
    excluded_categories: rules.excluded_categories,
    equipment: e.map(toEquipmentItem),
  }
}

/** Tags of the given exercises (any allowed state), by id. Unknown ids are absent. */
export async function exerciseTags(deps: Deps, ids: readonly string[]): Promise<Map<string, ExerciseTags>> {
  const out = new Map<string, ExerciseTags>()
  for (const part of chunk(unique(ids), 90)) {
    const rows = await deps.db.select(tagColumns).from(exercises).where(inArray(exercises.id, part))
    for (const r of rows) out.set(r.id, r)
  }
  return out
}

/** 400 unless every id is in the library; returns the tags. */
export async function requireExercises(deps: Deps, ids: readonly string[]): Promise<Map<string, ExerciseTags>> {
  const tags = await exerciseTags(deps, ids)
  const missing = unique(ids).filter((id) => !tags.has(id))
  if (missing.length) throw new HttpError(400, 'unknown_exercise', `Not in the exercise library: ${missing.join(', ')}`)
  return tags
}

// ── List, get, create ──────────────────────────────────────────────────────────────────────────────────────────

/** GET /api/exercises: SQL filters on equipment/category/level, then primary muscle, name words and scope. */
export async function listExercises(deps: Deps, query: ExerciseQuery): Promise<Exercise[]> {
  const where: SQL[] = []
  if (query.equipment) where.push(eq(exercises.equipment, query.equipment))
  if (query.category) where.push(eq(exercises.category, query.category))
  if (query.level) where.push(eq(exercises.level, query.level))
  const [rows, x, e] = await deps.db.batch([
    deps.db
      .select()
      .from(exercises)
      .where(and(...where))
      .orderBy(asc(exercises.name)),
    ...rulesQueries(deps),
  ])
  const rules = toRules(x, e)
  const words = (query.q ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  const all = query.scope === 'all'
  const out: Exercise[] = []
  for (const row of rows) {
    if (query.muscle && !row.primary_muscles.includes(query.muscle)) continue
    if (words.length) {
      const name = row.name.toLowerCase()
      if (!words.every((w) => name.includes(w))) continue
    }
    const reason = exclusionReason(row, rules)
    if (!all && reason !== null) continue
    out.push(toExercise(row, reason))
  }
  return out
}

export async function getExercise(deps: Deps, id: string): Promise<Exercise> {
  const [[row], x, e] = await deps.db.batch([deps.db.select().from(exercises).where(eq(exercises.id, id)), ...rulesQueries(deps)])
  if (!row) throw notFound('Exercise')
  return toExercise(row, exclusionReason(row, toRules(x, e)))
}

/** The spelling an equipment name already has in the profile (case-insensitive), else the library value, else as typed. */
function canonicalEquipment(name: string, profile: readonly EquipmentRow[]): string {
  const lower = name.trim().toLowerCase()
  return profile.find((p) => p.equipment.toLowerCase() === lower)?.equipment ?? (LIBRARY_VALUES.has(lower) ? lower : name.trim())
}

const kindOf = (equipment: string) => (LIBRARY_VALUES.has(equipment.toLowerCase()) ? 'library' : 'machine')

/**
 * POST /api/exercises: one of Aaron's own (a gym machine), custom = true, slug 'custom-<name>-<id prefix>'. A named
 * machine not yet in the equipment profile is added as 'have'. Replaying the same id returns the stored exercise.
 */
export async function createExercise(deps: Deps, input: ExerciseCreate): Promise<Exercise> {
  const { db } = deps
  const profile = await db.select().from(equipment_profile)
  const equipment = canonicalEquipment(input.equipment, profile)
  const now = deps.now().toISOString()
  await db.batch([
    db
      .insert(exercises)
      .values({
        id: input.id,
        slug: `custom-${toSlug(input.name) || 'exercise'}-${input.id.slice(0, 8)}`,
        name: input.name,
        category: input.category,
        equipment,
        mechanic: input.mechanic ?? null,
        force: input.force ?? null,
        level: input.level,
        primary_muscles: input.primary_muscles,
        secondary_muscles: input.secondary_muscles.filter((m) => !input.primary_muscles.includes(m)),
        instructions: input.instructions,
        image_paths: [],
        video_search_url: videoSearchUrl(input.name),
        gif_url: null,
        source: 'user',
        custom: true,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoNothing(),
    db
      .insert(equipment_profile)
      .values({ equipment, kind: kindOf(equipment), status: 'have', note: null, actor: deps.actor, created_at: now, updated_at: now })
      .onConflictDoNothing(),
  ])
  return getExercise(deps, input.id)
}

// ── Equipment profile ──────────────────────────────────────────────────────────────────────────────────────────

function toEquipmentItem(row: EquipmentRow): EquipmentItem {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    equipment: row.equipment,
    status: row.status,
    note: row.note,
    kind: row.kind,
  }
}

/** GET /api/equipment: library values first, then named machines, each A–Z. */
export async function getEquipment(deps: Deps): Promise<EquipmentItem[]> {
  const rows = await deps.db.select().from(equipment_profile).orderBy(asc(equipment_profile.kind), asc(equipment_profile.equipment))
  return rows.map(toEquipmentItem)
}

/** PUT /api/equipment: upsert each status by name (case-insensitive); an omitted note keeps the stored one. */
export async function updateEquipment(deps: Deps, input: EquipmentUpdate): Promise<EquipmentItem[]> {
  const { db } = deps
  const profile = await db.select().from(equipment_profile)
  const now = deps.now().toISOString()
  const statements = input.items.map((item) => {
    const equipment = canonicalEquipment(item.equipment, profile)
    const note = item.note === undefined ? {} : { note: item.note }
    return db
      .insert(equipment_profile)
      .values({ equipment, kind: kindOf(equipment), status: item.status, note: item.note ?? null, actor: deps.actor, created_at: now, updated_at: now })
      .onConflictDoUpdate({ target: equipment_profile.equipment, set: { status: item.status, ...note, actor: deps.actor, updated_at: now } })
  })
  const [first, ...rest] = statements
  if (first) await db.batch([first, ...rest])
  return getEquipment(deps)
}

// ── Exclusions ─────────────────────────────────────────────────────────────────────────────────────────────────

function toExclusion(row: ExclusionRow): ExerciseExclusion {
  return {
    id: row.id,
    created_at: row.created_at,
    updated_at: row.updated_at,
    exercise_id: row.exercise_id,
    category: row.category,
    reason: row.reason,
  }
}

/**
 * POST /api/exclusions: hide one exercise forever, or a whole category. Idempotent: a replay, or an exercise/category
 * that is already excluded, returns the stored exclusion (its first reason is kept).
 */
export async function createExclusion(deps: Deps, input: ExclusionCreate): Promise<ExerciseExclusion> {
  const { db } = deps
  if (input.exercise_id) {
    const [row] = await db.select({ id: exercises.id }).from(exercises).where(eq(exercises.id, input.exercise_id))
    if (!row) throw notFound('Exercise')
  }
  const now = deps.now().toISOString()
  await db
    .insert(exercise_exclusions)
    .values({
      id: input.id,
      exercise_id: input.exercise_id ?? null,
      category: input.category ?? null,
      reason: input.reason,
      actor: deps.actor,
      created_at: now,
      updated_at: now,
    })
    .onConflictDoNothing()
  const match = input.exercise_id ? eq(exercise_exclusions.exercise_id, input.exercise_id) : eq(exercise_exclusions.category, input.category!)
  const [byId] = await db.select().from(exercise_exclusions).where(eq(exercise_exclusions.id, input.id))
  const [row] = byId ? [byId] : await db.select().from(exercise_exclusions).where(match)
  if (!row) throw new HttpError(409, 'exclusion_conflict', 'The exclusion could not be stored')
  return toExclusion(row)
}
