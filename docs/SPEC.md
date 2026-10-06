# AI Fitness Tracker — Build Spec

As of 2026-10-04 · Aaron

## 1. Overview and goals

A single-user, AI-first fitness tracker (installable PWA + Cloudflare Worker) that logs everything Aaron eats and does, re-plans in real time inside dietitian-set rails, and tracks the road from 95.1 kg to 65 kg over 10 months. Built in Claude Code (Opus 5.5); this doc is the spec.

**Goals**

- Log meals (text, photo, voice, barcode), weigh-ins, tape measurements, water, fasts, workouts (sets, reps, load), sleep and steps from Apple Watch, Evolt 360 scans, and progress photos.
- An LLM job runs after every log and nightly/weekly, using free tiers only (OpenRouter `:free` primary, Z.ai, Gemini and Groq as fallbacks), and proposes adjustments to targets, meals and training.
- Deterministic engine owns the numbers (targets, trend weight, forecast, progression); the LLM explains, suggests and proposes. Every AI change is a plan version with a reason and one-tap revert.
- Workouts suggested from the real equipment profile (have / don't have / dislike / can't use) and from a library where every exercise has images and a video link; a muscle map shows what any workout (AI or custom) trains.
- Evolt scans uploaded as images, extracted to structured data, compared over time, and fed into the plan.
- Weekly printable summary; a dashboard with many charts; Ask AI inside the app; an MCP connector so Claude can read and write the same data, review everything, and recommend next week's plan.

**Non-goals (v1)**

- No multi-user, social or sharing features; no app-store build (PWA only).
- No paid LLM tiers; no native HealthKit integration (Apple Watch data arrives by manual entry, file import or an iOS Shortcut webhook).
- No medical advice: the calorie floor, fasting pattern and any change to them stay between Aaron, his doctor and his dietitian. The app enforces those rails; it never lowers them.

## 2. User constraints and baseline data

Everything below is seed data and hard rules. The AI reads them; it does not change them.

**Rails and preferences**

- Units: kg, cm, ml, kcal. Timezone America/Edmonton. Dates in the UI as 2026-10-04.
- Calories: 1,400 kcal/day, set with Aaron's doctor and dietitian. This is the floor. The AI may propose more (up to a configurable ceiling, default 1,700) in a weekly review; it never proposes less.
- Fasting: two 24-hour fasts per month on dates Aaron picks. A fast day is a known pattern, not a missed day.
- Meals: breakfast is normally skipped; lunch is the first meal. Default slots are Lunch, Dinner, Snack; Breakfast is hidden until toggled on. Meal plans use simple store-bought foods, few options.
- Training: Anytime Fitness, 4 sessions a week (Mon–Thu by default), machines and free-weight lifting only. Bodyweight and floor exercises (lunges, mountain climbers, burpees, planks and the like) are excluded by default. Aim: lean, toned, good upper-body strength, modest muscle gain.
- Inputs from Apple Watch: steps and sleep, by manual entry, file import or Shortcut webhook (section 8).

**Baseline: Evolt 360 scan, 2026-09-26 10:13** (sheet values in lb, converted at 0.4536 kg/lb; height 165 cm, age 31, male)

| Metric | Value | Sheet range | Flag |
| --- | --- | --- | --- |
| Weight | 95.1 kg | — | — |
| Lean body mass | 59.6 kg | 44.5–54.3 kg | High |
| Skeletal muscle mass | 32.5 kg | 24.8–30.4 kg | High |
| Protein | 11.3 kg | 8.9–10.9 kg | High |
| Mineral | 5.4 kg | 3.1–3.7 kg | High |
| Total body water | 42.9 kg | 32.5–39.7 kg | High |
| Intracellular fluid | 29.0 kg (68%) | — | — |
| Extracellular fluid | 13.9 kg (32%) | — | — |
| Body fat mass | 35.5 kg | 8.4–12.6 kg | High |
| Body fat % | 37.3% | 15–20% | High |
| Subcutaneous fat mass | 28.6 kg (30.1%) | — | — |
| Visceral fat mass | 6.9 kg (7.2%) | — | — |
| Visceral fat area | 188 cm² | 50–100 cm² | High |
| Visceral fat level | 16 | 1–9 balanced | Over range |
| BMR | 1,657 kcal | — | — |
| TEE | 2,551 kcal | — | — |
| Waist-to-hip ratio | 1.02 | 0.75–0.90 | High |
| Bio age | 38 (actual 31) | — | — |
| BWI score | 5.4 / 10 | 0–5.9 = poor | — |

**Segmental (kg)** — upper/lower unbalanced, left/right balanced

| Segment | Lean | Lean range | Fat | Fat range |
| --- | --- | --- | --- | --- |
| Left arm | 3.59 | 2.42–2.96 | 2.18 | 0.84–1.26 |
| Right arm | 3.49 | 2.42–2.96 | 2.29 | 0.84–1.26 |
| Torso | 27.7 | 18.2–22.3 | 20.5 | 6.9–10.4 |
| Left leg | 7.54 | 6.69–8.17 (optimal) | 5.23 | 1.86–2.79 |
| Right leg | 7.52 | 6.69–8.17 (optimal) | 5.35 | 1.86–2.79 |

The sheet's own nutrition line (1,857–1,957 kcal, 139–147 g protein) is the scanner's generic suggestion and is stored for reference only; the 1,400 kcal rail wins. Abdominal circumference was not measured (0 in).

