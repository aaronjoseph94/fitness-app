// Owns: binding one shared Endpoint contract to a Hono handler — parse params/query/body with the contract's Zod
// schemas, build Deps, call the module, return JSON. Routes stay one line each; validation can't drift from the contract.
import type { Endpoint, EndpointOutput } from '@fitness/shared/api'
import type { Context } from 'hono'
import * as z from 'zod'
import type { App, AppEnv } from '../env'
import { depsFromContext, type Deps } from './deps'
import { HttpError } from './http-error'

type Parsed<T> = [Exclude<T, undefined>] extends [never]
  ? undefined
  : Exclude<T, undefined> extends z.ZodType
    ? z.output<Exclude<T, undefined>>
    : undefined

/** What a handler receives: parsed (validated, transformed) params, query and body. */
export interface RouteInput<E extends Endpoint> {
  params: Parsed<E['params']>
  query: Parsed<E['query']>
  body: Parsed<E['body']>
}

export type RouteHandler<E extends Endpoint> = (
  input: RouteInput<E>,
  deps: Deps,
  c: Context<AppEnv>,
) => Promise<EndpointOutput<E> | Response> | EndpointOutput<E> | Response

/** A Binary/Upload body accepts an ArrayBuffer but not a plain object (an all-optional object schema accepts both). */
const isBinary = (schema: z.ZodType | undefined) =>
  !!schema && schema.safeParse(new ArrayBuffer(1)).success && !schema.safeParse({}).success

/** The media type of the request without parameters ("application/json; charset=utf-8" → "application/json"). */
const mediaType = (c: Context<AppEnv>) => (c.req.header('content-type') ?? '').split(';')[0]!.trim().toLowerCase()

const unsupported = (expected: string) =>
  new HttpError(415, 'unsupported_media_type', `Send this request body as ${expected}`)

/**
 * Read the body the endpoint declares. A body must say what it is: JSON as application/json, a Binary/Upload as
 * application/octet-stream. A cross-site HTML form can only send text/plain, urlencoded or multipart, so it never
 * reaches validation (CSRF). Only a request with no body at all (and no Content-Type) counts as {} for all-optional
 * JSON bodies (e.g. FastEnd).
 */
async function readBody(c: Context<AppEnv>, schema: z.ZodType | undefined): Promise<unknown> {
  if (!schema) return undefined
  const type = mediaType(c)
  if (isBinary(schema)) {
    if (type !== 'application/octet-stream') throw unsupported('application/octet-stream')
    return c.req.arrayBuffer()
  }
  if (type !== '' && type !== 'application/json') throw unsupported('application/json')
  const text = await c.req.text()
  if (text.trim() === '') return {}
  if (type === '') throw unsupported('application/json')
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be JSON')
  }
}

function parse<T extends z.ZodType | undefined>(schema: T, value: unknown, part: string): Parsed<T> {
  if (!schema) return undefined as Parsed<T>
  let r: z.ZodSafeParseResult<unknown>
  try {
    r = schema.safeParse(value)
  } catch (err) {
    // A schema step that throws on a value it cannot read (e.g. an unparseable instant) is still the caller's input.
    throw new HttpError(400, 'invalid_request', `Invalid ${part}: a value could not be read (${err instanceof Error ? err.message : String(err)})`)
  }
  if (!r.success) throw new HttpError(400, 'invalid_request', `Invalid ${part}: ${z.prettifyError(r.error)}`, r.error.issues)
  return r.data as Parsed<T>
}

/** Register `endpoint` on `app`. The handler returns the response body (validated in dev) or a raw Response. */
export function route<E extends Endpoint>(app: App, endpoint: E, handler: RouteHandler<E>, opts: { status?: 200 | 201 } = {}) {
  const method = endpoint.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
  app[method](endpoint.path, async (c) => {
    // Hono has already percent-decoded each param once (a file key's %2F is a slash here); decoding again breaks "%".
    const input = {
      params: parse(endpoint.params, c.req.param(), 'path params'),
      query: parse(endpoint.query, c.req.query(), 'query'),
      body: parse(endpoint.body, await readBody(c, endpoint.body), 'body'),
    } as RouteInput<E>
    const out = await handler(input, depsFromContext(c), c)
    if (out instanceof Response) return out
    // Validate outputs locally (cheap insurance against contract drift); skipped in production to save CPU.
    if (c.env.DEV_AUTH_BYPASS === '1') {
      const r = endpoint.response.safeParse(out)
      if (!r.success) throw new HttpError(500, 'invalid_response', `Response for ${endpoint.method} ${endpoint.path} broke the contract: ${z.prettifyError(r.error)}`)
    }
    return c.json(out as object, opts.status ?? 200)
  })
}
