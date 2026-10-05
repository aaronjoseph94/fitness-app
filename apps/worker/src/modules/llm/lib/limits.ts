// Owns: per-quota limits. RPM is an in-isolate token bucket; RPD and tokens per day live in `provider_usage`
// (one row per quota key and day, the day taken in the quota's reset timezone) and feed the daily budget guard:
// background calls stop at `background_share` (80 %) of a daily quota, user calls at 100 %. A 429 with a long
// Retry-After puts the quota on an in-isolate cooldown so the next call skips it without a fetch.
import { and, inArray, sql } from 'drizzle-orm'
import { provider_usage, type Db } from '../../../db'
import type { QuotaSpec } from './config'
import type { Priority } from './types'

// ── In-isolate state (module scope: shared by every request this isolate serves) ────────────────────────────────

const buckets = new Map<string, { tokens: number; at: number }>()
const cooldowns = new Map<string, number>()

/** Take one request token. Returns 0 when taken, otherwise the ms until one is available (nothing taken). */
export function takeRpmToken(quotaKey: string, rpm: number, nowMs: number): number {
  const b = buckets.get(quotaKey) ?? { tokens: rpm, at: nowMs }
  b.tokens = Math.min(rpm, b.tokens + (Math.max(0, nowMs - b.at) / 60_000) * rpm)
  b.at = nowMs
  buckets.set(quotaKey, b)
  if (b.tokens >= 1) {
    b.tokens -= 1
    return 0
  }
  return Math.ceil(((1 - b.tokens) / rpm) * 60_000)
}

export function coolingDown(quotaKey: string, nowMs: number): boolean {
  const until = cooldowns.get(quotaKey)
  return until !== undefined && until > nowMs
}

export function coolDown(quotaKey: string, untilMs: number): void {
  cooldowns.set(quotaKey, Math.max(untilMs, cooldowns.get(quotaKey) ?? 0))
}

// ── Daily usage (D1) ────────────────────────────────────────────────────────────────────────────────────────────

const dayFormats = new Map<string, Intl.DateTimeFormat>()

/** The quota day ('YYYY-MM-DD') of an instant in the quota's reset timezone. */
export function quotaDay(quota: QuotaSpec, now: Date): string {
  let f = dayFormats.get(quota.day_tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: quota.day_tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dayFormats.set(quota.day_tz, f)
  }
  return f.format(now)
}

export interface DayUsage {
  requests: number
  tokens: number
}

/** Today's usage for these quotas in one query, keyed `${quotaKey}|${day}`. */
export async function loadUsage(
  db: Db,
  quotas: { key: string; day: string }[],
): Promise<Map<string, DayUsage>> {
  const out = new Map<string, DayUsage>()
  if (!quotas.length) return out
  const rows = await db
    .select({
      provider: provider_usage.provider,
      day: provider_usage.day,
      requests: provider_usage.requests,
      tin: provider_usage.tokens_in,
      tout: provider_usage.tokens_out,
    })
    .from(provider_usage)
    .where(
      and(
        inArray(provider_usage.provider, [...new Set(quotas.map((q) => q.key))]),
        inArray(provider_usage.day, [...new Set(quotas.map((q) => q.day))]),
      ),
    )
  for (const r of rows) out.set(`${r.provider}|${r.day}`, { requests: r.requests, tokens: r.tin + r.tout })
  return out
}

/** Add one request and its tokens to today's row (insert or increment in one statement). */
export async function recordUsage(
  db: Db,
  quotaKey: string,
  day: string,
  tokensIn: number,
  tokensOut: number,
  now: Date,
): Promise<void> {
  await db
    .insert(provider_usage)
    .values({ provider: quotaKey, day, requests: 1, tokens_in: tokensIn, tokens_out: tokensOut })
    .onConflictDoUpdate({
      target: [provider_usage.provider, provider_usage.day],
      set: {
        requests: sql`${provider_usage.requests} + 1`,
        tokens_in: sql`${provider_usage.tokens_in} + ${tokensIn}`,
        tokens_out: sql`${provider_usage.tokens_out} + ${tokensOut}`,
        updated_at: now.toISOString(),
      },
    })
}

/** The provider said today's quota is spent: record it as full so every isolate skips it until the quota day ends. */
export async function recordExhausted(
  db: Db,
  quotaKey: string,
  day: string,
  rpd: number,
  now: Date,
): Promise<void> {
  await db
    .insert(provider_usage)
    .values({ provider: quotaKey, day, requests: rpd })
    .onConflictDoUpdate({
      target: [provider_usage.provider, provider_usage.day],
      set: { requests: sql`max(${provider_usage.requests}, ${rpd})`, updated_at: now.toISOString() },
    })
}

/** The daily budget guard: true when this priority may not spend more of the quota today. */
export function overDailyBudget(
  quota: QuotaSpec,
  used: DayUsage | undefined,
  priority: Priority,
  backgroundShare: number,
): boolean {
  if (!used) return false
  const share = priority === 'background' ? backgroundShare : 1
  if (quota.rpd !== null && used.requests >= quota.rpd * share) return true
  if (quota.tpd !== null && used.tokens >= quota.tpd * share) return true
  return false
}
