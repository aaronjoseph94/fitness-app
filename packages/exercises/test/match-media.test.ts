// Owns: seam test for the media matcher (free-exercise-db exercise → ExerciseDB GIF) against the committed ExerciseDB index.
import { describe, expect, test } from 'vitest'
import exerciseDb from '../data/exercisedb-index.json' with { type: 'json' }
import freeExerciseDb from '../data/free-exercise-db.json' with { type: 'json' }
import { matchMedia } from '../scripts/lib/match'

const pick = (...ids: string[]) => freeExerciseDb.filter((e) => ids.includes(e.id))

describe('media matcher', () => {
  test('matches five known gym exercises to their ExerciseDB GIFs and leaves a floor stretch unmatched', () => {
    const map = matchMedia(
      pick(
        'Barbell_Bench_Press_-_Medium_Grip',
        'Hammer_Curls',
        'Leg_Extensions',
        'Seated_Cable_Rows',
        'Lying_Leg_Curls',
        '90_90_Hamstring',
      ),
      exerciseDb,
    )

    // Known-good pairs, checked by eye against the GIF frames (barbell bench press, dumbbell hammer curl,
    // lever leg extension, cable seated row — not the lever "Machine Seated Row" — and lever lying leg curl).
    expect(Object.fromEntries(Object.entries(map).map(([id, m]) => [id, m.source_id]))).toEqual({
      'Barbell_Bench_Press_-_Medium_Grip': 'EIeI8Vf',
      Hammer_Curls: '2NpxjC1',
      Leg_Extensions: 'my33uHU',
      Seated_Cable_Rows: 'fUBheHs',
      Lying_Leg_Curls: '17lJ1kr',
    })
    expect(map.Hammer_Curls).toMatchObject({
      source: 'exercisedb',
      url: 'https://static.exercisedb.dev/media/2NpxjC1.gif',
    })
    for (const m of Object.values(map)) expect(m.score).toBeGreaterThanOrEqual(85)
  })
})
