# Handoff for the DeepSeek harness: deploy the 2a build, then the optional follow-ups

<!-- Owns: the self-contained task list a non-Claude coding agent (Aaron's DeepSeek harness) executes for Aaron after the 2a redesign (main at c0d52be or later). Background: docs/DEPLOY.md (one-time setup), docs/DEPLOY-RUNBOOK.md (the previous round's runbook), docs/PROGRESS.md (decisions). -->

**Who runs this:** a coding agent (the DeepSeek harness) in this repo, on Aaron's machine, with Aaron at hand for logins, secret values and dashboard clicks.

**What it ships:** `main` at or after `c0d52be`, which is the finished 2a redesign:

- every screen of `apps/web` moved to the 2a design;
- the MCP consent page restyled;
- `pnpm check` is clean, 408 Vitest tests and 14 Playwright flows pass, and production dependencies pass `pnpm audit`.

There are no new D1 migrations since the last deploy (`0000`–`0007`); `migrate` should be a no-op. The only Worker change is the look of the consent page.

**Order:** Part A is the deploy, and it comes first. Part B is optional code work; do it only after Part A succeeds, and only if Aaron asks for it.

**Reporting:** after every step, report one line: the command, pass or fail, and the key output.

**🧑 steps:** a step marked 🧑 needs Aaron (a browser login, a secret value, a dashboard click). Ask him, wait, then verify with the command given.

## Rules (read first, never break)

Read `CLAUDE.md` once before starting. It holds the project's rules; these are the ones that matter for this handoff.

1. **Don't change code to make a deploy step pass.** If a check fails, stop and report three things: the command, its output, and your read of the cause. The app's safety rails depend on code that is tested as a whole. These rails are never lowered:
   - the 1,400 kcal/day floor and the 1,700 kcal ceiling;
   - at most 150 kcal per change;
   - two 24 h fasts a month;
   - machines and free weights only;
   - 12–28 sets per session.
2. **Secrets never appear in a file, a commit, a chat log, a prompt to the model or a command line.**
   - Set them only with `npx wrangler secret put <NAME>`, which prompts Aaron for the value.
   - Don't read, print or summarise `apps/worker/.dev.vars`.
3. **Privacy:**
   - Never send Aaron's name, photos of him, progress photos, raw EXIF or his logged data to any model, including your own.
   - Don't paste rows from the remote database into your reasoning beyond the counts and settings this doc asks for.
4. **Database:**
   - Never run `drizzle-kit push` or `drizzle-kit migrate`. Migrations go only through `wrangler d1 migrations apply` (the `db:migrate:*` scripts).
   - Never run a hand-written `INSERT`, `UPDATE` or `DELETE` against the remote D1.
5. **Git:**
   - `main` only. No new branches, no PRs, no force-push, no history rewriting.
   - Commit only in Part B, one commit per item, with a clear message.
6. **`DEV_AUTH_BYPASS`** is never set in production, and never as a secret.
7. **Dependencies:** never run `pnpm add` or a plain `pnpm install`; use `pnpm install --frozen-lockfile`. If a change needs a new package or a version bump, stop and propose it to Aaron.
8. **Deploying:** the deploy itself (§A8) runs only with Aaron present and saying go.
9. **The `e2e` agentic runner (`npx e2e`):** don't use it, and never run `npx e2e feedback`. `pnpm e2e` is Playwright and is fine.
10. **Don't ask Aaron design or product questions.** Ask only for the 🧑 steps, or when a rail or `docs/SPEC.md` is at stake. Record any judgement call in `docs/PROGRESS.md` → "Decisions made on Aaron's behalf".
11. **Working directory:** commands run from the repo root unless a step says `cd apps/worker`.

---

## Part A: Deploy

### A1. Sync

```sh
git checkout main && git pull --ff-only origin main
git log --oneline -1          # c0d52be PROGRESS: the 2a redesign's final state … (or newer)
git status --short            # prints nothing
git ls-remote --heads origin  # only refs/heads/main
```

**If** the tree is dirty or pull isn't a fast-forward, stop and report. Don't stash, reset or merge.

