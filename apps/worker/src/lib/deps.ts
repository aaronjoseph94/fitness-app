// Owns: the dependency bag every worker module receives (db, env, clock, actor, waitUntil). Modules accept deps,
// never construct their own adapters, so tests swap fakes in at this seam.
import type { Actor } from '@fitness/shared/schemas'
import type { Context } from 'hono'
import { createDb, type Db } from '../db'
import type { AppEnv, Env } from '../env'
import { HttpError } from './http-error'

/** External fetches (subrequests) allowed, counted by every fetching adapter that holds the same object. */
export interface FetchBudget {
  limit: number
  used: number
}

/** Free plan: 50 external subrequests per invocation; two are left for fetches no adapter counts (Access JWKS, push). */
export const INVOCATION_FETCHES = 48

export interface Deps {
  db: Db
  env: Env
  /** Current instant; injected so tests can pin time. */
  now: () => Date
  /** Who is making this change (stored on every write and event). */
  actor: Actor
  /** Run work after the response (ctx.waitUntil); a no-op-safe wrapper in tests and cron. */
  waitUntil: (p: Promise<unknown>) => void
  /**
   * The invocation's subrequest tally (one per request or cron tick; job runs started in it share it). The LLM router
   * and food sources count every fetch here besides their own caps, and a job that would not fit waits for the sweep.
   */
  budget?: FetchBudget
}

/**
 * Deps for one request. The actor is the one auth() set (/api, /authorize: 'user') or the caller's own (/mcp: 'mcp');
 * with neither it fails closed (500 no_actor) rather than running a route as the rail-changing 'user'.
 */
export function depsFromContext(c: Context<AppEnv>, actor: Actor | undefined = c.get('actor')): Deps {
  if (!actor) throw new HttpError(500, 'no_actor', 'This route has no authenticated actor')
  return {
    db: createDb(c.env.DB),
    env: c.env,
    now: () => new Date(),
    actor,
    budget: { limit: INVOCATION_FETCHES, used: 0 },
    waitUntil: (p) => {
      try {
        c.executionCtx.waitUntil(p)
      } catch {
        void p
      }
    },
  }
}

export function depsForCron(env: Env, ctx: ExecutionContext, actor: Actor = 'ai'): Deps {
  return {
    db: createDb(env.DB),
    env,
    now: () => new Date(),
    actor,
    waitUntil: (p) => ctx.waitUntil(p),
    budget: { limit: INVOCATION_FETCHES, used: 0 },
  }
}
