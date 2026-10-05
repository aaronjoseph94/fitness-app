// Owns: parsing and normalising free-exercise-db records (data/free-exercise-db.json) into the library shape the seed and app use.
import * as z from 'zod'
import { ExerciseCategory, Force, LibraryEquipment, Level, Mechanic, Muscle } from '@fitness/shared/schemas'
import raw from '../../data/free-exercise-db.json' with { type: 'json' }

/** 'Barbell_Bench_Press_-_Medium_Grip' → 'barbell-bench-press-medium-grip'. */
export const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** YouTube search for "<name> form" (SPEC §7). */
export const videoSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} form`)}`

/** One free-exercise-db record in, one normalised library exercise out. Image paths are served from /exercises/<id>/<n>.jpg. */
export const FreeExerciseDbRecord = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]+$/),
    name: z.string().min(1),
    force: Force.nullable(),
    level: Level,
    mechanic: Mechanic.nullable(),
    equipment: LibraryEquipment.nullable(), // null (stretches, bodyweight drills) is normalised to 'body only'
    primaryMuscles: z.array(Muscle).min(1),
    secondaryMuscles: z.array(Muscle),
    instructions: z.array(z.string()),
    category: ExerciseCategory,
    images: z.array(z.string()),
  })
  .transform((r) => ({
    slug: toSlug(r.id),
    source_id: r.id,
    name: r.name,
    category: r.category,
    equipment: r.equipment ?? ('body only' as const),
    mechanic: r.mechanic,
    force: r.force,
    level: r.level,
    primary_muscles: r.primaryMuscles,
    secondary_muscles: r.secondaryMuscles,
    instructions: r.instructions,
    image_paths: r.images.map((p) => `/exercises/${p}`),
    video_search_url: videoSearchUrl(r.name),
    source: 'free-exercise-db' as const,
  }))

export type LibraryExercise = z.output<typeof FreeExerciseDbRecord>

/** The whole library, parsed once (876 records at the pinned commit). Throws at import if the data file breaks the schema. */
export const library: readonly LibraryExercise[] = z.array(FreeExerciseDbRecord).parse(raw)
