// Owns: the dependency bag every worker module receives (db, env, clock, actor, waitUntil). Modules accept deps,
// never construct their own adapters, so tests swap fakes in at this seam.
import type { Actor } from '@fitness/shared/schemas'
import type { Context } from 'hono'
import { createDb, type Db } from '../db'
import type { AppEnv, Env } from '../env'

export interface Deps {
  db: Db
  env: Env
  /** Current instant; injected so tests can pin time. */
  now: () => Date
  /** Who is making this change (stored on every write and event). */
  actor: Actor
  /** Run work after the response (ctx.waitUntil); a no-op-safe wrapper in tests and cron. */
  waitUntil: (p: Promise<unknown>) => void
}

export function depsFromContext(c: Context<AppEnv>): Deps {
  return {
    db: createDb(c.env.DB),
    env: c.env,
    now: () => new Date(),
    actor: c.get('actor') ?? 'user',
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
  return { db: createDb(env.DB), env, now: () => new Date(), actor, waitUntil: (p) => ctx.waitUntil(p) }
}
