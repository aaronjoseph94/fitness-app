# Deploy

<!-- Owns: the one-time Cloudflare setup and the repeatable deploy, written for Aaron (or Cursor acting for him). Nothing in the repo deploys automatically. -->

Everything runs in one Cloudflare Worker on the free plan: static assets (the PWA), `/api`, `/mcp`, jobs and one cron. Data lives in D1, files in R2. Commands run from the repo root unless noted.

## 0. Prerequisites

- Node 22.22+ and pnpm 10 (`corepack enable`), then `pnpm install`.
- A Cloudflare account. Add a payment method to the account: **R2 and Zero Trust require one on file even though this app stays inside their free tiers** (nothing is charged within the free limits).
- `cd apps/worker && npx wrangler login`

## 1. Create the Cloudflare resources (once)

```sh
cd apps/worker
npx wrangler d1 create fitness                 # copy the database_id into wrangler.jsonc → d1_databases[0].database_id
npx wrangler r2 bucket create fitness-files
npx wrangler kv namespace create OAUTH_KV      # copy the id into wrangler.jsonc → kv_namespaces (MCP OAuth; phase 4)
```

## 2. Database: migrate and seed (once, and after every new migration)

```sh
pnpm --filter @fitness/worker db:migrate:remote   # wrangler d1 migrations apply DB --remote
pnpm --filter @fitness/worker seed:remote         # profile, rails, baseline scan, milestones, equipment, exercises, CNF foods, plan v1
```

The seed is idempotent (stable UUID v5 ids, insert-or-ignore), so running it again is safe.

## 3. Build the web app with its media

```sh
pnpm --filter @fitness/exercises run fetch:images   # ~1,750 exercise step images → packages/exercises/images (gitignored)
pnpm --filter @fitness/exercises run fetch:media    # ~460 animated GIFs → packages/exercises/media (gitignored)
pnpm build                                          # apps/web/dist (copies images to /exercises and GIFs to /media/exercises)
```

## 4. Secrets

Set each with `npx wrangler secret put <NAME>` from `apps/worker`. Generate random values with `openssl rand -base64 32`.

| Secret | What it is | Where to get it |
| --- | --- | --- |
| `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` | Zero Trust → Settings → Custom pages / team name (step 6) |
| `ACCESS_AUD` | The Access application's AUD tag | Zero Trust → Access → Applications → the app → Overview (step 6) |
| `ACCESS_CLIENT_ID`, `ACCESS_CLIENT_SECRET` | Access service token used by Browser Rendering to open the report page for the PDF archive | Zero Trust → Access → Service auth → Create service token (step 6) |
| `HEALTH_WEBHOOK_TOKEN` | Bearer token for the iOS Shortcut | random |
| `MCP_BEARER_TOKEN` | Static bearer for MCP clients that support headers (Claude Code; Claude if "Request headers" is offered) | random |
| `FILE_URL_SECRET` | HMAC key for short-lived file URLs | random |
| `GEMINI_API_KEY` | Primary LLM (free tier) | aistudio.google.com → Get API key |
| `ZAI_API_KEY` | GLM fallback (free Flash models) | z.ai → API keys |
| `OPENROUTER_API_KEY` | `:free` model fallback (50 req/day; 1,000/day after a one-time $10 top-up) | openrouter.ai → Keys |
| `GROQ_API_KEY` | Fast text fallback | console.groq.com → API keys |
| `USDA_FDC_API_KEY` | USDA FoodData Central (generic foods) | api.data.gov/signup (free) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keys | `pnpm --filter @fitness/worker exec tsx scripts/vapid-keys.ts` |
| `VAPID_SUBJECT` | `mailto:` contact for push services | your email |

Vars in `wrangler.jsonc`: set `APP_ORIGIN` to the deployed URL (e.g. `https://fitness.<subdomain>.workers.dev`). `TZ_NAME` stays `America/Edmonton`.

Never set `DEV_AUTH_BYPASS` in production (it is only honoured on localhost anyway).

## 5. Deploy

```sh
pnpm --filter @fitness/worker deploy     # wrangler deploy; serves apps/web/dist as static assets
```

