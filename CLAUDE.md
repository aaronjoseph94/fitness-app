# CLAUDE.md — AI Fitness Tracker

<!-- Owns: the working agreement for anyone (human or agent) building this repo. The spec is the source of truth; this file points at it. -->

Single-user, AI-first fitness tracker for Aaron: an installable React PWA and one Cloudflare Worker (static assets, REST API, MCP endpoint, job runner) on D1, R2 and Cron Triggers.

**Source of truth: [`docs/SPEC.md`](docs/SPEC.md).** Read it before changing anything. Progress, next steps and decisions made on Aaron's behalf live in [`docs/PROGRESS.md`](docs/PROGRESS.md).

## Phase status

<!-- Keep this block current at the end of every feature. -->

| Phase | Scope (SPEC §12) | Status |
| --- | --- | --- |
| 0 | Spec saved, CLAUDE.md, PROGRESS.md | Done |
| 1 | Log and see: monorepo, D1 + migrations, seeds, Access, styleguide, logging, trend/forecast engine, Today tab, offline | Planned, waiting for Aaron's go |
| 2 | AI on every log: provider router, meal analysis, food matching, barcode, voice, proposals and plan versions | Not started |
| 3 | Training: library, equipment, builder, sessions, muscle map, progression, AI workouts | Not started |
| 4 | Scans, reviews, week plans, Ask AI, MCP + Claude connector | Not started |
| 5 | Photos, push reminders, export/import, full chart inventory, polish | Not started |

## Stack

- **Web** (`apps/web`): React 19, Vite, TypeScript strict, MUI, Recharts, TanStack Query, Zustand, Dexie (offline log queue), vite-plugin-pwa, Outfit font self-hosted.
- **Worker** (`apps/worker`): Hono on Cloudflare Workers. REST under `/api`, MCP under `/mcp`, job runner (`ai_jobs` + `ctx.waitUntil()` + Cron Triggers). D1 via Drizzle ORM, R2 for files, Browser Rendering for PDFs, Cloudflare Access JWT on every request.
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
pnpm --filter @fitness/worker deploy     # wrangler deploy
pnpm e2e                                 # Playwright flows against the local Worker
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
4. Testing during the build: a quick, targeted test per feature only. Aaron runs the full suites himself.
5. When something in the spec is impossible or a better option exists (a library, a Cloudflare limit, a free-tier change), say so and propose the smallest change. Never substitute silently. Record the decision in `docs/PROGRESS.md`.
6. Show the running app (local Worker) at the end of each feature; Playwright flows for the main paths at the end of each phase.

## Decided defaults (from Aaron's build prompt, SPEC §12 open decisions)

- Hosting: all-Cloudflare.
- `auto_apply_safe`: off for the first month; everything behind a tap. MCP writes apply immediately (Aaron approves in the Claude chat).
- Calorie ceiling for review proposals: 1,700 kcal.
- Scan interval: 4 weeks.
- Apple Watch: manual entry and the Shortcut webhook both in phase 1.
- Muscle map: our own SVG, 17 paths keyed by the free-exercise-db muscle enum.
- Default weekly split: upper / lower / upper / lower, Mon–Thu.
