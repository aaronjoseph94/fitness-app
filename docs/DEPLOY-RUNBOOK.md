# Deploy runbook: ship the tested build to Cloudflare

<!-- Owns: the step-by-step deploy and post-deploy checklist for the deploying agent (acting for Aaron) after the 2026-10-05 thorough test pass. Background and the one-time setup live in docs/DEPLOY.md; decisions in docs/PROGRESS.md. -->

**Who runs this:** the deploying agent, in this repo, on Aaron's machine, with Aaron at hand for logins, secret values and dashboard clicks.
**What it ships:** `main` at or after `4b599e9`. That commit holds:

- the TypeScript 7 / Node 24 upgrade;
- the Addy Osmani review fixes;
- the obra/superpowers skills;
- the thorough test pass: 73 fixes, Vitest 378 tests, 9 Playwright flows, `pnpm audit` clean.

There are no new D1 migrations (still `0000`–`0004`). The seed gained 11 floor-exercise exclusions.

Work top to bottom. Each step says what to **run**, what to **expect**, and what to do **if not**.

- **Run in order and report.** Finish each step before the next. After every step, report the output in one line.
- **🧑 Aaron steps.** Steps marked 🧑 need Aaron: a browser login, a secret value or a Cloudflare dashboard click. Ask him, wait, then verify with the command given.

## Rules for the agent (read first)

- **Don't change code to make a step pass.** If a check fails, stop and report the command, its output and your read of the cause. The app's rails depend on code that is tested as a whole:
  - the 1,400 kcal floor and 1,700 kcal ceiling;
  - at most 150 kcal per change;
  - two fasts a month;
  - machines and free weights only;
  - 12–28 sets per session.
- **Never put a secret in a file, a commit, a chat log or a command line.**
  - Set secrets with `npx wrangler secret put <NAME>`, which prompts for the value.
  - `apps/worker/.dev.vars` is for local development only, is gitignored, and must never be committed.
- **Database commands:**
  - Never run `drizzle-kit push` or `drizzle-kit migrate`. Migrations go only through `wrangler d1 migrations apply`.
  - Never run a hand-written `DELETE` or `UPDATE` against the remote D1.
- **Git:** `main` only. No new branches, no PRs, no force-push.
- **`DEV_AUTH_BYPASS`** is never set in production.
- **Commands run from the repo root** unless a step says `cd apps/worker`.

## 1. Sync and clean up git

1. Run:
   ```sh
   git checkout main && git pull --ff-only origin main
   git log --oneline -1
   ```
   **Expect:** `4b599e9 PROGRESS: the thorough test pass …` or a newer commit. The working tree is clean (`git status --short` prints nothing).
2. Delete the leftover branch, but only if it's fully contained in `main`. The cloud session couldn't delete it.
   ```sh
   git fetch origin
   git merge-base --is-ancestor origin/claude/adoring-tesla-90vv0j origin/main && git push origin --delete claude/adoring-tesla-90vv0j
   git ls-remote --heads origin
   ```
   **Expect:** only `refs/heads/main` is listed.
   **If** `merge-base` fails (exit 1), don't delete. Report it.

## 2. Toolchain

1. Run:
   ```sh
   nvm install && nvm use            # reads .nvmrc → 24.21 (or fnm/volta/asdf: any Node 24.21+)
   node -v                           # v24.21.x or newer 24.x
   corepack enable && pnpm -v        # 12.9.1 (from package.json "packageManager")
   pnpm install --frozen-lockfile
   ```
   **Expect:** the install finishes with no lockfile error.
   **If** pnpm says the lockfile is out of date, stop and report. Don't run a plain `pnpm install`, which would rewrite the lockfile.

## 3. Verify locally (about 6 minutes)

1. Run:
   ```sh
   pnpm check
   ```
   **Expect:** every package prints `typecheck: Done`, then `✔ no dependency violations found (6xx modules, …)`.
   **If** it says only a handful of modules were cruised, dependency-cruiser lost its TypeScript 6 copy. Check `packageExtensions` in `pnpm-workspace.yaml` is intact.
2. Run:
   ```sh
   pnpm test
   ```
   **Expect:** `Test Files 60 passed (60)` and `Tests 378 passed (378)`, or more if commits landed since.
