// Owns: exercise media beyond the step images — each matched ExerciseDB GIF (data/media-map.json) as a static asset path
// plus its provenance. The GIF files themselves are fetched by scripts/fetch-media.ts (gitignored) and served by the web build.
import mediaMap from '../../data/media-map.json' with { type: 'json' }

/** One media item of an exercise. Shape-compatible with the `exercises.media` column ({ kind, url, source }). */
export type LibraryMedia = {
  kind: 'gif'
  /** Static asset path: '/media/exercises/<exercise-id>.gif'. */
  url: string
  source: 'exercisedb'
  /** ExerciseDB exercise id the GIF belongs to. */
  source_id: string
  /** Where the GIF was downloaded from (static.exercisedb.dev). */
  source_url: string
  /** Match confidence 0–100 from scripts/match-media.ts (only ≥ 85 is kept). */
  score: number
  /** Copyright line the GIF's terms ask every use to show (see SOURCE.md). */
  attribution: string
}

/** Gym visual's terms: every use carries this line, at the 180×180 resolution they ship. */
export const GIF_ATTRIBUTION = '© Gym visual — https://gymvisual.com/'

type MediaMapRow = { source: string; source_id: string; url: string; score: number }
const rows: Readonly<Record<string, MediaMapRow>> = mediaMap

/** Static asset path of the animated demo for a free-exercise-db id. */
export const gifPath = (sourceId: string) => `/media/exercises/${sourceId}.gif`

/** gif_url (null when unmatched) and media list for a free-exercise-db id. */
export function mediaFor(sourceId: string): { gif_url: string | null; media: LibraryMedia[] } {
  const row = rows[sourceId]
  if (!row) return { gif_url: null, media: [] }
  const url = gifPath(sourceId)
  return {
    gif_url: url,
    media: [
      {
        kind: 'gif',
        url,
        source: 'exercisedb',
        source_id: row.source_id,
        source_url: row.url,
        score: row.score,
        attribution: GIF_ATTRIBUTION,
      },
    ],
  }
}
