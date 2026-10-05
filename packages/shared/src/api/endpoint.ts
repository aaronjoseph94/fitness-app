// Owns: the shape of one REST endpoint contract. The Worker validates with it; the web client calls through it.
// One definition per endpoint lives in ./endpoints.ts — the single source of truth for paths, inputs and outputs.
import type * as z from 'zod'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface Endpoint<
  P extends z.ZodType | undefined = z.ZodType | undefined,
  Q extends z.ZodType | undefined = z.ZodType | undefined,
  B extends z.ZodType | undefined = z.ZodType | undefined,
  R extends z.ZodType = z.ZodType,
> {
  method: HttpMethod
  /** Express-style path under the site root, e.g. '/api/meals/:id'. */
  path: string
  params?: P
  query?: Q
  body?: B
  response: R
  /** Whether the PWA may queue this write in the offline queue (it must be idempotent: client-generated `id`). */
  offline?: 'queue' | 'never'
}

type Infer<T> = T extends z.ZodType ? z.infer<T> : undefined
type InferIn<T> = T extends z.ZodType ? z.input<T> : undefined

/** Everything a caller supplies: path params, query and body (absent parts are omitted). */
export type EndpointInput<E extends Endpoint> = (E['params'] extends z.ZodType ? { params: InferIn<E['params']> } : {}) &
  (E['query'] extends z.ZodType ? { query: InferIn<E['query']> } : {}) &
  (E['body'] extends z.ZodType ? { body: InferIn<E['body']> } : {})

export type EndpointOutput<E extends Endpoint> = Infer<E['response']>

/** Identity helper that keeps the literal types of an endpoint definition. */
export function defineEndpoint<
  P extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  B extends z.ZodType | undefined = undefined,
  R extends z.ZodType = z.ZodType,
>(e: Endpoint<P, Q, B, R>): Endpoint<P, Q, B, R> {
  return e
}

/** Fill ':param' segments: buildPath('/api/meals/:id', { id: 'x' }) → '/api/meals/x'. */
export function buildPath(path: string, params?: Record<string, string | number>): string {
  return path.replace(/:([A-Za-z_]+)/g, (_, k: string) => {
    const v = params?.[k]
    if (v === undefined) throw new Error(`Missing path param "${k}" for ${path}`)
    return encodeURIComponent(String(v))
  })
}
