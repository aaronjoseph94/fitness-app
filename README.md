# Aaron's Fitness Tracker

<!-- Owns: the front door — what this is, how to run it, where everything lives. -->

A single-user, AI-first fitness tracker for Aaron: an installable React PWA and one Cloudflare Worker (static assets, REST API, MCP endpoint and job runner) on D1, R2 and Cron Triggers, on the free plan.

A deterministic engine owns the numbers (trend weight, expenditure, forecast, targets, progression). LLMs explain and propose inside the rails Aaron set with his doctor and dietitian, and never write to the database directly. Claude also reaches the same data through an MCP connector from Aaron's own chats.

## What it does

- **Today and Dashboard:** trend weight with a forecast to 65 kg, today's rings (calories, protein, water, steps, sleep), and the full chart set.
- **Log:** meals by text, photo, voice, barcode or favourite; weigh-ins, tape measurements, water, fasts, sleep and steps (manual entry, file import or an iOS Shortcut webhook). Works offline and syncs later.
- **AI on every log:** meal analysis, food matching (Open Food Facts and the Canadian Nutrient File), a day-adjustment card, and proposals. Every applied change is a plan version with a reason and one-tap revert.
- **Train:** an 876-exercise library with images and GIFs, narrowed to what the 47 machines and the free weights at Aaron's gym can do. Templates, a session logger with rest timer, swap-for-the-same-muscle, a muscle map, and progression and deload rules.
- **Pick the days, tap Generate:** Aaron chooses his training days on Train and the AI drafts one workout per day. The split adapts to the days (Mon, Tue, Thu gives Upper A, Lower A, Full body), every body group is checked, and **Keep all** accepts the drafts.
- **Ask AI:** a chat panel on every tab that reads any data and can change anything in Train (templates, training days, equipment, hidden exercises, a session), each behind a tap with Undo.
- **Scans, photos and reviews:** Evolt 360 scan extraction and comparison, progress photos (never sent to any LLM), a weekly review with a printable report and PDF archive, week plans, Web Push reminders, and export and import.
- **Claude connector (MCP):** the same tools as Ask AI, plus the coach procedures (`coach_review`, `scan_debrief`, `program_design`, `plateau_check`).

## Rails

These limits are enforced in code (`packages/shared/src/engine/guards.ts`), and nothing but Aaron changes them.

- Calorie floor 1,400 kcal a day; review proposals stay at or under the ceiling (default 1,700); one proposal moves daily kcal by at most 150.
- Two 24 h fasts a month, on dates Aaron picks.
- Machines and free weights only; 12 to 28 sets per session.
- The LLM never sees Aaron's name, photos of him or raw EXIF; progress photos never go to any LLM.

## Stack

- **Web** (`apps/web`): React 19, Vite, TypeScript 7 (strict), MUI 9, Recharts 3, TanStack Query, Zustand, Dexie (offline queue), vite-plugin-pwa, Geist.
- **Worker** (`apps/worker`): Hono on Cloudflare Workers, D1 through Drizzle, R2, Browser Rendering for PDFs, Cloudflare Access for login. MCP under `/mcp` (`@modelcontextprotocol/server` v2).
- **Shared** (`packages/shared`): Zod schemas, the pure engine and the guards. **Exercises** (`packages/exercises`): free-exercise-db seed, muscle mapping, images.
- **LLMs:** free tiers by default (Groq, then OpenRouter `:free`, then Z.ai GLM, then Gemini Flash). A paid key, set as a Worker secret or under Settings → AI, puts that model first: Claude Opus 5.5, then GPT-6.1 Sol, then Gemini 3.1 Pro, each capped at 200 requests a day. Router and limits: `apps/worker/src/modules/llm/providers.json`.
- **Tests:** Vitest 4.1 (engine and schemas; Worker routes in workerd with a local D1) and Playwright 1.63.

## Run it locally

Node 24.21+ and pnpm 12 (`corepack enable`).

```sh
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars        # local secrets; DEV_AUTH_BYPASS=1 skips Access on localhost
pnpm --filter @fitness/worker setup:local                      # migrate + seed local D1 (baseline scan, rails, 876 exercises, 5,894 CNF foods)
pnpm --filter @fitness/exercises run fetch:images              # exercise step images (gitignored)
pnpm --filter @fitness/exercises run fetch:media               # animated exercise GIFs (gitignored)
pnpm dev                                                       # Worker on :8787 + Vite on :5173 (proxying /api and /mcp)
```

Open http://127.0.0.1:5173. AI features need at least one model key: put one in `apps/worker/.dev.vars` or paste it under Settings → AI. Without a key the AI paths fall back to engine-only output or ask for one (Generate on Train says so).

To run the built app the way it deploys: `pnpm preview` (a Vite build served by `wrangler dev` on :8787). To run only the Worker: `pnpm --filter @fitness/worker dev`.

