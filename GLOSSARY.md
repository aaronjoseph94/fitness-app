# Glossary

<!-- Owns: the domain language of this app. Code, tests, UI copy and MCP tool descriptions use these terms exactly. Add a term the moment it settles (see .claude/skills/domain-modeling). -->

## People and authority

- **Aaron**: the one user. Every write is attributed to an **Actor**.
- **Actor**: who made a change: `user` (Aaron in the app), `ai` (a job run by the model chain), `mcp` (Claude through the connector). Stored on every write and event.
- **Coach**: Claude via MCP doing judgement work (weekly review, scan debrief, program design, plateau check). The **Clerk** is the free-tier LLM doing per-log work (meal parsing, day adjustment, scan extraction) — or, with a paid key set, the same paid model does the clerk work in the Worker.

## Rails and plans

- **Rails**: the hard limits Aaron set with his doctor and dietitian, stored in `settings`: **calorie floor** (1,400 kcal), **calorie ceiling** for proposals (1,700 kcal), protein minimum, fat minimum, the fasting pattern, and the **allowed exercise set**. Nothing but Aaron changes a rail.
- **Guard**: a pure check in `packages/shared/engine/guards.ts` that accepts or rejects a proposed change against the rails. Every LLM or MCP write passes the guards; a change that fails is dropped and reported, the rest applies.
- **Plan version**: an append-only snapshot of target defaults and per-weekday overrides, with `reason`, `diff`, `forecast` and `created_by`. Exactly one is **active**. **Revert** creates a new version copying an older one.
- **Daily targets**: the materialised targets for one local date (kcal, macros, fibre, water, steps, fast day, training planned), rebuilt from the active plan version and the active week plan.
- **Week plan**: the plan for one Monday–Sunday: per-day targets, the four sessions as template snapshots, water, steps, fast dates, scan date, focus note. Status `proposed → active → superseded`.
- **Proposal**: a suggested change (from `ai` or `mcp`) awaiting a decision: `pending → accepted | rejected | auto_applied`. Accepting creates a plan version.
- **Review**: a weekly coaching pass (`weekly_reviews`). A Claude review supersedes the AI draft for that week. Applying a review is one plan version, revertible in one tap.

## Body and progress

- **Weigh-in**: one raw scale weight per local date.
- **Trend weight**: EWMA of weigh-ins, α = 0.25; gaps carry the last trend forward. The UI leads with trend, not raw.
- **Expenditure estimate** (`tdee_est`): adaptive estimate from intake and trend change over a trailing 14-day window, clamped 1,200–4,500 and smoothed 50/50. Starts at the scan TEE (2,551 kcal).
- **Forecast**: weekly loss rate from `(tdee_est − target_kcal) × 7 / 7,700`, finish date for 65 kg, band ±20 %.
- **Milestone**: a target value with the date it was reached (weight 90/85/80/75/70/65 kg; body fat %, visceral level, WHR, torso fat).
- **Scan**: one Evolt 360 result, extracted from the sheet image and confirmed by Aaron, with **segments** (left/right arm, torso, left/right leg) and **conditions** (time of day, fasted, hours since training, hydration).
- **Lean-loss guard**: flag when lean mass is more than 25 % of the weight lost between two scans (water shift called out separately).
- **Plateau**: trend change under 0.2 kg across 21 days with adherence ≥ 80 %.
- **Adherence**: share of days with a weigh-in, at least two logged meals or a fast, and water logged.
- **Progress photo**: front/side/back photo; never sent to any LLM.

## Food and fasting

- **Meal**: one eating occasion in a **slot** (`breakfast` hidden by default, `lunch`, `dinner`, `snack`) with **items**. Status `parsing → review → confirmed`.
- **Meal item**: a food with grams and nutrition; `estimated` when no database match and the LLM guessed.
- **Food**: a cached nutrition record from Open Food Facts, the Canadian Nutrient File, the LLM, or Aaron. Canada is the generic-food source: USDA FoodData Central is no longer queried, and only pre-existing cached rows still carry its `usda` tag.
- **Favourite**: a one-tap repeat: a food with default grams, or a **recipe** (list of foods with grams).
- **Fast**: a planned or ad-hoc 24 h fast (`started_at`, `ended_at`). A **fast day** is any local date overlapping a fast; intake expected 0, water target up, training light.
- **Day adjustment**: the card after a meal or fast start: remaining kcal and macros, protein status, next-meal suggestions.

## Training

- **Exercise**: one entry in the library (free-exercise-db plus Aaron's own), with primary and secondary **muscles** (the 17-key enum).
- **Allowed exercise set**: exercises not excluded by equipment status (`dont_have`, `cant_use`, `dislike`) or by **exclusions** (`body only`, floor exercises, hidden exercises). The AI only ever sees this set.
- **Template**: a reusable workout: ordered exercises with sets, rep range, target load, rest.
- **Session**: one gym visit, started from a template, the week plan, an AI suggestion or blank; holds **sets** (reps, load, RPE, done).
- **Muscle score**: Σ over exercises of sets × (1.0 if primary, 0.5 if secondary), per muscle; drawn on the **muscle map** in four intensity steps.
- **Double progression**: when every working set hits the top of the rep range at a load in two consecutive sessions, suggest +2.5 kg (upper body, dumbbells) or +5 kg (lower body, machines).
- **Deload**: one week at 60 % of sets every 6–8 weeks, or after two sessions missing the rep minimum on most sets.
- **Readiness**: 0–100 from last night's sleep vs 7.5 h, yesterday's steps vs the 14-day median, and days since the last session; under 40 suggests reduced volume.
- **e1RM**: Epley estimated one-rep max, `load × (1 + reps / 30)`.

## System

- **Job**: a row in `ai_jobs` (`queued → running → done | failed`) with a lease; run in `waitUntil` after the response and swept by the 5-minute cron.
- **Event**: a row in `ai_events` the dashboard and MCP read: `adjustment`, `proposal`, `review`, `note`, `change`.
- **Router**: the LLM provider chain — any paid model whose key is set first (Claude → ChatGPT → Gemini Pro), then the free tiers (Groq → OpenRouter `:free` → GLM → Gemini last; vision starts at OpenRouter) — with quotas, retries, schema repair and failover.
- **Tools layer**: the typed operations shared by Ask AI and MCP (`get_today`, `apply_review`, …); each tool calls the same worker modules as the REST routes.
- **Review bundle**: the one compact JSON a coach reads for a period (`get_review_bundle`).
