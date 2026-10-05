// Owns: writes that survive being offline — an endpoint marked `offline: 'queue'` is queued (and resolves at once) when the
// device is offline, the queue already holds earlier writes, the network fails or the Access session expired; a binary
// body (a photo) is stored as a Blob — and the sender the queue replays through.
import type { Endpoint, EndpointInput, EndpointOutput } from '@fitness/shared/api'
import { hasPendingWrites, queueWrite, type BodyOf, type PendingWrite, type QueueSender } from '../../offline'
import { exchange, parseResponse, toWireRequest } from './call'
import { isApiError } from './errors'
import { isBinaryBody, send, type WireRequest } from './transport'

/** A queueable write gives up on the network quickly: the queue keeps it, so logging never waits long. */
const QUEUEABLE_TIMEOUT_MS = 10_000
/** A photo (≤ 1,024 px, a few hundred KB) gets longer on a slow connection before it falls back to the queue. */
const QUEUEABLE_BINARY_TIMEOUT_MS = 30_000

const timeoutFor = (body: unknown) => (isBinaryBody(body) ? QUEUEABLE_BINARY_TIMEOUT_MS : QUEUEABLE_TIMEOUT_MS)

export type WriteOutcome<E extends Endpoint> =
  /** The Worker stored it; `data` is its validated response. */
  | { status: 'saved'; data: EndpointOutput<E> }
  /** Stored on this device; it replays in order when the Worker is reachable. Show it as pending. */
  | { status: 'queued'; pending: PendingWrite<BodyOf<E>> }

export async function write<E extends Endpoint>(endpoint: E, input: EndpointInput<E>): Promise<WriteOutcome<E>> {
  const request = toWireRequest(endpoint, input)
  if (endpoint.offline !== 'queue') return { status: 'saved', data: parseResponse(endpoint, request, await exchange(request)) }

  const enqueue = async (): Promise<WriteOutcome<E>> => {
    // IndexedDB keeps a Blob as a file on disk, not inline with the queue row.
    const body = request.body instanceof ArrayBuffer ? new Blob([request.body], { type: 'application/octet-stream' }) : request.body
    const pending = await queueWrite({ method: request.method, path: request.path, body })
    return { status: 'queued', pending: pending as PendingWrite<BodyOf<E>> }
  }
  // Behind earlier queued writes it must wait its turn, or it could overtake the write it depends on.
  if (!navigator.onLine || (await hasPendingWrites())) return enqueue()
  let body: unknown
  try {
    body = await exchange(request, { timeoutMs: timeoutFor(request.body) })
  } catch (error) {
    if (isApiError(error) && (error.transient || error.kind === 'auth-expired')) return enqueue()
    throw error
  }
  return { status: 'saved', data: parseResponse(endpoint, request, body) }
}

/** The queue's sender: replays one stored write and classifies the result. */
export const sendQueuedWrite: QueueSender = async (pending) => {
  const request: WireRequest = { method: pending.method, path: pending.path, body: pending.body }
  try {
    await send(request, { timeoutMs: timeoutFor(request.body) })
    return { kind: 'sent' }
  } catch (error) {
    if (!isApiError(error)) return { kind: 'retry', error: String(error) }
    if (error.kind === 'auth-expired') return { kind: 'auth-expired' }
    if (error.transient) return { kind: 'retry', error: error.message }
    return { kind: 'rejected', status: error.status ?? 0, error: error.message }
  }
}
