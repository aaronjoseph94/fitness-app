<!-- Owns: provenance and licence of the exercise library data and images. -->

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
