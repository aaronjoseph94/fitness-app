# Fitness

<!-- Owns: the front door — what this is, how to run it, where everything lives. -->

Aaron's single-user, AI-first fitness tracker: an installable React PWA and one Cloudflare Worker on the free plan. It logs meals (text, photo, voice, barcode), weigh-ins, tape measurements, water, fasts, workouts, Apple Watch sleep and steps, Evolt 360 scans and progress photos. A deterministic engine owns the numbers (trend, expenditure, forecast, targets, progression), and free-tier LLMs explain and propose inside the rails set with his doctor and dietitian (1,400 kcal floor, two 24 h fasts a month, machines and free weights only). Claude reaches the same data through an MCP connector as the senior coach.

- **Spec:** [`docs/SPEC.md`](docs/SPEC.md) (source of truth)
- **Working agreement for agents:** [`CLAUDE.md`](CLAUDE.md), domain language in [`GLOSSARY.md`](GLOSSARY.md)
- **What's done and every decision made on Aaron's behalf:** [`docs/PROGRESS.md`](docs/PROGRESS.md)
- **Deploy (Cloudflare, via Cursor):** [`docs/DEPLOY.md`](docs/DEPLOY.md)

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

Open http://127.0.0.1:5173. `/styleguide` renders every token, card and chart. AI features need at least `GEMINI_API_KEY` in `apps/worker/.dev.vars`; without keys every AI path falls back gracefully (meals go to review for manual items, reviews are engine-only).

To run the built app the way it deploys: `pnpm preview` (Vite build served by `wrangler dev` on :8787).

## Checks

```sh
pnpm check            # typecheck every package + deep-module boundaries (dependency-cruiser)
pnpm test             # Vitest: engine (Node) + Worker routes and modules (workerd + local D1)
pnpm e2e              # Playwright flows against a seeded local Worker (`pnpm exec playwright install chromium` once)
```

## Layout

```text
apps/web/            React 19 PWA — features/<module> (entry index + lib/), charts/, muscle-map/, theme.ts, sw.ts
apps/worker/         Hono Worker — routes/ (thin), modules/<module> (deep: entry index + lib/), db/ (Drizzle), drizzle/ (migrations), cron.ts
packages/shared/     Zod schemas, the REST contract (api/endpoints.ts), the pure engine (engine/, guards.ts)
packages/exercises/  free-exercise-db (pinned) + ExerciseDB GIF matches + fetch scripts
seed/                baseline scan, Anytime Fitness equipment, CNF foods
e2e/                 Playwright flows
docs/                SPEC, PROGRESS, DEPLOY
.claude/skills/      Engineering skills: Matt Pocock's (codebase-design, tdd, code-review, …), Addy Osmani's (review, security, web quality), obra's Superpowers (brainstorming, plans, debugging, verification)
```

## How it fits together

- **One contract.** Every REST endpoint is defined once in `packages/shared/src/api/endpoints.ts` with Zod schemas; the Worker binds it with `route()` and the PWA calls it with `call()`.
- **Deep modules.** Worker logic lives in `apps/worker/src/modules/*`, each a small interface over `(deps, input)`. REST routes, the Ask AI loop and the MCP server all call the same modules through the tools layer (`modules/tools`, 46 tools).
- **Rails in code.** Every LLM or MCP change passes `packages/shared/src/engine/guards.ts` and becomes a revertible plan version; nothing proposes below 1,400 kcal or outside the allowed exercise set.
- **Free plan.** One 5-minute cron dispatches nightly/weekly/monthly work by Edmonton local time; no image work or zipping in the Worker; LLM calls go Gemini → GLM → OpenRouter `:free` → Groq with quotas and failover.