### A2. Toolchain and install

```sh
nvm install && nvm use          # .nvmrc → Node 24.21 (any 24.21+ via fnm/volta/asdf is fine)
node -v                         # v24.x, ≥ 24.21
corepack enable && pnpm -v      # matches package.json "packageManager"
pnpm install --frozen-lockfile
```

**If** the lockfile is reported out of date, stop and report.

### A3. Verify locally (about 8 minutes)

1. Typecheck and module boundaries:

   ```sh
   pnpm check
   ```

   **Expect:** every package prints `typecheck: Done`, then `✔ no dependency violations found (…)` with several hundred modules.

   **If** only a handful of modules were cruised, check that `packageExtensions` in `pnpm-workspace.yaml` is intact (dependency-cruiser needs its own TypeScript 6). Report it; don't edit it.

2. Unit tests:

   ```sh
   pnpm test
   ```

   **Expect:** all pass (408 or more tests).

3. End-to-end flows:

   ```sh
   pnpm exec playwright install chromium   # once per machine
   pnpm e2e
   ```

   **Expect:** all 14 tests in `e2e/*.spec.ts` pass.

   - The run builds the web app, seeds a throwaway D1 in `apps/worker/.wrangler/e2e` and serves it on port 8799.
   - `llm_failed … ProvidersExhaustedError` warnings are expected, because the local run has no LLM keys.

   **If** port 8799 is busy, stop the other `wrangler dev` first.

4. Dependency audit:

   ```sh
   pnpm audit --prod
   ```

   **Expect:** `No known vulnerabilities found`.

   A full `pnpm audit` reports two **dev-only** advisories, both known and accepted (see B2):
   - `shell-quote`, via `concurrently`;
   - `sharp`, via `@cloudflare/vitest-plugin`.

### A4. Cloudflare login and resources

1. 🧑 Log in and check the account:

   ```sh
   cd apps/worker
   npx wrangler login
   npx wrangler whoami            # account id 9c22250f47e2547f0acdffcff516e6ee
   ```

2. Check the resources exist:

   ```sh
   npx wrangler d1 list             # "fitness" 3f659ddb-d8c4-4890-a9d6-e550e9ff0f61
   npx wrangler r2 bucket list      # "fitness-files"
   npx wrangler kv namespace list   # id 34932a69d93d4d9986d4aff411762221 (OAUTH_KV)
   ```

   **If** the D1 database or the KV namespace is missing, stop and report. Never create a replacement: its id would differ from `wrangler.jsonc`.

### A5. Database: restore point, migrate, seed

1. Note the restore point:

   ```sh
   npx wrangler d1 time-travel info fitness
   ```

   Copy the bookmark and the timestamp into your report.

2. Migrate (from the repo root):

   ```sh
   pnpm --filter @fitness/worker db:migrate:remote
   ```

   **Expect:** `No migrations to apply` (or `0000`–`0007` applied with ✅).

3. Seed (safe to re-run):

   ```sh
   pnpm --filter @fitness/worker seed:remote
   ```

   It uses stable ids and insert-or-ignore, so existing rows are left alone.

4. Check Aaron's rails (from `apps/worker`):

   ```sh
   npx wrangler d1 execute DB --remote --command "SELECT calorie_floor, calorie_ceiling, fasts_per_month FROM settings"
   ```

   **Expect:** `1400 | 1700 | 2`. If they differ, report them; never change them.

### A6. Exercise media and the web build

From the repo root:

```sh
pnpm --filter @fitness/exercises run fetch:images   # step images + WebP thumbnails (gitignored)
pnpm --filter @fitness/exercises run fetch:media    # animated GIFs (gitignored)
pnpm build
```

**Expect:**

- `apps/web/dist` exists, with `apps/web/dist/exercises/<id>/thumb.webp` files;
- `dist` has a `sw.js` and a `manifest.webmanifest`.

**If** the thumbnail step says `sharp` is unavailable, the app falls back to JPEG. Report it and continue.

### A7. Secrets (check only; nothing new is required — the paid-model keys are optional)

