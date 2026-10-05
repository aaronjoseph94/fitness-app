// Owns: typed calls over the shared endpoint contract — validate the input against the endpoint's schemas, build the
// path and query, exchange it on the wire, validate the response — plus the "a call worked, replay the queue" trigger.
import { buildPath, type Endpoint, type EndpointInput, type EndpointOutput } from '@fitness/shared/api'
import { requestFlush } from '../../offline'
import { schemaError } from './errors'
import { send, type SendOptions, type WireRequest } from './transport'

/** Call an endpoint: resolves with the validated response, throws ApiError (see its `kind`). Never queues. */
export async function call<E extends Endpoint>(endpoint: E, input: EndpointInput<E>, options?: SendOptions): Promise<EndpointOutput<E>> {
  const request = toWireRequest(endpoint, input)
  return parseResponse(endpoint, request, await exchange(request, options))
}

/** Send, and on success replay anything queued: a working round trip means the queue can drain. */
export async function exchange(request: WireRequest, options?: SendOptions): Promise<unknown> {
  const body = await send(request, options)
  void requestFlush()
  return body
}

interface LooseInput {
  params?: Record<string, string | number>
  query?: Record<string, unknown>
  body?: unknown
}

/** Validate the caller's input with the endpoint's own schemas (nothing invalid is sent or queued) and build the request. */
export function toWireRequest<E extends Endpoint>(endpoint: E, input: EndpointInput<E>): WireRequest {
  const { params, query, body } = input as LooseInput
  const label = `${endpoint.method} ${endpoint.path}`
  for (const [schema, value] of [
    [endpoint.params, params],
    [endpoint.query, query],
    [endpoint.body, body],
  ] as const) {
    if (!schema) continue
    const result = schema.safeParse(value)
    if (!result.success) throw schemaError('invalid-request', label, result.error)
  }
  return {
    method: endpoint.method,
    path: buildPath(endpoint.path, params) + queryString(query),
    body: endpoint.body ? body : undefined,
  }
}

export function parseResponse<E extends Endpoint>(endpoint: E, request: WireRequest, body: unknown): EndpointOutput<E> {
  const result = endpoint.response.safeParse(body)
  if (!result.success) throw schemaError('invalid-response', `${request.method} ${request.path}`, result.error)
  return result.data as EndpointOutput<E>
}

function queryString(query: Record<string, unknown> | undefined): string {
  if (!query) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item === undefined || item === null) continue
      search.append(key, item instanceof Date ? item.toISOString() : String(item))
    }
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
