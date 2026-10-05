# CLAUDE.md — AI Fitness Tracker

<!-- Owns: the working agreement for anyone (human or agent) building this repo. The spec is the source of truth; this file points at it. -->

Single-user, AI-first fitness tracker for Aaron: an installable React PWA and one Cloudflare Worker (static assets, REST API, MCP endpoint, job runner) on D1, R2 and Cron Triggers.

**Source of truth: [`docs/SPEC.md`](docs/SPEC.md).** Read it before changing anything. Progress, next steps and decisions made on Aaron's behalf live in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Phase status

<!-- Keep this block current at the end of every feature. -->

| Phase | Scope (SPEC §12) | Status |
| --- | --- | --- |
| 0 | Spec saved, CLAUDE.md, PROGRESS.md | Done |
| 1 | Log and see: monorepo, D1 + migrations, seeds, Access, styleguide, logging, trend/forecast engine, Today tab, offline | Built |
| 2 | AI on every log: provider router, meal analysis, food matching, barcode, voice, proposals and plan versions | Built |
| 3 | Training: library, equipment, builder, sessions, muscle map, progression, AI workouts | Built |
| 4 | Scans, reviews, week plans, Ask AI, MCP + Claude connector | Built (connector untested with live Claude until deployed) |
| 5 | Photos, push reminders, export/import, full chart inventory, polish | Built; final polish, e2e flows and code review in progress |

## Stack

- **Web** (`apps/web`): React 19, Vite, TypeScript strict, MUI, Recharts, TanStack Query, Zustand, Dexie (offline log queue), vite-plugin-pwa, Outfit font self-hosted.
- **Worker** (`apps/worker`, config `wrangler.jsonc`): Hono on Cloudflare Workers. REST under `/api`, MCP under `/mcp` (`@modelcontextprotocol/server` v2 + `@modelcontextprotocol/hono`, stateless, new server per request), job runner (`ai_jobs` + `ctx.waitUntil()` + one 5-minute cron). D1 via Drizzle ORM, R2 for files, Browser Rendering (`BROWSER.quickAction('pdf')`) for archived PDFs, Cloudflare Access JWT on every request.
- **Shared** (`packages/shared`): Zod schemas (types inferred from them), the pure engine (`packages/shared/engine`), guardrails (`packages/shared/engine/guards.ts`).
- **Exercises** (`packages/exercises`): free-exercise-db seed, muscle-group mapping, images served as static assets.
- **Seed** (`seed/`): `scans/2026-09-26.json`, `equipment/anytime-fitness.json`.
- **Tests**: Vitest (engine and schemas; Worker routes via `@cloudflare/vitest-pool-workers`), Playwright against the local Worker.
- **LLMs**: free tiers only. Gemini Flash primary; Z.ai GLM, OpenRouter `:free`, Groq as fallbacks, all via plain `fetch`. Claude reaches the app only through the MCP connector from Aaron's own Claude chats.

## Commands

<!-- Planned names; finalised by the phase 1 scaffold. Update here if they change. -->

```sh
pnpm install
pnpm dev                                 # web + Worker together for local development
pnpm --filter @fitness/worker dev        # wrangler dev: Worker + built web assets, local D1 and R2
pnpm test                                # Vitest across all packages
pnpm --filter @fitness/shared test       # engine + schema fixtures only (fast)
pnpm --filter @fitness/worker db:generate        # drizzle-kit generate → apps/worker/drizzle
pnpm --filter @fitness/worker db:migrate:local   # wrangler d1 migrations apply fitness --local
pnpm --filter @fitness/worker db:migrate:remote  # wrangler d1 migrations apply fitness --remote (CI, before deploy)
pnpm --filter @fitness/worker seed:local         # load seed/ into local D1
pnpm --filter @fitness/exercises run fetch:images # download exercise step images (gitignored) before a web build
pnpm --filter @fitness/exercises run fetch:media  # download matched ExerciseDB GIFs (gitignored)
pnpm --filter @fitness/worker exec tsx scripts/vapid-keys.ts  # new Web Push key pair
pnpm --filter @fitness/worker deploy     # wrangler deploy (Aaron/Cursor only — see docs/DEPLOY.md)
pnpm e2e                                 # Playwright flows against a seeded local Worker
pnpm check                               # typecheck + deep-module boundaries
```

## Conventions (SPEC §4)

- Every file starts with a short comment saying what it owns. Engine functions are pure, typed, and commented with the formula they implement (write the formula, not a paraphrase).
- Zod schema first for every API body, job output and MCP tool input. Types are inferred from schemas, never written twice by hand.
- Visual tokens (colours, type scale, spacing, chart palette) live only in `apps/web/src/theme.ts`. The `/styleguide` route renders every token, card and chart with sample data.
- No secrets in the web bundle. The web app talks only to `/api`. LLM keys live in Worker secrets.
- Local dev against local D1 and R2; deploy with `wrangler deploy`; migrations run in CI before deploy.
- Units kg, cm, ml, kcal, g. Timezone `America/Edmonton`. A day is an ISO date string (`2026-10-04`); instants are ISO timestamps with offset. IDs are UUID text.

