// Owns: reminder idempotency — one cron_runs row per (kind 'remind:<kind>', local period key), e.g. ('remind:water',
// '2026-10-05T11:00'), ('remind:weigh_in', '2026-10-05'), ('remind:fast', '<fast id>:end'), ('remind:review_ready',
// '2026-W41'). Claiming is one INSERT … ON CONFLICT DO NOTHING RETURNING, so exactly one tick wins a period.
import type { ReminderKind } from '@fitness/shared/schemas'
import { and, eq, sql } from 'drizzle-orm'
import { cron_runs } from '../../../db'
import type { Deps } from '../../../lib/deps'

export const claimKind = (kind: ReminderKind) => `remind:${kind}`

/** True only for the one call that claims (kind, period_key). */
export async function claim(deps: Deps, kind: ReminderKind, period_key: string): Promise<boolean> {
  const now = deps.now().toISOString()
  const rows = await deps.db
    .insert(cron_runs)
    .values({ kind: claimKind(kind), period_key, ran_at: now, created_at: now, updated_at: now })
    .onConflictDoNothing({ target: [cron_runs.kind, cron_runs.period_key] })
    .returning({ id: cron_runs.id })
  return rows.length > 0
}

/** Give a period back (its send failed everywhere), so the next tick inside the grace window retries it. */
export async function release(deps: Deps, kind: ReminderKind, period_key: string): Promise<void> {
  await deps.db.delete(cron_runs).where(and(eq(cron_runs.kind, claimKind(kind)), eq(cron_runs.period_key, period_key)))
}

/** SQL: "this period is not claimed yet", for reads that should stop matching once a reminder went out. */
export function unclaimed(kind: ReminderKind, period_key: string) {
  return sql`NOT EXISTS (SELECT 1 FROM ${cron_runs} WHERE ${cron_runs.kind} = ${claimKind(kind)} AND ${cron_runs.period_key} = ${period_key})`
}
