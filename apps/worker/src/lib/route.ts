// Owns: binding one shared Endpoint contract to a Hono handler — parse params/query/body with the contract's Zod
// schemas, build Deps, call the module, return JSON. Routes stay one line each; validation can't drift from the contract.
import type { Endpoint, EndpointOutput } from '@fitness/shared/api'
import type { Context } from 'hono'
import * as z from 'zod'
import type { App, AppEnv } from '../env'
import { depsFromContext, type Deps } from './deps'
import { HttpError } from './http-error'

type Parsed<T> = T extends z.ZodType ? z.output<T> : undefined

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

const isBinary = (schema: z.ZodType | undefined) =>
  !!schema && (schema as z.ZodType).safeParse(new ArrayBuffer(1)).success

async function readBody(c: Context<AppEnv>, schema: z.ZodType | undefined): Promise<unknown> {
  if (!schema) return undefined
  if (isBinary(schema)) return c.req.arrayBuffer()
  try {
    return await c.req.json()
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be JSON')
  }
}

function parse<T extends z.ZodType | undefined>(schema: T, value: unknown, part: string): Parsed<T> {
  if (!schema) return undefined as Parsed<T>
  const r = schema.safeParse(value)
  if (!r.success) throw new HttpError(400, 'invalid_request', `Invalid ${part}: ${z.prettifyError(r.error)}`, r.error.issues)
  return r.data as Parsed<T>
}

/** Register `endpoint` on `app`. The handler returns the response body (validated in dev) or a raw Response. */
export function route<E extends Endpoint>(app: App, endpoint: E, handler: RouteHandler<E>, opts: { status?: 200 | 201 } = {}) {
  const method = endpoint.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'
  app[method](endpoint.path, async (c) => {
    const rawParams = Object.fromEntries(Object.entries(c.req.param() as Record<string, string>).map(([k, v]) => [k, decodeURIComponent(v)]))
    const input = {
      params: parse(endpoint.params, rawParams, 'path params'),
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