## Rails (never break these)

- **Calorie floor 1,400 kcal/day**, set with Aaron's doctor and dietitian. Nothing proposes below it. Review proposals stay at or under the ceiling (default 1,700). A single proposal moves daily kcal by at most 150.
- **Two 24 h fasts a month** on dates Aaron picks. A fast day is a known pattern, not a missed day.
- **Exercise set**: machines and free weights only. `body only` and floor exercises are excluded. AI only ever sees the allowed list. Sets per session 12–28.
- **No LLM writes to the database directly.** Every LLM output passes Zod validation and `packages/shared/engine/guards.ts`. Every applied change is a `plan_versions` row with a reason, a diff and one-tap revert. Nothing can change the `settings` rails except Aaron.
- **Privacy**: the LLM never sees Aaron's name, photos of Aaron, or raw EXIF. Progress photos never go to any LLM.

## How we work

1. Phase by phase (SPEC §12). Before each phase: a short plan (files, migrations, components, tests), then wait for Aaron's go.
2. Within a phase: feature by feature, one commit per feature with a clear message. Parallel agents where the work splits cleanly (Aaron's standing preference).
3. The engine (`packages/shared/engine`) is built first in every phase that touches numbers, with Vitest fixtures, before any UI or LLM code uses it.
4. Testing during the build: a quick, targeted check per feature only (typecheck + at most one short test). Aaron runs the full suites himself.
5. When something in the spec is impossible or a better option exists (a library, a Cloudflare limit, a free-tier change), say so and propose the smallest change. Never substitute silently. Record the decision in `docs/PROGRESS.md`.
6. Show the running app (local Worker) at the end of each feature; Playwright flows for the main paths at the end of each phase.

## Engineering approach (Matt Pocock's skills — `.claude/skills/`)

Read `.claude/skills/codebase-design/SKILL.md` before designing any module, and use its vocabulary (module, interface, depth, seam, adapter, leverage, locality). Use `GLOSSARY.md` terms in names, tests and UI copy.

- **Deep modules.** A module is a folder whose root files are its entry points (usually just `index.ts`); implementation lives in `lib/`, tests in `tests/`. Small interface, lots of behaviour behind it. `pnpm lint:boundaries` (dependency-cruiser, `.dependency-cruiser.cjs`) fails on any import that reaches into another module's subfolders. Module roots: `packages/shared/src/*`, `apps/worker/src/modules/*`, `apps/web/src/features/*`.
- **Accept dependencies, return results.** Worker modules take `(deps, input)` — `deps` holds `db`, `env`, `now`, `actor`, and any adapter (LLM router, food sources, file store) — and return values. No module constructs its own adapters, so tests swap in fakes at the seam.
- **Seams that matter get adapters.** LLM providers, nutrition sources, the file store and push are adapters behind one interface each. Don't add a seam with only one hypothetical adapter.
- **Tests at agreed seams only** (`.claude/skills/tdd`): the engine's public functions, `guards.ts`, and each worker module's `index.ts`. Write one failing test, then the code, in vertical slices. Assert against known-good literals from the spec (e.g. the 2,551 − 1,400 kcal → ~1.0 kg/week example), never values recomputed the way the code does. Keep it to a few tests per seam during the build.
- **Review** each phase with `.claude/skills/code-review` (Standards axis = this file + the smell baseline; Spec axis = `docs/SPEC.md`), then fix findings in one pass.
- **Decisions** that future work must not re-litigate go in `docs/PROGRESS.md` (and `docs/adr/` for the big ones).

## Engineering rules (from the 2026-10-05 stack check — see docs/PROGRESS.md for the why)

**Dependencies.** Every version is pinned once in the `catalog:` of `pnpm-workspace.yaml` and already installed. Do not run `pnpm add`/`pnpm install` with new packages from a parallel agent; if something is missing, say so in your result. TypeScript 6.0 (not 7), Vitest 4.1 (not 5), Playwright 1.56.1 (matches the preinstalled Chromium), Zod 4 (`import * as z from 'zod'`), MUI 9 (Grid uses `size`, not `xs`), React Router 8 (data mode), Recharts 3 (use the `responsive` prop or fixed widths).

**Time.** Instants are stored as UTC strings `YYYY-MM-DDTHH:MM:SS.sssZ`. The Edmonton local `date` (`YYYY-MM-DD`) is computed in code (`@fitness/shared/engine` dates helpers using `Intl` with `America/Edmonton`) and stored beside the instant when a row belongs to a day. Never compare offset strings in SQL.

**D1 / Drizzle.**
- Drizzle schema: `apps/worker/src/db/schema.ts` (all tables). `drizzle-kit generate` only creates migrations; only `wrangler d1 migrations apply DB --local|--remote` applies them. Never `drizzle-kit push/migrate`.
- `pnpm --filter @fitness/worker db:generate` post-processes migrations (`PRAGMA foreign_keys=OFF/ON` → `PRAGMA defer_foreign_keys=on/off`). Any migration containing `__new_` (a table rebuild) gets hand review and must drop and recreate `v_day`.
- `v_day` is hand-written SQL in `apps/worker/src/db/v_day.sql`, shipped in a custom migration, queried through `sqliteView(...).existing()`. It uses a date spine with correlated subqueries per metric (indexed `SEARCH`, never a full `SCAN`).
- Never `db.transaction()` (D1 throws). Validate in JS, then write everything for one change in a single `db.batch([...])`. Conditional writes go in SQL (`ON CONFLICT`, `WHERE NOT EXISTS`).
- No `ON DELETE CASCADE`. Delete child rows explicitly in the same batch.
- Max 100 bound parameters per statement: chunk multi-row inserts (rows per statement = floor(100 / columns)). Seeds are generated SQL files applied with `wrangler d1 execute --file`.
- Enums are enforced in Zod/TypeScript, not with DB CHECKs. JSON columns use `text(..., { mode: 'json' }).$type<T>()`; spec `text[]` means a JSON array column. Parse LLM-fed JSON columns with their Zod schema on read.
- Index every `date` column, `ai_jobs(status, run_after)`, `ai_events(created_at)`.

**Worker (free plan: 10 ms CPU per request/cron, 50 external subrequests, waitUntil ≤ 30 s).**
- Business logic lives in deep modules under `apps/worker/src/modules/<name>/` (entry `index.ts`, internals in `lib/`) as functions over `(deps, input)`. REST routes (`apps/worker/src/routes/*`) and the tools layer (Ask AI + MCP) both call module entry points. Routes are thin: validate with the shared Zod schema, call a module, return JSON.
- Keep per-request CPU small: build JSON Schemas for tools once per isolate (module scope), never zip or process images in the Worker (export zip is built in the browser; backups are per-table JSON in R2).
- One cron (`*/5 * * * *`). `src/cron.ts` sweeps `ai_jobs` and dispatches nightly / weekly / monthly work by **Edmonton local time**, made idempotent by a `cron_runs` row per (kind, local period).
- Jobs run in `ctx.waitUntil()` with a 25 s deadline (per-attempt `AbortSignal.timeout`); on deadline set `status=queued`. `ai_jobs.lease_until` lets the sweep requeue stuck `running` rows.
- Auth: Cloudflare Access JWT (`Cf-Access-Jwt-Assertion`, verified with `jose` against `${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`, JWKS cached at module scope). `DEV_AUTH_BYPASS=1` (only in `.dev.vars`, only honoured for localhost hosts) skips it locally. `/api/ingest/health` and `/mcp` use their own bearer tokens.
- Files: R2 objects are served only through `/api/files/*` with our own HMAC-signed, expiring URLs (`FILE_URL_SECRET`). No S3 presigned URLs.

**Web.**
- Visual tokens only in `apps/web/src/theme.ts` (`tokens` const of literal hex values + MUI `createTheme({ cssVariables: true })`). Charts read `tokens` directly so SVG output has literal colours for print/PDF.
- Recharts for line/bar/area charts. Calendar heatmaps, the fasting strip, the milestone timeline and the muscle map are small custom SVG components in `apps/web/src/charts` / `apps/web/src/muscle-map`. Every chart has a `data-testid`.
- Muscle map geometry is vendored from react-muscle-map (public domain) in `apps/web/src/muscle-map/source/`; we never draw our own body art. Reuse web visuals (exercise GIFs/images, icons, silhouettes, illustrations) per Aaron's direction; record provenance in a `SOURCE.md` next to each set.
- PWA: `injectManifest` with `src/sw.ts`; manifest fetched with credentials (Access). The Dexie offline queue is flushed from the page (app start, `online`, `visibilitychange`, after any successful call) because iOS has no Background Sync. Client-generated UUIDs make queued writes idempotent. A redirect/opaque response from `/api` means the Access session expired: keep the queue, reload to re-auth.
- Native `<TextField type="date|time|datetime-local">` for dates (no MUI X pickers). Icons: `@mui/icons-material`.

**Testing during the build.** Typecheck the package you touched and run one quick targeted test at most. No full suites, no exhaustive tests — Aaron runs the in-depth testing later.

**Deploy.** Never deploy from an agent. Aaron deploys via Cursor using `docs/DEPLOY.md`.

## Decided defaults (from Aaron's build prompt, SPEC §12 open decisions)

<!-- Aaron's direction 2026-10-05: don't reinvent visuals. Reuse muscle graphics, exercise GIFs/images, icons and illustrations from the web, not only open-source ones. The app is non-commercial and for Aaron only. Prefer downloading once and serving from static assets or R2 over hotlinking. -->

- Hosting: all-Cloudflare.
- `auto_apply_safe`: off for the first month; everything behind a tap. MCP writes apply immediately (Aaron approves in the Claude chat).
- Calorie ceiling for review proposals: 1,700 kcal.
- Scan interval: 4 weeks.
- Apple Watch: manual entry and the Shortcut webhook both in phase 1.
- Muscle map: an existing body graphic from the web (component or SVG), mapped to the 17 free-exercise-db muscle keys. Not drawn by us (Aaron, 2026-10-05).
- Default weekly split: upper / lower / upper / lower, Mon–Thu.
