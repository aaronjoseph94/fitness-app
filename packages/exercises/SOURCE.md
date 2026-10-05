<!-- Owns: provenance and licence of the exercise library data, step images and animated demos (GIFs). -->

# Exercise library source

| What                                                               | Where                                                                                            | Licence                                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `data/free-exercise-db.json` (876 exercises, committed)            | `dist/exercises.json` of [yuhonas/free-exercise-db](https://github.com/yuhonas/free-exercise-db) | [The Unlicense](https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE) (public domain) |
| `images/<exercise-id>/<n>.jpg` (1,746 step images, **gitignored**) | `exercises/<exercise-id>/<n>.jpg` of the same repo                                               | The Unlicense                                                                                  |

**Pinned commit:** `f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5` (main on 2026-10-05). The SHA lives in `src/lib/source.ts`.

```sh
pnpm --filter @fitness/exercises run fetch:data     # JSON only
pnpm --filter @fitness/exercises run fetch:images   # JSON + step images (skips files already present)
```

To move to a newer commit: change `FREE_EXERCISE_DB_SHA`, run `fetch:images`, then `pnpm --filter @fitness/worker seed:local` (library rows upsert by slug; `gif_url`, `media` and custom exercises are left alone).

**Normalisation** (`src/lib/library.ts`): slug = kebab-case of the source id; `equipment: null` (stretches and bodyweight drills) becomes `body only`; image paths become `/exercises/<id>/<n>.jpg` (the web build serves `images/` at `/exercises/`); `video_search_url` is a YouTube search for "<name> form". Three kettlebell records ship without images.

## Animated demos (ExerciseDB GIFs)

Reused per Aaron's direction (2026-10-05): personal, non-commercial, single-user app behind Cloudflare Access. The GIFs are downloaded once and served as static assets, never hotlinked and never committed.

| What                                                          | Where                                                                                                                                                                                                                                                                                                                                                                                                            | Licence / terms                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/exercisedb-index.json` (1,324 entries, committed)       | Snapshot of the [ExerciseDB open-source v1 API](https://oss.exercisedb.dev/api/v1/exercises) on 2026-10-05: the 1,324 of 1,500 exercises whose GIF resolves, reduced to `{id, name, aliases, equipment, target}`. `aliases` are the legacy ExerciseDB names for the same `media_id`, from [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (`data/exercises.json` @ `7455efa`). | Exercise data: MIT (hasaneyldrm/exercises-dataset `LICENSE`).                                                                                                                                                                                                                                                                                                                                                           |
| `data/media-map.json` (committed)                             | Generated by `scripts/match-media.ts` from the two data files above: `{ <free-exercise-db id>: { source: 'exercisedb', source_id, matched_name, url, score } }`, score ≥ 85 only.                                                                                                                                                                                                                                | Ours.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `media/<exercise-id>.gif` (180 × 180, ~44 MB, **gitignored**) | `https://static.exercisedb.dev/media/<source_id>.gif`, downloaded by `scripts/fetch-media.ts`.                                                                                                                                                                                                                                                                                                                   | **© Gym visual — https://gymvisual.com/**. Redistributed by ExerciseDB / hasaneyldrm with the rights holder's permission at 180 × 180 only; every use must show that copyright line ([Gym visual terms](https://gymvisual.com/content/3-terms-and-conditions-of-use)). We keep the 180 × 180 originals and carry the line as `media[].attribution` (`GIF_ATTRIBUTION`) so the exercise sheet can show it under the GIF. |

```sh
pnpm --filter @fitness/exercises run match:media              # rewrite data/media-map.json + the coverage line below (offline, ~7 s)
pnpm --filter @fitness/exercises run match:media -- --review  # also print every match, lowest score first
pnpm --filter @fitness/exercises run fetch:media              # download the matched GIFs into media/ (skips files already present)
```

**Matching** (`scripts/lib/match.ts`, deterministic): names are normalised (lower-case, synonyms such as pull-up/pullup, flyes/fly, one-arm/single-arm, "- Medium Grip" dropped, plurals stemmed, equipment and stop words dropped), then scored `0.6 · token-sort + 0.4 · token-set` similarity, minus penalties for an equipment mismatch (−20, so it can never reach 85; ExerciseDB's name words beat its equipment field, which is sometimes wrong), different movements (−10), no shared target muscle (−8), conflicting body position (−6) and each one-sided variant word such as incline, reverse, close-grip (−4). Each library exercise takes its best ExerciseDB entry (name or alias); ties go to the lower id. The library exposes a match as `gif_url: '/media/exercises/<id>.gif'` plus a `media` item with the provenance (`src/lib/media.ts`); unmatched exercises keep `gif_url: null`, `media: []` and fall back to the step images.

<!-- media-coverage:start -->

Coverage (score ≥ 85, from `scripts/match-media.ts`): **458 of 876** exercises (52%) have a GIF, using 424 distinct ExerciseDB GIFs; **326 of 551** gym exercises (machines and free weights, no stretches: 59%). By score: 334 at ≥ 95, 70 at 90–95, 54 at 85–90.

<!-- media-coverage:end -->