The URL is `https://fitness.<your-subdomain>.workers.dev` unless you add a custom domain (needs a domain on a Cloudflare zone).

## 6. Cloudflare Access (login, no login screen to build)

Zero Trust (free plan, up to 50 users) → pick a team name → Access → Applications:

1. **Self-hosted app "Fitness"**: hostname = your workers.dev host (or custom domain). Policy: Allow → Emails → your email (one-time PIN or Google). Session duration: 1 month (the PWA re-authenticates when it expires). Copy the **AUD tag** → `ACCESS_AUD`.
2. **Bypass apps** (Policy action: Bypass, Include: Everyone), one per path — paths match exactly, so add each:
   - `<host>/api/ingest/health` (the Shortcut webhook; it checks its own bearer token)
   - `<host>/mcp` (MCP; it checks its own token / OAuth)
   - MCP OAuth endpoints: `<host>/token`, `<host>/register`, `<host>/.well-known/oauth-authorization-server`, `<host>/.well-known/oauth-protected-resource/mcp` (the one the `/mcp` 401 challenge names) and `<host>/.well-known/oauth-protected-resource`
   - Do **not** bypass `<host>/authorize`: it is the consent page and must stay behind your Access login (the Worker checks the Access JWT there too).
3. **Service token** for PDFs: Access → Service auth → create token → add a **Service Auth** policy for it on the "Fitness" app → secrets `ACCESS_CLIENT_ID` / `ACCESS_CLIENT_SECRET`.
4. Keep Bot Fight Mode off for this hostname (Claude's connector calls come from Anthropic's cloud).

## 7. iOS Shortcut (Apple Watch steps and sleep)

Shortcuts → Automation → Time of Day 07:30 daily → Run immediately:

1. Find Health Samples: Steps, start date is yesterday → Calculate Statistics: Sum.
2. Find Health Samples: Sleep Analysis (Asleep), last 1 day → get start of first, end of last, and the total minutes.
3. Get Contents of URL: `POST https://<host>/api/ingest/health`, headers `Authorization: Bearer <HEALTH_WEBHOOK_TOKEN>` and `Content-Type: application/json`, body:
   `{"date": "<yesterday YYYY-MM-DD>", "steps": <sum>, "sleep": {"in_bed_at": "<ISO>", "woke_at": "<ISO>", "asleep_min": <minutes>}}`

The endpoint is idempotent by date, so a re-run just replaces the day.

## 8. Claude connector (MCP)

Claude → Settings → Connectors → Add custom connector → URL `https://<host>/mcp`.

- If the dialog shows **Request headers**, add `Authorization: Bearer <MCP_BEARER_TOKEN>`.
- Otherwise leave auth to OAuth: Claude gets a `401` from `/mcp`, reads `/.well-known/oauth-protected-resource/mcp` and `/.well-known/oauth-authorization-server`, registers itself (Client ID Metadata Document, or `/register`), and opens `/authorize`. Sign in through Cloudflare Access, then tap **Allow** on "Allow Claude to read and change your fitness data within the rails". Access tokens last 1 hour and refresh silently; the grant lapses only after 60 days without use (approve again then). Needs the `OAUTH_KV` namespace from step 1.
- Claude Code: `claude mcp add --transport http fitness https://<host>/mcp --header "Authorization: Bearer <MCP_BEARER_TOKEN>"`.

Then in any Claude chat with the connector on, say "run my coach review" — Claude calls `get_procedure("coach_review")`, reads `get_review_bundle`, discusses, and applies on your approval.

## 9. Install the PWA

Open the URL in Safari on the iPhone → Share → Add to Home Screen. Then Settings → Reminders → Enable notifications (iOS only allows web push for Home Screen apps).

## Free-plan notes

- Workers Free allows 10 ms CPU per request and per cron run. The app is built to fit (no zipping or image work in the Worker, precomputed schemas, one table per backup tick). If Workers Logs show **Error 1102** (CPU exceeded), switch the account to Workers Paid ($5/month, 30 s CPU) — no code change needed.
- D1 free: 500 MB per database, 5 M rows read and 100 k rows written per day. R2 free: 10 GB.
- Browser Rendering free: 10 browser-minutes per day — plenty for a weekly PDF. Locally, use the Print button instead.