3. Run:

   ```sh
   pnpm exec playwright install chromium   # once per machine: Playwright 1.63 needs its own Chromium build
   pnpm e2e
   ```

   **Expect:** `11 passed` across nine flow files: ask-ai (2), log-a-day, mcp, offline-sync, scan-manual, settings (2), text-meal, training and weekly-report. (The styleguide flow was removed on 2026-10-06 with the `/styleguide` route; the settings file was added the same day for the fully-editable profile, and ask-ai gained a delete-a-chat story.)

   The run builds the web app, seeds a throwaway local D1 in `apps/worker/.wrangler/e2e` and serves it on port 8799. A warning `llm_failed … ProvidersExhaustedError` is expected, because the local runs have no LLM keys.

   **If** port 8799 is already in use, stop the other `wrangler dev` first. Playwright otherwise reuses a stale server.

4. Run:
   ```sh
   pnpm audit
   ```
   **Expect:** `No known vulnerabilities found`.

## 4. Cloudflare login and resources

1. 🧑 Run:
   ```sh
   cd apps/worker
   npx wrangler login
   npx wrangler whoami
   ```
   **Expect:** the account id `9c22250f47e2547f0acdffcff516e6ee` (the one in `wrangler.jsonc`).
2. Run:

   ```sh
   npx wrangler d1 list            # contains "fitness" 3f659ddb-d8c4-4890-a9d6-e550e9ff0f61
   npx wrangler r2 bucket list     # contains "fitness-files"
   npx wrangler kv namespace list  # contains id 34932a69d93d4d9986d4aff411762221 (OAUTH_KV)
   ```

   **If** `fitness-files` is missing, run `npx wrangler r2 bucket create fitness-files`.

   **If** the D1 database or the KV namespace is missing, stop and report. Don't create a new one: its id would differ from `wrangler.jsonc`, and its data would be empty.

## 5. Database: note a restore point, migrate, seed

1. Note a restore point so the seed can be rolled back:
   ```sh
   npx wrangler d1 time-travel info fitness
   ```
   **Expect:** a bookmark and a timestamp. Copy both into your report.
2. Run (from the repo root):
   ```sh
   pnpm --filter @fitness/worker db:migrate:remote
   ```
   **Expect:** either `No migrations to apply` or `0000`–`0004` applied with ✅.
3. Run:
   ```sh
   pnpm --filter @fitness/worker seed:remote
   ```
   This is safe to re-run. It uses stable ids and insert-or-ignore, so existing rows (logs, rails, plans, un-hidden exercises) are left alone. This run adds the 11 new floor-exercise exclusions.