```sh
cd apps/worker && npx wrangler secret list
```

**Expect** every one of these names (the values are never shown):

- `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ACCESS_EMAIL`;
- `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET`;
- `HEALTH_WEBHOOK_TOKEN`, `MCP_BEARER_TOKEN`, `FILE_URL_SECRET`;
- `GEMINI_API_KEY`, plus optionally `ZAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`;
- optionally the paid models (2026-10-08, pay as you go; absent is fine, and Aaron can paste them in the app under Settings → AI instead): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_PAID_API_KEY`;
- `USDA_FDC_API_KEY` (legacy: USDA is no longer queried since 2026-10-06; its absence is fine);
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

🧑 For each missing name, run `npx wrangler secret put <NAME>` and let Aaron paste the value. Details are in `docs/DEPLOY.md` §4.

`DEV_AUTH_BYPASS` must **not** be in the list. If it is, stop and tell Aaron.

### A8. Deploy (🧑 Aaron says go)

From the repo root:

```sh
pnpm --filter @fitness/worker run deploy
```

Note the `run`: without it, pnpm's own `deploy` command fails with `ERR_PNPM_INVALID_DEPLOY_TARGET`.

**Expect:**

- the upload of the Worker and the `apps/web/dist` assets;
- the cron `*/5 * * * *`;
- `https://fitness.aarontjoseph94.workers.dev`;
- a version id. Copy it into your report.

### A9. Smoke test the live Worker

Run these without Access cookies. Aaron sets the bearer tokens in his own terminal with `read -s HWT` and `read -s MCPT`; never put them inline.

```sh
H=https://fitness.aarontjoseph94.workers.dev
curl -sS -o /dev/null -w "api-health %{http_code}\n" $H/api/health                              # 302 (to Access)
curl -sS -o /dev/null -w "mcp-noauth %{http_code}\n" -X POST $H/mcp                              # 401
curl -sS $H/.well-known/oauth-protected-resource/mcp | head -c 200; echo                         # JSON naming the /mcp resource
curl -sS -o /dev/null -w "register-bad %{http_code}\n" -X POST $H/register -H 'Content-Type: application/json' -d '{"redirect_uris":["https://evil.example/cb"]}'   # 400
curl -sS -o /dev/null -w "webhook-noauth %{http_code}\n" -X POST $H/api/ingest/health -H 'Content-Type: application/json' -d '{}'                             # 401
curl -sS -X POST $H/mcp -H "Authorization: Bearer $MCPT" -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | head -c 300; echo              # a tools list (includes get_today)
```

**If** any line differs from its comment, stop and report that line and its output.

Then tail the logs while Aaron runs A10, and watch for `"level":"error"` lines:

```sh
cd apps/worker && npx wrangler tail --format pretty
```

### A10. Look at it (🧑 Aaron; the agent records results)

On the **desktop** (1440 px or wider), signed in through Access:

1. **Shell:**
   - a 240 px sidebar and a 56 px header;
   - the Geist typeface;
   - white hairline cards.
2. **Today:**
   - the weight trend with its forecast band, goal line and milestones;
   - the targets (1,400 kcal floor respected).
3. **Dashboard:** the sections and charts load, with no blank cards.
4. **Train → start a session:** log one set; the rest timer bar appears.
5. **Progress, Log, Ask AI, Settings, Scans:** each loads without errors.

On the **iPhone**, from the home-screen PWA (re-add it if the icon is stale):

1. The bottom tabs show, and Today, Log and a session render.
2. Log water in Airplane Mode: the pending badge appears. Turn Airplane Mode off and it syncs once.

**Claude connector:** the next time it re-authorises, the `/authorize` consent page uses the new 2a look. Approving still works.

### A11. Report to Aaron

Write one short summary:

- the commit deployed and the wrangler version id;
- the D1 time-travel bookmark from A5;
- each step: pass, or what failed;
- any 🧑 step still open.

### Rollback