**Seed record** (`seed/scans/2026-09-26.json`; the original sheet image is stored as the first `scans` row's attachment)

```json
{
  "scanned_at": "2026-09-26T10:13:00-06:00",
  "source": "evolt360",
  "source_units": "lb",
  "height_cm": 165.1,
  "age": 31,
  "sex": "male",
  "weight_kg": 95.1,
  "lean_body_mass_kg": 59.6,
  "skeletal_muscle_mass_kg": 32.5,
  "protein_kg": 11.3,
  "mineral_kg": 5.4,
  "total_body_water_kg": 42.9,
  "icf_kg": 29.0,
  "ecf_kg": 13.9,
  "body_fat_mass_kg": 35.5,
  "body_fat_pct": 37.3,
  "subcutaneous_fat_kg": 28.6,
  "visceral_fat_kg": 6.9,
  "visceral_fat_area_cm2": 188,
  "visceral_fat_level": 16,
  "bmr_kcal": 1657,
  "tee_kcal": 2551,
  "waist_hip_ratio": 1.02,
  "bio_age": 38,
  "bwi_score": 5.4,
  "segments": {
    "left_arm":  { "lean_kg": 3.59, "fat_kg": 2.18 },
    "right_arm": { "lean_kg": 3.49, "fat_kg": 2.29 },
    "torso":     { "lean_kg": 27.7, "fat_kg": 20.5 },
    "left_leg":  { "lean_kg": 7.54, "fat_kg": 5.23 },
    "right_leg": { "lean_kg": 7.52, "fat_kg": 5.35 }
  },
  "conditions": { "time_of_day": "morning", "fasted": null, "hours_since_training": null, "notes": "baseline" }
}
```

## 3. Goal model and forecasting

The goal is 65.0 kg by 2027-08-04 (10 months): 30.1 kg in 43 weeks, 0.70 kg/week on average. The app tracks two things, scale weight and body composition, because 30 kg of pure fat loss is not how a body behaves.

**Targets**

- Scale: trend weight (section 9) reaches 65.0 kg. Milestones at 90, 85, 80, 75, 70, 65 kg; each one records the date reached and the scan nearest to it.
- Composition: at 95.1 kg Aaron carries 35.5 kg fat and 59.6 kg lean. Reaching 65 kg with no lean loss would mean 8.5% body fat, which is not realistic; some lean mass (much of it water) will go. Target: body fat at or under 18% at goal (about 11.7 kg fat, 53.3 kg lean). Guard: if lean mass makes up more than 25% of the loss between two scans, flag it in the scan analysis and the weekly review (more protein, more lifting, fewer deficit extras).
- Composition milestones: visceral fat level 9 or lower; body fat under 30%, 25%, 20%; waist-to-hip ratio under 0.90; segmental torso fat under 10.4 kg.

**Pace**

- The forecast is computed, not drawn as a straight line. Initial estimate: scan TEE 2,551 kcal minus 1,400 kcal intake is a 1,150 kcal/day deficit, about 1.0 kg/week at 7,700 kcal per kg. That rate falls as weight and expenditure fall; the engine re-estimates expenditure weekly from the actual weight trend (section 9) and re-forecasts the finish date with a confidence band.
- Fast days enter the forecast as 0 kcal intake, as they are.
- Safety flags (shown, never silently applied): trend loss above 1% of bodyweight per week for 3 consecutive weeks; trend loss below 0.2 kg over 21 days with logging adherence at or above 80% (plateau); any week where protein averages under the target.

**Scans**

- Evolt scan every 4–6 weeks, same conditions each time (morning, fasted, no training the day before, normal hydration). The app records the conditions with each scan and reminds Aaron when one is due.
- Each scan re-anchors the composition milestones and the lean-loss guard; it does not override the trend weight (daily weigh-ins do that).

## 4. Architecture and stack

One pnpm monorepo deployed as a single Cloudflare Worker: it serves the React PWA as static assets, the REST API, the MCP endpoint and the job runner, with D1 (SQLite) for data, R2 for files and Cron Triggers for scheduled work. Everything runs on Cloudflare's free tier; LLM keys live only in Worker secrets.

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | React 19, Vite, TypeScript (strict), MUI | PWA via vite-plugin-pwa (installable, offline shell). Recharts for charts (SVG, prints cleanly). TanStack Query for server state, Zustand for UI state. Dexie (IndexedDB) for the offline log queue. @zxing/browser for barcodes. Web Speech API for voice logging. Outfit font self-hosted (section 11). |
| Hosting (web) | Workers static assets | The Vite build is served by the same Worker (`assets` binding in `wrangler.toml`); custom domain, HTTPS, no separate Pages project. |
| API | Hono on Cloudflare Workers | REST under `/api`, MCP under `/mcp` (stateless Streamable HTTP with `@hono/mcp` + `@modelcontextprotocol/sdk`; Cloudflare's `McpAgent` on Durable Objects is the fallback if sessions are ever needed), job runner in the same Worker. Public HTTPS, which the Claude custom connector needs. Zod schemas shared with the web app. |
| Database | Cloudflare D1 (SQLite), Drizzle ORM | Migrations with `wrangler d1 migrations` from `apps/worker/drizzle`. Free tier: 5 GB, 5 M reads and 100 k writes a day, far above one user's needs. |
| Storage | Cloudflare R2 | One private bucket with prefixes `meal-photos/`, `scan-sheets/`, `progress-photos/`, `reports/`. Files are served only through the Worker with short-lived signed URLs. 10 GB free. |
| Auth | Cloudflare Access (Zero Trust) | The site and `/api` sit behind an Access application allowing Aaron's email (one-time PIN or Google login); the Worker verifies the Access JWT on every request. `/mcp` and `/api/ingest/health` are excluded from the Access policy and check their own bearer tokens. No login screen to build. |
| Jobs | `ai_jobs` table + `ctx.waitUntil()` + Cron Triggers | A log request inserts its jobs and runs them in `waitUntil()` right after the response is sent, so analysis starts within seconds and no queue is needed. A Cron Trigger every 5 minutes sweeps queued or failed jobs. Nightly and weekly jobs are Cron Triggers in UTC (nightly 06:30 UTC; the Sunday-evening review at 03:00 UTC Monday) with the Edmonton date computed in code. |
| LLM | Provider router (section 9) | All providers are called with plain `fetch`; no SDK that needs Node APIs. |
| PDF | Cloudflare Browser Rendering (Puppeteer binding) | Renders the weekly report page to PDF into `reports/`. Free-tier minutes are limited, so the in-app Print button (browser print-to-PDF) is the everyday path and Browser Rendering the archive path. |
| Push | Web Push (VAPID) | A Workers-compatible web-push library (WebCrypto based); the service worker displays the notification. |
| Images | Browser only | Meal and progress photos are downscaled to 1,024 px and EXIF-stripped with canvas before upload; the Worker never processes images. |
| Tests | Vitest (engine, schemas; Worker routes with `@cloudflare/vitest-pool-workers`), Playwright (key flows against `wrangler dev`) | Engine math is unit-tested against fixtures. |

**Repo layout**

```text
fitness/
  apps/web/            React PWA (src/features/<module>, src/charts, src/muscle-map, src/theme.ts)
  apps/worker/         Hono app: /api, /mcp, jobs, cron handlers; wrangler.toml; drizzle migrations
  packages/shared/     Zod schemas, TypeScript types, engine (pure functions)
  packages/exercises/  free-exercise-db seed + muscle-group mapping + images (served as static assets)
  seed/                scans/2026-09-26.json, equipment/anytime-fitness.json
  docs/                this spec as SPEC.md, PROGRESS.md, CLAUDE.md pointers
```

**Request flow (one log)**

1. Aaron logs a meal in the PWA. If offline, the entry is queued in Dexie and synced later; the UI shows it as pending.
2. `POST /api/meals` validates with Zod, stores the meal in D1 (the photo, already downscaled in the browser, goes to R2), returns the row.
3. The Worker inserts `meal_analysis` (if photo/text needs parsing) and `day_adjustment` rows in `ai_jobs` and runs them in `ctx.waitUntil()` after responding.
4. The job runs through the router, validates the JSON output against the job's schema, and writes results: meal items with nutrition, then an `ai_events` row holding the adjustment and any proposal.
5. The PWA polls `GET /api/events?since=` every 15 s while open and on focus, and shows the result card: remaining macros, suggestions, or a proposal to accept.
6. Accepting a proposal creates a `plan_versions` row; reverting restores the previous one. Nothing in `daily_targets` changes without a version.

**Bindings and secrets**

Bindings in `wrangler.toml`: `DB` (D1), `FILES` (R2), `ASSETS` (static assets), `BROWSER` (Browser Rendering). Secrets via `wrangler secret put`: `GEMINI_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `MCP_BEARER_TOKEN`, `HEALTH_WEBHOOK_TOKEN`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`. Vars: `APP_ORIGIN`, `TZ_NAME=America/Edmonton`.

**Working conventions for Claude Code**

- Every file starts with a short comment on what it owns. Functions in `packages/shared/engine` are pure, typed and commented with the formula they implement.
- Zod schema first for every API body, job output and MCP tool input; types are inferred from the schema, never duplicated by hand.
- Theme tokens (colours, type scale, spacing, chart palette) live in `apps/web/src/theme.ts` only, and nothing else in the app hard-codes a colour: charts read the tokens so their SVG carries literal hex for print. The action colour is Facebook blue (`accent.main` `#166FE5`).
- No secrets in the web bundle. The web app talks only to `/api`.
- Local dev with `wrangler dev` (local D1 and R2); deploy with `wrangler deploy`; migrations run in CI before deploy.

## 5. Data model

Cloudflare D1 (SQLite), one database, `id` text primary keys holding UUIDs, `created_at`/`updated_at` ISO timestamps on every table, all quantities in kg, cm, ml, kcal and grams. A day in Aaron's timezone is an ISO date text column (`2026-10-04`); instants are ISO timestamps with offset. `jsonb` in the table below means a JSON text column.

| Table | Key columns | Notes |
| --- | --- | --- |
| `profile` | height_cm, birth_date, sex, timezone, goal_weight_kg, goal_date, start_weight_kg, start_date | One row. |
| `settings` | calorie_floor (1400), calorie_ceiling (1700), protein_min_g, fat_min_g, fibre_target_g, water_target_ml, training_days (jsonb), breakfast_enabled, auto_apply_safe (bool), scan_interval_days | The rails. Changes are logged in `ai_events` with actor `user`. |
| `weight_logs` | date (unique), weight_kg, note | Daily weigh-in. Trend is computed, not stored. |
| `measurements` | date, site (neck, chest, waist_navel, hips, left_arm, right_arm, left_thigh, right_thigh), value_cm | Weekly tape. |
| `water_logs` | logged_at, amount_ml | Quick-add entries; day totals computed. |
| `sleep_logs` | date, in_bed_at, woke_at, asleep_min, source (manual, import, watch_webhook), stages jsonb | One row per night (date = wake date). |
| `step_logs` | date (unique), steps, active_kcal, source | From Apple Watch routes. |
| `fast_logs` | started_at, ended_at, planned (bool), note | 24 h fasts; a day overlapping an active fast is a fast day. |
| `foods` | source (off, cnf, usda, llm, user), source_id, barcode, name, brand, serving_g, kcal_per_100g, protein_g, carbs_g, fat_g, fibre_g, sugar_g, sodium_mg, raw jsonb | Cache of nutrition lookups; user-created foods live here too. |
| `favorites` | food_id or recipe jsonb, label, default_grams, sort_order | One-tap repeat meals. |
| `meals` | date, slot (breakfast, lunch, dinner, snack), eaten_at, input_method (text, photo, voice, barcode, favorite, manual), raw_text, status (parsing, review, confirmed) | Totals computed from items. |
| `meal_items` | meal_id, food_id, description, grams, kcal, protein_g, carbs_g, fat_g, fibre_g, confidence (0–1), estimated (bool) | `estimated=true` when no DB match and the LLM guessed. |
| `meal_photos` | meal_id, storage_path, width, height, exif_stripped (bool) | Private bucket. |
| `daily_targets` | date, plan_version_id, kcal, protein_g, carbs_g, fat_g, fibre_g, water_ml, steps, is_fast_day, training_planned | Materialised per day from the active plan version and the active week plan; rebuilt when either changes. |
| `plan_versions` | version (int), active (bool), created_by (user, ai, mcp), reason, diff jsonb, targets jsonb (defaults + per-weekday overrides), forecast jsonb (finish_date, weekly_rate, band) | Append-only. Revert = new version copying an old one. |
| `week_plans` | week_start (date, unique per status active), author (claude_mcp, gemini, user), status (proposed, active, superseded), plan jsonb (targets by weekday, sessions by weekday as template snapshots, water_ml, steps, fast_dates, scan_date, focus_note), plan_version_id, review_id | The active row for a week is the source of that week's `daily_targets` and planned sessions. |
| `milestones` | kind (weight, body_fat_pct, visceral_level, whr, segment), target_value, reached_on, scan_id | Seeded from section 3. |
| `exercises` | slug, name, category, equipment, mechanic, force, level, primary_muscles text[], secondary_muscles text[], instructions text[], image_paths text[], video_search_url, gif_url, source | Seeded from free-exercise-db. |
| `equipment_profile` | equipment (enum from library), status (have, dont_have, dislike, cant_use), note | Seeded with an Anytime Fitness default list. |
| `exercise_exclusions` | exercise_id or category, reason | Hard excludes (e.g. all bodyweight). |
| `workout_templates` | name, origin (custom, ai), notes, muscle_scores jsonb | Reusable workouts. |
| `template_exercises` | template_id, exercise_id, order, sets, rep_min, rep_max, target_load_kg, rest_sec, note | — |
| `workout_sessions` | date, template_id, started_at, ended_at, origin (template, ai, blank), readiness jsonb, notes, muscle_scores jsonb, prs jsonb | One per gym visit. |
| `session_sets` | session_id, exercise_id, set_index, reps, load_kg, rpe, completed, note | The reps/sets log. |
| `scans` | scanned_at, source, storage_path, extracted jsonb, confirmed (bool), conditions jsonb, all metric columns from the seed record | One row per Evolt scan. |
| `scan_segments` | scan_id, segment, lean_kg, fat_kg | Five rows per scan. |
| `progress_photos` | taken_at, pose (front, side, back), storage_path, weight_kg, nearest_scan_id, note | Never sent to any LLM. |
| `ai_jobs` | type, status (queued, running, done, failed), payload jsonb, result jsonb, provider, model, attempts, error, latency_ms, run_after | The queue and the audit trail. |
| `ai_events` | kind (adjustment, proposal, review, note, change), actor (ai, user, mcp), summary, body jsonb, proposal_status (pending, accepted, rejected, auto_applied), plan_version_id, read_at | What the dashboard shows and what MCP reads. |
| `chat_messages` | thread_id, role, content, tool_calls jsonb | Ask AI history. |
| `weekly_reviews` | week_start (date, unique), metrics jsonb, narrative, author (claude_mcp, gemini), proposals jsonb, pdf_path | Printable summary source. |
| `push_subscriptions` | endpoint, keys jsonb, kinds text[] | Reminder targets. |

A `v_day` SQL view joins weight, intake totals, water, steps, sleep, fasting, sessions and targets per date; the dashboard, the weekly review and `get_today` all read from it so the numbers agree everywhere.

## 6. Features: dashboard, weigh-ins, nutrition, water, fasting

Logging must take under 10 seconds for the common case; everything else follows from that.

**Dashboard (Today tab)**

- Header: trend weight, change since start, kg to go, projected finish date (from the active plan version).
- Today rings: calories remaining (of 1,400), protein, water, steps; sleep last night; fast-day badge when active.
- Hero chart: weight trend with forecast band and milestones (section 11 has the full chart inventory).
- "This week" card from the active week plan: today's targets, today's planned session with its muscle map thumbnail, and what changed from last week.
- Latest AI note or pending proposal, with Accept / Reject / Why.
- Quick-log row: weigh-in, meal, water, fast start/stop, photo.

**Weigh-ins and measurements**

- One weigh-in per day (morning, after the bathroom; editable). Missing days are interpolated for the trend only, never stored.
- Trend weight = exponentially weighted moving average (section 9) shown next to the raw value; the raw value is de-emphasised in the UI.
- Tape measurements weekly: neck, chest, waist at navel, hips, both arms, both thighs, in cm. Waist and waist-to-hip ratio chart alongside weight.

**Nutrition logging**

- Slots: Lunch, Dinner, Snack (Breakfast hidden; toggle in settings). Each slot shows planned vs logged.
- Five input methods: free text ("2 eggs, toast with butter, black coffee"), photo (camera or gallery, multiple), voice (Web Speech API to text, then the text path), barcode (ZXing, Open Food Facts lookup), favourites and recents (one tap, adjust grams).
- Pipeline for text/photo: `meal_analysis` job → list of items with grams and a confidence → each item matched against `foods` (Open Food Facts for packaged goods, the Canadian Nutrient File for generic foods, cached locally) → unmatched items get an LLM estimate flagged `estimated` → the meal lands in `review` status with an editable item list → Aaron confirms (or auto-confirm after 10 min for high-confidence meals).
- After confirm, `day_adjustment` returns: remaining kcal and macros, protein status, two or three next-meal suggestions drawn from favourites that fit the remainder, and a one-line note if the day is over budget or protein is short. Shown as a card, never as a nag.
- Favourites support simple recipes (a list of foods with grams) so a repeated dinner is one tap.
- Targets per day come from `daily_targets`: 1,400 kcal; protein default 130 g (adjustable; about 2.2 g per kg of lean mass); fat minimum 45 g; fibre 30 g; carbs are the remainder. The weekly review may propose moving protein or redistributing calories across the week within the rails.

**Water**

- Target default 3,000 ml (adjustable). Quick-add chips 250 / 500 / 750 ml plus a custom amount; the ring fills on the dashboard.
- Optional reminders every 2 hours between 09:00 and 21:00 when behind pace; on fast days the cadence tightens to 90 minutes.

**Fasting**

- Plan the two monthly 24 h fasts on a calendar; start and stop with one tap (planned fasts can start automatically at the planned time).
- A fast day: meal nags off, intake expected 0, water target up, the training plan avoids a heavy session that day (AI suggests rest or a light session), the weekly review reports the fast as completed/partial with its real duration.
- Fasting history appears as a calendar strip on the Progress tab.

## 7. Features: training

Every workout, AI-built or custom, is a list of exercise IDs from one library, so images, video links, muscle tags and the muscle map come for free.

**Exercise library**

- Seed from the open-licence free-exercise-db JSON (about 870 exercises; fields: name, category, equipment, mechanic, force, level, primaryMuscles, secondaryMuscles, instructions, two step images each). Images are copied into `packages/exercises/images` and served statically.
- Muscle enum (17): abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes, hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps. The muscle map uses the same keys.
- Each exercise also gets `video_search_url` (a YouTube search for "<name> form") and an optional `gif_url` (ExerciseDB) filled in later; the detail sheet shows step images, instructions, the video link and the muscles highlighted.
- Aaron can add his own exercises (gym-specific machines) with a photo and muscle tags.

**Equipment profile**

- Every equipment value in the library (barbell, dumbbell, cable, machine, kettlebell, bands, e-z curl bar, medicine ball, exercise ball, body only, other) plus named machines Aaron adds (leg press, pec deck, lat pulldown, hack squat, etc.) has a status: have, don't have, dislike, can't use, with an optional note ("left shoulder").
- Category and exercise exclusions: `body only` and floor-based exercises excluded by default; any single exercise can be hidden forever from its detail sheet.
- The library view filters to allowed exercises by default; the AI only ever receives the allowed list.

**Workout builder (custom workouts)**

- Search and filter by muscle, equipment, category and level; tap to add; per exercise set count, rep range (min–max), target load in kg, rest seconds, note; drag to reorder.
- Save as a template with a name; duplicate; edit later. Templates carry a `muscle_scores` snapshot so the list shows a mini muscle map per template.
- "Fill with AI": from a partial list (say two chest exercises), the `workout_fill` job completes a balanced session using the equipment profile.

**AI workouts**

- `workout_generate` inputs: allowed exercises, equipment profile, training days (Mon–Thu), templates and the last 14 days of sessions (volume per muscle, PRs), readiness (last night's sleep, yesterday's steps, days since the last session), fast-day flag, and the goal (fat loss with muscle retention, upper-body strength).
- Output: a session in the template format (exercise IDs only, sets, rep ranges, suggested loads from history, rest) plus a two-line rationale. The user sees it as a preview with the muscle map, can swap any exercise (suggestions filtered to the same primary muscle), then starts or saves it as a template.
- Weekly structure default: upper / lower / upper / lower across Mon–Thu, adjustable; the AI respects it unless Aaron changes it.

**Session logging (sets and reps)**

- Start from a template, an AI suggestion, the week plan's session, or blank. Each exercise shows last session's sets (reps × kg) greyed in, so logging is tap-to-copy then edit.
- Per set: reps, load kg, optional RPE 6–10, done toggle. Add or remove sets; add an exercise mid-session; rest timer with push notification when the rest ends; notes per exercise.
- Finish: duration, total volume (sets × reps × kg), volume per muscle group, PRs detected (best load at a rep count, best estimated 1RM by Epley), the muscle map of what was trained, and a one-tap "save as template".

**Muscle map**

- An SVG body, front and back, with one `<path>` per muscle group keyed by the enum above (own asset in `apps/web/src/muscle-map`).
- Score per muscle for any workout = Σ over exercises of sets × (1.0 if primary, 0.5 if secondary). Colour scale: none, light, medium, heavy (quantile thresholds, legend shown).
- Shown in: the builder (live as exercises are added), AI previews, session summary, template cards, the week plan, and the Progress tab as a weekly volume map with a 7-day slider.

**Progression and recovery (engine rules, not LLM)**

- Double progression: when every working set of an exercise reaches the top of its rep range at a load in two consecutive sessions, suggest +2.5 kg (upper body, dumbbells) or +5 kg (lower body, machines by stack increment). The suggestion appears as the greyed default next session.
- Deload: every 6–8 weeks, or when two consecutive sessions miss the rep minimum on most sets, propose one week at 60% of sets.
- Recovery: no muscle group trained as a primary target on consecutive days; a day after under 5 h sleep gets a reduced-volume suggestion.
- Strength charts per exercise (load and estimated 1RM over time) live on the Progress tab.

## 8. Features: scans, Apple Watch data, photos, weekly review, Ask AI, MCP, reminders, export

**Evolt scans**

- Upload the result sheet as PDF, PNG or JPG (shared from the Evolt Active app or saved from app.evoltactive.com; there is no consumer API). The name field is masked client-side before upload.
- `scan_extract` (the vision chain) returns the full metric set from section 2 as JSON, in the sheet's units, with a confidence per field; the Worker converts to kg and opens a review form with every value editable. Aaron confirms; a manual-entry form covers a failed extraction.
- Conditions captured with each scan: time of day, fasted, hours since last training, hydration note, and whether they match the baseline conditions.
- `scan_analysis` compares the new scan with the previous one and the baseline: fat lost vs lean lost (and the 25% lean-loss guard from section 3), visceral fat level and area, segmental fat change per limb and torso, water shift (a lean-mass drop with a matching water drop is flagged as hydration, not muscle). Output: a short narrative, milestone updates, and proposals (protein, volume, cardio) for the plan.
- Scan-due reminder at the chosen interval; the Progress tab charts every metric across scans.

**Apple Watch: sleep and steps**

- Route 1, manual: a daily form (steps; in-bed and wake times or hours asleep). Thirty seconds, always available.
- Route 2, file import: upload CSV or JSON from an export app (Health Auto Export or similar) or the Apple Health export; a mapping screen picks the columns for date, steps, sleep start/end/asleep minutes; rows upsert by date.
- Route 3, webhook: `POST /api/ingest/health` with `Authorization: Bearer <HEALTH_WEBHOOK_TOKEN>` and `{date, steps, sleep: {in_bed_at, woke_at, asleep_min}}`, called by an iOS Shortcut automation each morning that reads yesterday's Health data. Idempotent by date.
- Used by: readiness for workouts, the weekly review, the expenditure sanity check (a week of very low steps with a stalled trend is called out), and the sleep and steps charts.

**Progress photos**

- Front, side and back, with a faint pose overlay for consistency; stored in a private bucket; each photo tagged with the day's trend weight and the nearest scan.
- Views: grid by date; compare any two (side-by-side and slider); a monthly strip. Never sent to any LLM; export packs them into the user's export zip only.

**Weekly review and printable summary**

- Sunday 20:00 (03:00 UTC Monday): the engine aggregates the week from `v_day` (trend change, average intake and macros, protein adherence, water, steps, sleep, sessions done vs planned, volume per muscle, PRs, fasts, logging adherence). The `weekly_review` job turns it into a narrative plus proposals inside the rails, unless a Claude review (below) already ran that week.
- Page `/reports/week/<YYYY-Www>`: a print-ready layout (Letter, 15 mm margins, charts as SVG, page breaks between sections) with weight trend, intake vs target, macros, water, steps, sleep, training volume map, PRs, fasts, scan deltas if any, the narrative, the proposals with their status, and next week's plan. "Print" opens the browser dialog; "Save PDF" asks the Worker to render the same page with Browser Rendering and store it in `reports/`.
- Past reviews list on the Progress tab; each opens the page and its PDF.

**Ask AI (in-app)**

- A chat panel on every tab. Function calling on the model chain against the tools layer (section 10): it can read any data and answer ("what did I average for protein in September?") or change things ("swap Thursday to a pull day", "raise water to 3.5 L"). Aaron can delete a chat from the past-chats list.
- Writes are proposals that need a tap unless `auto_apply_safe` is on, in which case meal suggestions, workout swaps and reminder changes apply at once and target changes still wait.
- History kept in `chat_messages`; the panel shows which tools were called.

**MCP connector**

- `/mcp` on the Worker, Streamable HTTP, `@modelcontextprotocol/sdk`, authenticated by `Authorization: Bearer <MCP_BEARER_TOKEN>`. Add it in Claude as a custom connector with the token as a request header; the server must be public HTTPS because Claude connects from Anthropic's cloud.
- Exposes the same tools as Ask AI plus resources `fitness://today`, `fitness://plan`, `fitness://week/<YYYY-Www>`; writes through MCP are recorded with actor `mcp` and follow the same rails and proposal rules.

**Coach reviews through MCP (Claude as the senior coach)**

Claude connected through the custom connector can read the whole app and change it, inside the same rails. The design makes Claude the senior coach and the routed free models the real-time clerk.

- Division of labour: the primary routed model (free, fast, vision) runs the per-log jobs: meal parsing, day adjustment, scan extraction, nightly reforecast. Claude (Fable or Opus, via MCP) does the judgement work on demand: the weekly review, scan debriefs, program design and rebuilds, plateau diagnosis, rewriting the plan, next week's recommendations. A free model's size is not a problem for structured parsing; it is the wrong one for coaching, and Claude is the right one.
- One-call read: `get_review_bundle(from, to)` returns one compact JSON (about 10–20 KB, aggregates only): profile and rails, active plan and forecast, weekly trend points, intake and macro averages, protein adherence, water, steps, sleep, fasts, sessions and volume per muscle, PRs, the latest scan deltas and the lean-loss guard, open proposals, upcoming fast and scan dates. Raw detail on demand through `query_metric`, `get_training_history`, `get_scan`.
- One-unit write: `apply_review({ summary, narrative, changes[] })` applies a batch of changes as one plan version and one review event, so a whole Claude review can be reverted with one tap (`revert_review`). Changes may touch daily targets (within rails), the weekly split and templates, exercise swaps, equipment statuses, the water target, reminder times, milestones, planned fasts, the next scan date, and the dashboard note. Never the rails in `settings`.
- Trust: Aaron is in the chat and approves with Claude before it applies, so `mcp` writes apply at once (no second tap in the app) but are versioned, logged with actor `mcp`, and bound by the same guardrails as every other write.
- MCP prompts shipped by the server, so Claude knows the procedure without Aaron re-explaining it: `coach_review` (weekly: read the bundle, check rails, lean-loss guard, protein, volume per muscle vs the last block, sleep and steps against the trend, fasts and scan due; then propose and apply, and end with next week's plan), `scan_debrief` (after a confirmed scan), `program_design` (build or rebuild the Mon–Thu plan from the equipment profile and history), `plateau_check`.
- Dashboard: `set_dashboard_note(text, until?)` pins Claude's note to the top of Today; when a Claude review ran that week, its narrative replaces the AI draft's in `weekly_reviews`, so the printed summary carries Claude's words.
- How it runs: in any Claude chat (web, desktop, mobile) with the connector on, "run my coach review" invokes the prompt; Claude reads, discusses, and applies on approval. Aaron may also schedule it from Claude if scheduled tasks on his plan can call the connector.
- Later option: route the in-app Ask AI to Claude through the Claude API instead of the free router. Out of scope while the free-tier constraint stands; the tools layer already makes it a one-adapter change.

**Next-week plan (weekly recommendations)**

Every week the app holds one `week_plans` row for the coming Monday to Sunday, and Claude through MCP is its intended author.

- Contents: per-day calories and macros (within the rails), water target, the four training sessions as templates (exercise IDs, sets, rep ranges, suggested loads), a steps target, planned fasts, the scan date if one is due, and a short focus note ("protein first; add a third set on leg press; Thursday is a fast day, keep it light").
- Author: the `coach_review` prompt ends by calling `propose_week_plan(week_start, plan)`; Aaron approves in chat and Claude calls `apply_week_plan(id)`. If no Claude review has run by Sunday 20:00, the `weekly_review` job fills a draft whose author id is `gemini` — the stored id for "an AI wrote this, whichever model" — so the week never starts without a plan; a later Claude run supersedes it.
- Effect: accepting a week plan is what sets the week. Each day's `daily_targets` and the Train tab's planned session come from the active week plan; mid-week edits (a swapped session, a moved fast) change the active row and are versioned like any plan change.
- Where it shows: a "This week" card on Today (today's targets, today's session with its muscle map thumbnail, what changed from last week) and a full week view on the Progress tab, with last week's actuals beside it.
- Status: proposed → active → superseded. Weekly recommendations can also be run on demand ("plan my week again, I'm travelling Wednesday") and apply the same way.

**Reminders (Web Push)**

- Defaults: weigh-in 07:00, water when behind pace, workout 16:30 on training days, fast start/end, scan due, weekly review ready, rest timer end. All times editable; any kind can be off.

**Export and backup**

- One tap: zip of CSV per table plus `full.json` and the photos; monthly automatic backup to `reports/`. Import of a previous export restores a fresh instance.

## 9. AI layer and engine

The engine computes; the LLM reads the computed state and proposes. Every LLM call returns JSON validated against a Zod schema, and nothing an LLM returns touches the database without passing the guardrails in code.

**Providers (free tiers, as of 2026-10-04; limits change, so they live in `apps/worker/src/ai/providers.json`)**

| Provider | Models | Role | Known limits |
| --- | --- | --- | --- |
| OpenRouter (`:free`) | Free models with tool calling and vision | Primary for every chain: meal parsing, classification, vision for meal photos and scan sheets | 20 RPM; 50 requests/day account-wide (1,000 after a one-time $10 top-up), so the daily cap is reached before any Gemini fallback |
| Google AI Studio (Gemini) | Gemini Flash (vision, function calling); Flash-Lite for cheap classification | First fallback once OpenRouter's daily cap is spent | Flash and Flash-Lite only on the free tier since April 2026; roughly 5–15 requests/min and up to 1,000/day; free-tier data may be used by Google |
| Z.ai (Zhipu) | GLM-4.7-Flash, GLM-4.5-Flash; GLM-4.6V-Flash for vision | First text fallback; vision fallback | Free API models |
| OpenRouter `:free` | DeepSeek V4 Flash, Kimi K2.6, Qwen, GLM-4.5-Air, MiniMax M2.5 | Second fallback, model experiments | 50 requests/day; 1,000/day after a one-time $10 top-up |
| Groq | Qwen, Kimi, Llama | Fast text fallback | Free tier with daily caps |

DeepSeek's own API and Kimi's API are paid, so they are reached only through OpenRouter's free models. Claude is not in this table because it is not called by the Worker: it reaches the same data through the MCP connector from Aaron's own Claude chats (section 8) and takes the review, program-design and plan-rewrite work that a Flash-class model should not be trusted with.

**Router**

- One interface: `complete({ system, messages, images?, tools?, schema, maxTokens })` with adapters per provider (OpenAI-compatible where offered). Chain per job type: OpenRouter `:free` → GLM → Gemini Flash → Groq; vision jobs: OpenRouter → GLM-4.6V → Gemini Flash.
- Per-provider token buckets (RPM and RPD from `providers.json`), queue with priority (user-facing jobs first), retry with backoff on 429/5xx, failover on schema-validation failure after one repair attempt.
- Every job row stores provider, model, latency, token counts and the validated output; a daily budget guard stops non-urgent jobs (nightly summaries) when 80% of a provider's daily quota is used.
- Expected load: 10–30 calls a day. Event-driven only; no polling the model.

**Job types**

| Job | Trigger | Output schema (abridged) | Writes |
| --- | --- | --- | --- |
| `meal_analysis` | meal logged by text/photo/voice | `{ items: [{ name, grams, confidence, candidates: [{source, source_id}] }], notes }` | `meal_items` (after food matching) |
| `day_adjustment` | meal confirmed; fast started | `{ remaining: {kcal, protein_g, carbs_g, fat_g}, status: ok/over/protein_short, suggestions: [{ favorite_id or description, grams, why }], note }` | `ai_events` (adjustment) |
| `workout_generate` / `workout_fill` | user asks; nightly for next training day when no week plan covers it | `{ exercises: [{ exercise_id, sets, rep_min, rep_max, load_kg, rest_sec }], rationale, muscle_scores }` | `ai_events` (proposal) → template/session on accept |
| `scan_extract` | scan uploaded | the seed-record shape with `confidence` per field and `units` | `scans.extracted` (pending confirm) |
| `scan_analysis` | scan confirmed | `{ narrative, fat_vs_lean: {fat_kg, lean_kg, water_kg}, flags: [], milestone_updates: [], proposals: [] }` | `ai_events`, `milestones` |
| `weekly_review` | Sunday 20:00, only if no Claude review ran that week | `{ narrative, highlights: [], concerns: [], proposals: [{ field, from, to, reason }], week_plan }` | `weekly_reviews`, `ai_events`, `week_plans` (proposed, author `gemini` = an AI draft) |
| `ask_ai` | chat message | function-calling loop over the tools layer | `chat_messages`, proposals as above |
| `plan_reforecast` | nightly (engine only, no LLM) | forecast object | `plan_versions.forecast`, `daily_targets` |

**Guardrails (enforced in `packages/shared/engine/guards.ts`)**

- Proposed kcal never below `calorie_floor` or above `calorie_ceiling`; protein never below `protein_min_g`; fat never below `fat_min_g`.
- Only exercise IDs in the allowed set; sets per session 12–28; no excluded category.
- A single proposal may move daily kcal by at most 150; larger moves are split across weeks.
- Auto-apply only for kinds in the safe list (meal suggestions, exercise swaps within the same primary muscle, reminder times); everything else waits for a tap. Every applied change creates a `plan_versions` row with the proposal as `reason` and a `diff`.
- The LLM never sees the name, photos of Aaron, or raw EXIF; meal photos are downscaled to 1,024 px and stripped before upload.

**Engine (pure functions, unit-tested with fixtures)**

- Trend weight: EWMA with α = 0.25 over daily weigh-ins; gaps carry the last trend forward with no update. Show the 7-day change of the trend, not of the raw weight.
- Adaptive expenditure: over a trailing 14-day window with at least 10 logged intake days, `tdee_est = mean_intake + (trend_start − trend_end) × 7,700 / days`. Clamp to 1,200–4,500 and smooth with the previous estimate (50/50). Start value: 2,551 kcal from the scan.
- Forecast: `weekly_rate = (tdee_est − target_kcal) × 7 / 7,700`; weeks to goal from the current trend; band = ±20% of the rate. Re-run nightly; the finish date on the dashboard comes from here.
- Plateau: trend change under 0.2 kg across 21 days with logging adherence at or above 80%. Raises a review flag that suggests a conversation with the dietitian (diet break, refeed); the app proposes nothing below the floor.
- Readiness: 0–100 from last night's sleep (hours vs 7.5), yesterday's steps vs the 14-day median, and days since the last session; under 40 suggests reduced volume.
- Progression and deload rules as in section 7; PRs by Epley estimated 1RM = load × (1 + reps / 30).
- Adherence: share of days with a weigh-in, at least two logged meals or a fast, and water logged.

## 10. API and the shared tools layer

The REST API serves the PWA; the tools layer is a typed module (`apps/worker/src/tools/*.ts`) that both Ask AI (function calling on the model chain) and the MCP server expose, so Claude and the in-app assistant can do exactly the same things.

**REST (`/api`, JSON, Cloudflare Access JWT)**

| Area | Endpoints |
| --- | --- |
| Day | `GET /day/:date` (from `v_day`), `GET /events?since=` |
| Weight and body | `POST/PUT /weights`, `POST /measurements`, `GET /trend?from&to` |
| Nutrition | `POST /meals`, `PATCH /meals/:id` (items, confirm), `DELETE /meals/:id`, `POST /meals/:id/photos`, `GET /foods/search?q=&barcode=`, `POST /foods`, `GET/POST/PATCH /favorites` |
| Water and fasting | `POST /water`, `POST /fasts/start`, `POST /fasts/:id/end`, `GET /fasts` |
| Health inputs | `POST /sleep`, `POST /steps`, `POST /imports/health` (file + mapping), `POST /ingest/health` (webhook token) |
| Training | `GET /exercises?muscle&equipment&q`, `POST /exercises`, `GET/PUT /equipment`, `POST /exclusions`, `GET/POST/PATCH /templates`, `POST /sessions`, `POST /sessions/:id/sets`, `PATCH /sets/:id`, `POST /sessions/:id/finish`, `GET /history/exercises/:id` |
| Plan and AI | `GET /plan`, `GET /plan/versions`, `POST /plan/versions/:id/restore`, `POST /proposals/:id/accept`, `POST /proposals/:id/reject`, `GET/POST /week-plans`, `POST /week-plans/:id/apply`, `POST /ai/workout` (generate/fill), `POST /ai/chat`, `GET /jobs/:id` |
| Scans and photos | `POST /scans` (file), `PATCH /scans/:id` (confirm with edits), `GET /scans`, `POST /photos`, `GET /photos?pose&from&to` |
| Reviews and export | `GET /reviews`, `GET /reviews/:week`, `POST /reviews/:week/pdf`, `GET /export.zip`, `POST /import` |
| Settings and push | `GET/PATCH /settings`, `POST /push/subscribe` |

**Tools layer (Ask AI and MCP share these; inputs and outputs are Zod schemas)**

| Tool | Purpose |
| --- | --- |
| `get_today(date?)` | Everything for a day: targets, intake, remaining, water, steps, sleep, fast state, session, pending proposals. |
| `get_trend(from, to)` | Raw and trend weights, waist, forecast. |
| `get_plan()` / `list_plan_versions()` / `restore_plan_version(id)` | The active plan, its history, revert. |
| `propose_plan_change(changes[], reason)` | Creates a proposal (guardrails applied); returns what would change. |
| `apply_proposal(id)` / `reject_proposal(id)` | Resolve a pending proposal. |
| `log_weight(date, kg)` · `log_measurement(date, site, cm)` · `log_water(ml, at?)` | Simple logs. |
| `log_meal(slot, items[] or text, date?)` · `confirm_meal(id, items[])` · `search_foods(q or barcode)` | Nutrition. |
| `start_fast(at?)` · `end_fast(at?)` · `plan_fast(date)` | Fasting. |
| `log_sleep(...)` · `log_steps(date, steps)` | Health inputs. |
| `list_exercises(filters)` · `get_exercise(id)` · `get_equipment_profile()` · `update_equipment(items[])` | Library and equipment. |
| `create_template(...)` · `generate_workout(options)` · `start_session(template_id?)` · `log_set(...)` · `finish_session(id)` · `get_training_history(from, to, exercise_id?)` | Training. |
| `list_scans()` · `get_scan(id)` · `compare_scans(a, b)` | Scans. |
| `get_weekly_review(week)` · `list_reviews()` | Reviews. |
| `query_metric(metric, from, to, agg)` | Read-only time series for any stored metric (kcal, protein, water, steps, sleep, volume, trend). |

**Review and week-plan tools and prompts (MCP first; Ask AI may use them too)**

| Tool or prompt | Purpose |
| --- | --- |
| `get_review_bundle(from, to)` | One compact JSON with everything a coach needs for the period: aggregates, deltas, flags, open proposals, upcoming dates. |
| `apply_review({ summary, narrative, changes[] })` | Applies a batch of changes as one plan version and one review event; returns the diff and the new version id. |
| `revert_review(review_id)` | Restores the plan version from before that review. |
| `set_dashboard_note(text, until?)` | Pins a coach note to the top of Today. |
| `schedule_scan(date)` · `plan_fast(date)` | Sets the next scan and fast dates and their reminders. |
| `create_template(...)` · `replace_week_plan(templates_by_weekday)` | Program design: set or rebuild the Mon–Thu plan. |
| `get_week_plan(week_start?)` | The active or proposed week plan with last week's actuals beside it. |
| `propose_week_plan(week_start, plan)` | Validates the plan against the rails and the allowed exercise set; stores it as proposed. |
| `apply_week_plan(id)` · `revert_week_plan(id)` | Activates a proposed plan (rebuilds `daily_targets` for those seven days, sets the Train tab's planned sessions) or restores the previous active one. |
| Prompts `coach_review`, `scan_debrief`, `program_design`, `plateau_check` | Server-shipped procedures: what to read, what to check, what may change, how to present it before applying. |

All changes through `apply_review` and `apply_week_plan` pass the guardrails in section 9; a change that fails a rail is dropped from the batch and reported back, the rest applies. MCP resources `fitness://today`, `fitness://plan`, `fitness://week/<YYYY-Www>` return the same JSON as the matching tools. All write tools record `actor` (user, ai, mcp) and go through the guardrails; none can change `settings` rails.

## 11. UI, charts and print

Mobile-first, five bottom tabs, one theme file, and a chart inventory large enough that the Progress tab feels like a real dashboard.

**Navigation**

- Tabs: Today, Log, Train, Progress, AI. A floating quick-log button on Today and Log.
- Phone width first (390 px), then a two-column tablet/desktop layout for Progress. Tap targets 44 px; no horizontal scroll; sticky bottom nav.
- Design direction: clean, bright, minimal. White cards on a near-white page, generous whitespace, 16 px card radius with a hairline border and no shadows, one large number per card, text in two greys. Colour is reserved for data: every chart, ring, heatmap and the muscle map is colourful, and the colours are coordinated by metric (below). Light theme is the product; dark is a later option.

**Typography and palette (`theme.ts`)**

- Font: Outfit, self-hosted as woff2 in the static assets so the PWA works offline. Weights: 400 body, 500 labels and buttons, 600 headings, 700 big numbers. Sizes: body 16 px, labels 13 px, section titles 20 px, big numbers 32–40 px with tabular figures.
- Ink: text #1A1A2E, secondary #6B7280, borders #E5E7EB, cards #FFFFFF, page #FAFAFC.
- The action colour is Facebook blue `#166FE5` (`accent.main`), with `#0B5FCE` for hover/pressed and `#3B82F6` for icons and gradients that never carry text.
- One colour per metric, used identically in rings, charts, the report and legends: weight `#166FE5` (the brand blue, forecast band the same at 12 %); calories `#C2410C`; protein `#7C3AED`; carbs `#A16207`; fat `#0E7490`; water `#0369A1`; steps `#15803D`; sleep `#4338CA`; fat mass `#9D174D`; lean `#047857`; fasting `#475569`. The metric cards carry the matching two-stop gradient, measured at ≥4.5:1 for white text at both stops. Semantic good/warning/flag `#15803D` / `#B45309` / `#DC2626` are used only for status, never for a metric.
- Muscle map: four steps of the brand blue from 12 % to 100 % opacity over a light grey body; the legend uses the same four chips.
- Chart style: gridlines #F1F5F9 only, 2 px lines, 12% area fills, 4 px rounded bar tops, targets as dashed grey lines, values on tap, legends as colour chips under the title, no 3D, no gradients.
- Theme tokens are the single source of colour: every chart, ring, card and illustration derives from them, so a palette change is one file.

**Chart inventory (Recharts unless noted)**

| Chart | Type | Data | Where |
| --- | --- | --- | --- |
| Weight trend with forecast | line + band + milestone markers | daily raw (dots), trend (line), forecast band to goal | Today hero, Progress, weekly report |
| Weekly loss vs expected | bars about zero | trend change per week vs forecast rate | Progress, report |
| Calories vs target | stacked bars + target line | kcal per day by slot | Progress, report |
| Macros | stacked bars (g) with protein target line | daily protein/carbs/fat | Progress, report |
| Protein adherence | heatmap calendar | days at or above target | Progress |
| Water | bars + target line; today ring | ml per day | Today ring, Progress |
| Steps | bars + 14-day median line | steps per day | Progress, report |
| Sleep | bars (hours) + bedtime scatter | asleep_min, in_bed_at | Progress, report |
| Fasting | calendar strip | planned vs completed fasts, duration | Progress |
| Body composition across scans | lines, two series | fat mass and lean mass per scan | Progress, scan page |
| Body fat % and visceral level | line + gauge for latest | per scan | Scan page |
| Segmental fat change | grouped bars per segment | fat kg at baseline vs latest | Scan page, report |
| Waist and WHR | line | measurements | Progress |
| Muscle map | custom SVG | weekly volume per muscle | Train, Progress, report |
| Training volume per week | stacked bars by muscle group | sets × reps × kg | Progress |
| Strength per exercise | line (load and est. 1RM) | session_sets | Exercise detail |
| Adherence | heatmap calendar | logging adherence score | Progress |
| Milestone timeline | custom SVG | milestones with reached dates | Progress, report |
| Week plan vs actuals | grouped bars per weekday | planned vs eaten kcal, planned vs done sessions | Progress (week view), report |

- Every chart: units on axes, target or range shown where one exists, tap for value, same palette from `theme.ts`, and a `data-testid` for Playwright.
- Charts render as SVG so the print page and the Browser Rendering PDF show them crisply.

**Print (weekly report page)**

- `@media print`: Letter, 15 mm margins, hide nav and buttons, black text on white, charts at full width, `break-inside: avoid` on cards, page header with week and trend numbers, footer with page number.
- The same page is what the Worker renders with Browser Rendering for the stored PDF, so the printout and the archive are identical.

## 12. Build phases and open decisions

Five phases, each shippable on its own; phase 1 is usable for daily logging within the first two weeks so the data starts accumulating now.

**Phase 1 — log and see (weeks 1–2)**

- Monorepo, D1 database, Drizzle migrations for every table in section 5, seed scripts (scan, equipment, exercises), the Worker deployed with wrangler, Cloudflare Access login, and the theme tokens in place.
- Weigh-ins, measurements, water, fasting, meals by text and favourites, targets from the rails, trend and forecast engine, Today tab with the hero chart and rings, manual sleep/steps entry and the health webhook.
- Acceptance: a day can be logged in under a minute on a phone; trend and forecast match the engine fixtures; the app works offline and syncs.

**Phase 2 — AI on every log (weeks 3–4)**

- Provider router with all four providers and quotas; `meal_analysis` (photo and text), food matching against Open Food Facts and the Canadian Nutrient File, barcode scan, voice input, `day_adjustment` cards, proposals and plan versions with revert.
- Acceptance: a meal photo becomes an editable item list in under 20 s; a provider outage fails over without a user-visible error; no proposal ever breaks a rail (guard tests).

**Phase 3 — training (weeks 5–6)**

- Exercise library with images and video links, equipment profile and exclusions, workout builder, session logging with rest timer, muscle map, progression and deload rules, `workout_generate` and `workout_fill`, strength charts.
- Acceptance: building and logging a four-exercise session takes under three minutes; every AI workout uses only allowed exercises; the muscle map matches the session's primary/secondary tags.

**Phase 4 — scans, reviews, week plans, Claude (weeks 7–8)**

- Scan upload, extraction, confirm form, analysis and scan charts; file import for Apple Watch data; weekly review job, report page, print CSS and Browser Rendering PDF; week plans (table, tools, "This week" card, week view); Ask AI panel; MCP server with the review and week-plan tools and prompts, connected to Claude as a custom connector.
- Acceptance: the 2026-09-26 sheet extracts with every value within rounding of section 2; the weekly report prints on one or two Letter pages; Claude can call `get_review_bundle`, `apply_review` and `propose_week_plan`/`apply_week_plan` through the connector and the app reflects the result immediately.

**Phase 5 — photos, reminders, polish (weeks 9–10)**

- Progress photos and compare views, Web Push reminders, export/import, full chart inventory, theme iteration, Playwright flows for the main paths.
- Acceptance: all section 11 charts render with real data; export restores cleanly into a fresh instance.

**Open decisions**

- [x] Hosting: all-Cloudflare, decided 2026-10-04. One Worker with static assets, D1, R2, Cron Triggers, Browser Rendering, Cloudflare Access.
- [ ] Auto-apply safe AI changes on by default, or everything behind a tap for the first month?
- [ ] Calorie ceiling for review proposals: 1,700 kcal as drafted, or another number agreed with the dietitian?
- [ ] Scan interval: every 4 weeks or every 6 weeks?
- [ ] Apple Watch route to start with: manual entry only, or set up the Shortcut webhook in phase 1?
- [ ] Muscle map asset: own SVG (full control, more work) or `react-body-highlighter` (fast, fixed look)?
- [ ] Default weekly split: upper/lower/upper/lower, or a different Mon–Thu structure?

(The defaults at the top of this prompt answer these unless Aaron says otherwise.)