4. Verify the new exclusions landed:
   ```sh
   cd apps/worker
   npx wrangler d1 execute DB --remote --command "SELECT x.name FROM exercise_exclusions e JOIN exercises x ON x.id = e.exercise_id WHERE e.removed_at IS NULL AND x.name IN ('Otis-Up','Plate Twist','Alternating Renegade Row','Kettlebell Turkish Get-Up (Squat style)')"
   npx wrangler d1 execute DB --remote --command "SELECT calorie_floor, calorie_ceiling, fasts_per_month FROM settings"
   ```
   **Expect:**
   - the first query returns all 4 names;
   - the second returns `1400 | 1700 | 2` (Aaron's rails). If the rails differ, report them; don't change them.

## 6. Exercise media and the web build

1. Run (from the repo root):

   ```sh
   pnpm --filter @fitness/exercises run fetch:images   # ~1,750 step images + 112 px WebP thumbnails (gitignored)
   pnpm --filter @fitness/exercises run fetch:media    # ~460 animated GIFs (gitignored)
   pnpm build
   ```

   **Expect:**
   - `apps/web/dist` exists, and `apps/web/dist/exercises/<id>/thumb.webp` files are present;
   - Vite's chunk-size warning is expected.

   **If** the thumbnail step warns that `sharp` isn't available, the app still works with the JPEG fallback. Report it and carry on.

## 7. Secrets

1. Run:
   ```sh
   cd apps/worker
   npx wrangler secret list
   ```
2. 🧑 For every name below that is missing, run `npx wrangler secret put <NAME>` and let Aaron paste the value.
   - For a random value, generate it with `openssl rand -base64 32` in Aaron's own terminal.
   - Don't echo values back.
   - Full details are in `docs/DEPLOY.md` §4.

   | Secret                                                        | Notes                                                                                                                               |
   | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
   | `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`                            | From the Zero Trust Access application.                                                                                             |
   | **`ACCESS_EMAIL`**                                            | **New this round.** Aaron's Access login email. Any other Access identity gets 403.                                                 |
   | `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`                    | Service token for the weekly PDF (read-only).                                                                                       |
   | `HEALTH_WEBHOOK_TOKEN`, `MCP_BEARER_TOKEN`, `FILE_URL_SECRET` | Random values.                                                                                                                      |
   | `GEMINI_API_KEY`                                              | Required for any AI feature. Without keys, AI paths now say "not set up" at once.                                                   |
   | `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`           | Fallbacks (optional).                                                                                                               |
   | `USDA_FDC_API_KEY`                                            | Generic foods.                                                                                                                      |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`      | Generate the keys with `pnpm --filter @fitness/worker exec tsx scripts/vapid-keys.ts`. The subject is `mailto:` plus Aaron's email. |

   **Expect:** `npx wrangler secret list` shows all of them. **Never** set `DEV_AUTH_BYPASS`.

## 8. Deploy

1. Run (from the repo root):

   ```sh
   pnpm --filter @fitness/worker run deploy
   ```

   Note the `run`. `pnpm --filter <pkg> deploy` is pnpm's own `deploy` subcommand and fails with
   `ERR_PNPM_INVALID_DEPLOY_TARGET` before the script runs.

   **Expect:**
   - wrangler uploads the Worker and the static assets (`apps/web/dist`);
   - it lists the cron `*/5 * * * *` and prints a version id.

   `workers_dev` is on; `preview_urls` stay off. Expect the deploy to print `https://fitness.aarontjoseph94.workers.dev`. Copy the version id into the report.

2. Check the workers.dev hostname:

   ```sh
   curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" https://fitness.aarontjoseph94.workers.dev/api/health
   ```

   **Expect:** `302` to `https://<team>.cloudflareaccess.com/…` (Access is guarding it).

   🧑 **If** you get `404` or a DNS error, workers.dev may be disabled on the script: Workers & Pages → `fitness` → Settings → Domains & Routes → enable `*.workers.dev`.

## 9. Cloudflare dashboard (🧑 Aaron; the agent verifies afterwards)

Full background is in `docs/DEPLOY.md` §6.

1. **Access application "Fitness"** (`fitness.aarontjoseph94.workers.dev`):
   - Settings → Cookie settings → **SameSite = Lax**, with HTTP Only on. This is new this round.
   - The policy allows only Aaron's email; session duration is 1 month.
2. **Bypass apps** (action Bypass, include Everyone), one per exact path:
   - `/api/ingest/health`
   - `/mcp`
   - `/token`
   - `/register`
   - `/.well-known/oauth-authorization-server`
   - `/.well-known/oauth-protected-resource`
   - `/.well-known/oauth-protected-resource/mcp`

   **Not** `/authorize`: the consent page stays behind Access.

3. **Service token** with a Service Auth policy on the Fitness app. Its id and secret are the two `ACCESS_CLIENT_*` secrets.
4. **Bot Fight Mode / AI bot block off** on the account (Claude's connector calls come from Anthropic's cloud). Zone WAF rate limits do **not** apply to `*.workers.dev`; `/register` is capped only by Worker validation (Claude/loopback callbacks only).

## 10. Smoke test the live Worker (agent)

Run each of these without Access cookies. Put the bearer tokens in shell variables Aaron sets in his own terminal (`read -s HWT` and `read -s MCPT`), never inline.

```sh
H=https://fitness.aarontjoseph94.workers.dev
curl -sS -o /dev/null -w "api-health %{http_code}\n" $H/api/health                                 # 302 (to Access)
curl -sS -o /dev/null -w "mcp-noauth %{http_code}\n" -X POST $H/mcp                                 # 401
curl -sS -D - -o /dev/null -X POST $H/mcp | grep -i www-authenticate                                # resource_metadata=".../.well-known/oauth-protected-resource/mcp"
curl -sS $H/.well-known/oauth-protected-resource/mcp | head -c 200; echo                            # JSON naming the /mcp resource
curl -sS -o /dev/null -w "register-bad %{http_code}\n" -X POST $H/register -H 'Content-Type: application/json' -d '{"redirect_uris":["https://evil.example/cb"]}'   # 400
curl -sS -o /dev/null -w "webhook-noauth %{http_code}\n" -X POST $H/api/ingest/health -H 'Content-Type: application/json' -d '{}'                             # 401
curl -sS -o /dev/null -w "webhook-text %{http_code}\n" -X POST $H/api/ingest/health -H "Authorization: Bearer $HWT" -H 'Content-Type: text/plain' -d 'x'  # 415
curl -sS -X POST $H/mcp -H "Authorization: Bearer $MCPT" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -c 300; echo                 # a tools list (48 tools)
```

**If** any line differs from its comment, stop and report the line and the output.

Then tail the logs while Aaron opens the app (next step). There should be no `level":"error"` lines:

```sh
cd apps/worker && npx wrangler tail --format pretty
```

## 11. On the iPhone (🧑 Aaron; the agent records results)

1. Open `https://fitness.aarontjoseph94.workers.dev` in Safari, sign in through Access, then Share → **Add to Home Screen**. Open it from the Home Screen icon.
2. **Today** loads: weight trend, rings, targets 1,400 kcal / 130 g protein (the seed).
3. **Settings → Reminders → Enable notifications:** allow it, and a test reminder arrives at its time.
4. **Log a weigh-in and water**, then turn on Airplane Mode and log water again. The pending badge shows. Turn Airplane Mode off and it syncs once.
5. **Scans → New → upload the 2026-09-26 Evolt sheet as a PDF.** The sheet renders. This checks the pdf.js legacy build on iOS Safari.
6. **Barcode and voice meal** on a real product and a spoken meal.
7. **iOS Shortcut** (Apple Watch steps and sleep), per `docs/DEPLOY.md` §7. Set the request body to **JSON**; any other body type is now refused with 415. Run it once. The next day shows the steps and sleep, and the sleep source stays "watch".

## 12. Claude connector

1. 🧑 In Claude → Settings → Connectors → Add custom connector, enter URL `https://fitness.aarontjoseph94.workers.dev/mcp`.
   - If the dialog offers **Request headers**, add `Authorization: Bearer <MCP_BEARER_TOKEN>`.
   - Otherwise sign in through Access and tap **Allow**.
2. 🧑 In a Claude chat with the connector on, say: **"run my coach review"**. Claude calls `get_procedure("coach_review")` and `get_review_bundle`.
   - Changes apply only after Aaron says yes.
   - Each change is a revertible plan version.
3. Claude reads "the user", never Aaron's name: the connector redacts it from everything it sends.

## 13. Report back to Aaron

Write one short summary covering:

- the commit deployed and the wrangler version id;
- the D1 time-travel bookmark from §5;
- the result of each step: pass, or what failed;
- what's still on Aaron's list (any 🧑 step not done).

## Rollback

- **Code:** list versions with `cd apps/worker && npx wrangler deployments list`, then roll back with `npx wrangler rollback <version-id>`.
- **Database** (only if the seed or migrate in §5 went wrong; this restores the whole database to that moment): `npx wrangler d1 time-travel restore fitness --bookmark=<bookmark from §5>`.
- **Free plan:** if Workers Logs show **Error 1102** (CPU limit exceeded), switch the account to Workers Paid ($5/month). No code change is needed.

## What changed in behaviour this round (for Aaron's awareness)

Full list and reasons: `docs/PROGRESS.md` → "Thorough test pass".

- **Entries can't be dated in the future** (5 minutes of phone-clock slack). This covers weigh-ins, water, meals, sleep and steps, scans, and the webhook. Reviews can't be drafted for weeks that haven't started.
- **Your own templates must hold 12–28 sets.**
  - The exercise picker offers only allowed exercises.
  - Starting a session leaves out any exercise that has become disallowed, with a note.
- **New in the app:**
  - delete or edit a session;
  - delete a mistaken scan (milestones re-anchor);
  - un-hide an exercise;
  - delete a template;
  - water Undo.
- **Restoring an old plan through Claude** that would break a rail is refused. Restore it in the app with one tap.
- **Alberta stays on UTC−6 from 2026-11-01** (time zone data 2026c), so the clocks don't fall back. The app follows the time zone data automatically.