- **Code:** list versions with `cd apps/worker && npx wrangler deployments list`, then run `npx wrangler rollback <previous-version-id>`. This round is web-only, so a rollback is always safe.
- **Database** (only if A5 went wrong): `npx wrangler d1 time-travel restore fitness --bookmark=<bookmark from A5>`.
- **Error 1102** (CPU limit) in Workers Logs: Aaron switches the account to Workers Paid. No code change is needed.

---

## Part B: Optional follow-ups (only after Part A, only if Aaron asks)

Each item is small and independent. For each one:

1. Read `CLAUDE.md` and the files named.
2. Make the smallest change.
3. Run `pnpm check`, the one targeted test named, and `pnpm e2e`.
4. Commit to `main` with a clear message.
5. Add one line to `docs/PROGRESS.md` → "Done".

These are presentation fixes:

- Don't change data hooks, query keys, API calls, guards, routes or URL params.
- Keep every `data-testid` and every accessible name the e2e flows use.
- Colours and type come only from `apps/web/src/theme.ts`.

Deploy again (Part A, A6 and A8–A10) only when Aaron says so.

### B1. Ask AI: the first Tab lands on a starter chip

**File:** `apps/web/src/features/ai/lib/Chat.tsx`, around line 299.

**Cause:** on mount, the effect calls `end.current?.scrollIntoView(...)`. That moves the browser's sequential-focus starting point to the end of the thread, so the first Tab after load skips the composer and the page header. The bug predates 2a.

**Fix:** skip the scroll while the thread has no turns. For example, return early from the effect when `chat.turns.length === 0`, and keep the dependency list as it is.

**Check:**
- Load `/ai` with an empty thread and press Tab: focus goes to the first focusable element in reading order.
- `pnpm e2e e2e/ask-ai.spec.ts` passes.

### B2. Dev-only audit advisories

Two advisories show in `pnpm audit`. Both are in dev-only tooling, and neither ships to production.

- **`shell-quote` < 1.11.0** (critical), via `concurrently`, which runs `pnpm dev`.
- **`sharp` < 0.35.5** (high), via `@cloudflare/vitest-plugin` → miniflare.

**Preferred fix:** when `concurrently` and the Cloudflare tooling publish fixed versions, bump them in the `catalog:` of `pnpm-workspace.yaml`.

**Fallback:** add entries under `overrides:` in `pnpm-workspace.yaml`:

```yaml
overrides:
  shell-quote: ">=1.11.0"
  sharp: ">=0.35.5"
```

Rule 7 still applies, so this needs Aaron's go and a lockfile update. After it:

- `pnpm audit` is clean;
- `pnpm test` still passes (miniflare's worker tests use sharp);
- `pnpm dev` still starts.

### B3. Known layout limits (low priority, record-only unless Aaron wants them)

These are recorded in `docs/PROGRESS.md` (2026-10-08 decisions). Fix one only if it can be done without moving other content.

- **Log, the meal table at 320 px:** its horizontal scroller is needed at 320 px. Files: `apps/web/src/features/log/lib/MealCard.tsx`.
- **Fasting strip:** when fasts fall on consecutive days, the day cells are under 24 px wide for a mouse. Touch targets are fine. Files: `apps/web/src/features/log/lib/FastingCard.tsx` and the strip in `apps/web/src/charts`.
- **Today, residual CLS ≈ 0.005:** a data-dependent row appears after load. Leave it: reserving its space would shift the days that don't show it.

---

## Where things are

| What | Where |
| --- | --- |
| Project rules | `CLAUDE.md` |
| Spec (source of truth) | `docs/SPEC.md` |
| Progress, next steps, decisions | `docs/PROGRESS.md` |
| One-time Cloudflare setup (Access apps, bypass paths, iOS Shortcut, connector) | `docs/DEPLOY.md` |
| Previous round's runbook (dashboard and connector detail) | `docs/DEPLOY-RUNBOOK.md` |
| 2a design spec | `docs/design/design_handoff_fitness_2a/README.md` |
| Design tokens | `apps/web/src/theme.ts` |
| UI kit | `apps/web/src/components` |
| Worker config | `apps/worker/wrangler.jsonc` |
