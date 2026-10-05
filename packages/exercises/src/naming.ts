// Owns: the library's naming helpers — slugs and the video search link. Side-effect free (no library JSON), so the
// Worker imports them as `@fitness/exercises/naming` for custom exercises without loading the ~1 MB library.

/** 'Barbell_Bench_Press_-_Medium_Grip' → 'barbell-bench-press-medium-grip'; 'Pendulum Squat (club)' → 'pendulum-squat-club'. */
export const toSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** YouTube search for "<name> form" (SPEC §7). */
export const videoSearchUrl = (name: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} form`)}`
