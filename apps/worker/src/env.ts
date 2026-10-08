// Owns: the Worker's environment type (bindings, vars, secrets) and the Hono app type every route uses.
import type { Actor } from '@fitness/shared/schemas'
import type { Hono } from 'hono'

export interface Env {
  DB: D1Database
  FILES: R2Bucket
  ASSETS: Fetcher
  /** Browser Rendering (quickAction('pdf') archives the weekly report). wrangler dev's local binding has no quickAction. */
  BROWSER?: BrowserRun
  /** MCP OAuth 2.1 (@cloudflare/workers-oauth-provider): registered clients, grants and tokens (hashed / encrypted). */
  OAUTH_KV: KVNamespace
  // vars
  APP_ORIGIN: string
  TZ_NAME: string
  // secrets
  ACCESS_AUD?: string
  ACCESS_TEAM_DOMAIN?: string
  /** Aaron's Access login email. When set, any other Access identity (a policy widened by mistake) gets 403. */
  ACCESS_EMAIL?: string
  DEV_AUTH_BYPASS?: string
  HEALTH_WEBHOOK_TOKEN?: string
  MCP_BEARER_TOKEN?: string
  FILE_URL_SECRET?: string
  GEMINI_API_KEY?: string
  ZAI_API_KEY?: string
  OPENROUTER_API_KEY?: string
  GROQ_API_KEY?: string
  /** Paid models (SPEC §9): Claude through the Anthropic API, ChatGPT through the OpenAI API, Gemini Pro (a Google key with billing on). */
  ANTHROPIC_API_KEY?: string
  OPENAI_API_KEY?: string
  GEMINI_PAID_API_KEY?: string
  USDA_FDC_API_KEY?: string
  VAPID_PUBLIC_KEY?: string
  VAPID_PRIVATE_KEY?: string
  VAPID_SUBJECT?: string
  ACCESS_CLIENT_ID?: string
  ACCESS_CLIENT_SECRET?: string
}

export interface Variables {
  /** Who is making this change: Aaron through the app or a webhook ('user'), a job ('ai'), or Claude via MCP ('mcp'). */
  actor: Actor
  /** Request id for logs. */
  requestId: string
}

export type AppEnv = { Bindings: Env; Variables: Variables }
export type App = Hono<AppEnv>