Other database commands (from `CLAUDE.md`):

```sh
pnpm --filter @fitness/worker db:generate         # drizzle-kit generate → apps/worker/drizzle
pnpm --filter @fitness/worker db:migrate:local    # wrangler d1 migrations apply DB --local
pnpm --filter @fitness/worker seed:local          # load seed/ into local D1
```

## Checks and tests

```sh
pnpm check            # typecheck every package + deep-module boundaries (dependency-cruiser)
pnpm test             # Vitest: engine (Node) + Worker routes and modules (workerd + local D1)
pnpm test:engine      # engine and schema fixtures only (fast)
pnpm e2e              # Playwright flows against a seeded local Worker on :8799 (`pnpm exec playwright install chromium` once)
```

## Deploy

Aaron deploys; agents do not. The one-time Cloudflare setup, the secrets and the repeatable deploy are in [`docs/DEPLOY.md`](docs/DEPLOY.md). An agent working for Aaron on a deploy follows [`docs/DEEPSEEK-HANDOFF.md`](docs/DEEPSEEK-HANDOFF.md).

## Layout

```text
apps/web/            React PWA: features/<module> (entry index + lib/), charts/, muscle-map/, theme.ts, sw.ts
apps/worker/         Hono Worker: routes/ (thin), modules/<module> (deep: entry index + lib/), db/ (Drizzle), drizzle/ (migrations), cron.ts
packages/shared/     Zod schemas, the REST contract (src/api/endpoints.ts), the pure engine (src/engine/, guards.ts)
packages/exercises/  free-exercise-db (pinned), ExerciseDB GIF matches, fetch scripts
seed/                baseline scan, Anytime Fitness equipment, CNF foods
e2e/                 Playwright flows
docs/                spec, progress, deploy guides, workflow (see below)
.claude/skills/      engineering skills; Cursor's copy of two of them (e2e, karpathy-guidelines) is in .agents/skills/
```

## How it fits together

- **One contract.** Every REST endpoint is defined once in `packages/shared/src/api/endpoints.ts` with Zod schemas; the Worker binds it with `route()` and the PWA calls it with `call()`.
- **Deep modules.** Worker logic lives in `apps/worker/src/modules/*`, each a small interface over `(deps, input)`. REST routes, the Ask AI loop and the MCP server all call the same modules through the tools layer (`apps/worker/src/modules/tools`).
- **Rails in code.** Every LLM or MCP change passes the guards and becomes a revertible plan version (Train changes keep their own Undo); nothing proposes below 1,400 kcal or outside the allowed exercise set.
- **Free plan.** One 5-minute cron sweeps jobs and dispatches nightly, weekly and monthly work by Edmonton local time. The Worker does no image work and builds no zips. LLM calls go through the router in `providers.json` with quotas, retries and failover.

## Docs

| File                                                                                                 | What it holds                                                                                                            |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| [`docs/SPEC.md`](docs/SPEC.md)                                                                       | The source of truth: goals, data model, features, AI layer, API, UI, build phases.                                       |
| [`docs/PROGRESS.md`](docs/PROGRESS.md)                                                               | What is done, what is next, and every decision made on Aaron's behalf.                                                   |
| [`GLOSSARY.md`](GLOSSARY.md)                                                                         | The domain language used in code, tests, UI copy and MCP tool descriptions.                                              |
| [`CLAUDE.md`](CLAUDE.md)                                                                             | The rules file for every agent: stack, rails, conventions, commands.                                                     |
| [`AGENTS.md`](AGENTS.md)                                                                             | The entry point for non-Claude agents (Cursor, Codex, DeepSeek); points at `CLAUDE.md`.                                  |
| [`docs/ENGINEERING-WORKFLOW.md`](docs/ENGINEERING-WORKFLOW.md)                                       | The order skills are used in, with a prompt for each common scenario.                                                    |
| [`docs/DEPLOY.md`](docs/DEPLOY.md)                                                                   | Cloudflare setup, secrets, Access, the iOS Shortcut and the Claude connector.                                            |
| [`docs/DEEPSEEK-HANDOFF.md`](docs/DEEPSEEK-HANDOFF.md)                                               | The current deploy steps for an external agent harness, with Aaron at hand.                                              |
| [`docs/DEPLOY-RUNBOOK.md`](docs/DEPLOY-RUNBOOK.md)                                                   | The previous round's deploy checklist, kept for its dashboard and connector detail.                                      |
| [`docs/design/design_handoff_fitness_2a/README.md`](docs/design/design_handoff_fitness_2a/README.md) | The current design spec ("2a"). [`docs/APPLE-DESIGN.md`](docs/APPLE-DESIGN.md) is the superseded Apple-conventions pass. |
| [`docs/superpowers/plans/`](docs/superpowers/plans/)                                                 | Design specs and plans written before each build.                                                                        |
