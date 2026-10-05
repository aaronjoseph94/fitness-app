// Owns: Web Push (SPEC §8 "Reminders") — this device's subscription (upsert by endpoint, forget), the VAPID public key
// the page subscribes with, and sending one notification to every subscription that wants its kind.
// Interface:
//   pushKey(deps)                          → PushKey             VAPID public key, null when push isn't configured
//   subscribe(deps, PushSubscribe)         → PushSubscription    upsert by endpoint (keys and kinds replaced)
//   unsubscribe(deps, endpoint)            → Ok                  no-op when unknown
//   reachableKinds(deps)                   → Set<ReminderKind>   kinds a send would reach now (empty: not configured
//                                                                 or nobody subscribed) — the cron's cheap gate
//   sendPush(deps, kind, notification)     → PushResult          to every subscription wanting `kind` ('test': all,
//                                                                 or one endpoint); 404/410 subscriptions are deleted
//   sendTest(deps, endpoint?)              → PushResult          the "Send a test" notification
// The push service is an adapter (PushSender): deps.pushSender when given (tests), else Web Push with the VAPID secrets.
// Missing VAPID keys are not an error: sends return configured: false and nothing leaves the Worker.
import type { Ok, PushKey, PushNotification, PushResult, PushSubscribe, PushSubscription, ReminderKind } from '@fitness/shared/schemas'
import { ReminderKind as ReminderKindSchema } from '@fitness/shared/schemas'
import { eq, inArray } from 'drizzle-orm'
import { push_subscriptions } from '../../db'
import type { Deps } from '../../lib/deps'
import { vapidKeys, webPushSender, type PushDelivery, type PushSender } from './lib/sender'

export type { PushDelivery, PushSender, PushTarget } from './lib/sender'

/** Deps plus an optional push adapter (tests pass a fake; production builds Web Push from the VAPID secrets). */
export type PushDeps = Deps & { pushSender?: PushSender }

/** A reminder becomes stale after this long undelivered (the push service drops it). Kinds may pass their own. */
const DEFAULT_DELIVERY: PushDelivery = { ttl_s: 4 * 3600, urgency: 'normal' }

const isGone = (status: number) => status === 404 || status === 410

function senderFor(deps: PushDeps): PushSender | null {
  if (deps.pushSender) return deps.pushSender
  const vapid = vapidKeys(deps.env)
  return vapid ? webPushSender(vapid) : null
}

function toApi(row: typeof push_subscriptions.$inferSelect): PushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    kinds: knownKinds(row.kinds),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/** Stored kinds narrowed to the current enum (a kind dropped from the app is ignored, not an error). */
function knownKinds(kinds: readonly string[]): ReminderKind[] {
  return kinds.filter((k): k is ReminderKind => ReminderKindSchema.safeParse(k).success)
}

export function pushKey(deps: Deps): PushKey {
  return { public_key: vapidKeys(deps.env)?.publicKey ?? null }
}

export async function subscribe(deps: Deps, input: PushSubscribe): Promise<PushSubscription> {
  const now = deps.now().toISOString()
  const kinds = [...new Set(input.kinds)]
  const [row] = await deps.db
    .insert(push_subscriptions)
    .values({ endpoint: input.endpoint, keys: input.keys, kinds, created_at: now, updated_at: now })
    .onConflictDoUpdate({ target: push_subscriptions.endpoint, set: { keys: input.keys, kinds, updated_at: now } })
    .returning()
  return toApi(row!)
}

export async function unsubscribe(deps: Deps, endpoint: string): Promise<Ok> {
  await deps.db.delete(push_subscriptions).where(eq(push_subscriptions.endpoint, endpoint))
  return { ok: true }
}

export async function reachableKinds(deps: PushDeps): Promise<Set<ReminderKind>> {
  if (!senderFor(deps)) return new Set()
  const rows = await deps.db.select({ kinds: push_subscriptions.kinds }).from(push_subscriptions)
  return new Set(rows.flatMap((r) => knownKinds(r.kinds)))
}

/**
 * Send `notification` to every subscription that wants `kind` ('test' reaches every subscription, or only
 * `only_endpoint`). Subscriptions the push service reports gone (404/410) are deleted in one statement.
 */
export async function sendPush(
  deps: PushDeps,
  kind: ReminderKind | 'test',
  notification: PushNotification,
  options: { delivery?: Partial<PushDelivery>; only_endpoint?: string } = {},
): Promise<PushResult> {
  const sender = senderFor(deps)
  if (!sender) return { configured: false, sent: 0, failed: 0, removed: 0 }
  const rows = await deps.db.select().from(push_subscriptions)
  const targets = rows.filter((r) =>
    kind === 'test' ? !options.only_endpoint || r.endpoint === options.only_endpoint : r.kinds.includes(kind),
  )
  const delivery: PushDelivery = { ...DEFAULT_DELIVERY, topic: kind, ...options.delivery }
  const statuses = await Promise.all(
    targets.map((t) =>
      sender({ endpoint: t.endpoint, keys: t.keys }, notification, delivery).catch((e: unknown) => {
        log('push send failed', { kind, host: hostOf(t.endpoint), error: String(e) })
        return 0
      }),
    ),
  )
  const gone = targets.filter((_, i) => isGone(statuses[i]!)).map((t) => t.endpoint)
  if (gone.length > 0) await deps.db.delete(push_subscriptions).where(inArray(push_subscriptions.endpoint, gone))
  const sent = statuses.filter((s) => s >= 200 && s < 300).length
  const failed = statuses.length - sent - gone.length
  if (failed > 0)
    log('push rejected', { kind, statuses: statuses.filter((s) => !(s >= 200 && s < 300) && !isGone(s)) })
  return { configured: true, sent, failed, removed: gone.length }
}

/** POST /api/push/test: a test notification to one device (its endpoint) or every subscribed device. */
export function sendTest(deps: PushDeps, endpoint?: string): Promise<PushResult> {
  return sendPush(
    deps,
    'test',
    { title: 'Notifications are on', body: 'Reminders will arrive like this one. Tap to open the app.', url: '/settings/reminders', tag: 'test' },
    { delivery: { ttl_s: 300, urgency: 'high' }, ...(endpoint ? { only_endpoint: endpoint } : {}) },
  )
}

/** The push service's host only (an endpoint URL is a bearer capability; never log it whole). */
const hostOf = (endpoint: string) => {
  try {
    return new URL(endpoint).host
  } catch {
    return 'invalid'
  }
}

const log = (msg: string, extra: Record<string, unknown>) => console.error(JSON.stringify({ level: 'error', msg, ...extra }))
