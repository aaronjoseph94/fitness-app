// Owns: turning a thrown error into the API's JSON error body {error, message} — HttpError keeps its status and code,
// a D1 constraint violation (UNIQUE / FOREIGN KEY / CHECK) is a logged 409 'conflict' (the request can never succeed as
// sent, so the PWA's offline queue sets it aside instead of retrying it forever), anything else is a logged 500
// 'internal' tagged with the request id.
import type { ErrorHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'
import type { AppEnv } from '../env'
import { HttpError } from '../lib/http-error'

export const handleError: ErrorHandler<AppEnv> = (err, c) => {
  const requestId = c.get('requestId')
  const headers = requestId ? { 'X-Request-Id': requestId } : undefined
  if (err instanceof HttpError) {
    if (err.status >= 500) log(err, c.req.method, c.req.path, requestId)
    const body = err.details === undefined ? { error: err.code, message: err.message } : { error: err.code, message: err.message, details: err.details }
    return c.json(body, err.status, headers)
  }
  if (err instanceof HTTPException) {
    return c.json({ error: err.status === 401 ? 'unauthorized' : 'http_error', message: err.message }, err.status, headers)
  }
  log(err, c.req.method, c.req.path, requestId)
  if (isConstraintViolation(err))
    return c.json({ error: 'conflict', message: 'This change conflicts with data already stored' }, 409, headers)
  return c.json({ error: 'internal', message: 'Something went wrong on the server' }, 500, headers)
}

/** SQLite's constraint messages as D1 reports them, e.g. "D1_ERROR: UNIQUE constraint failed: weight_logs.date". */
const CONSTRAINT = /\b(UNIQUE|FOREIGN KEY|CHECK) constraint failed\b/

/** True when `err`, or an error it wraps (Drizzle wraps D1's in `cause`), is a constraint violation. */
function isConstraintViolation(err: unknown): boolean {
  for (let e = err, depth = 0; e instanceof Error && depth < 5; e = e.cause, depth++) if (CONSTRAINT.test(e.message)) return true
  return false
}

function log(err: Error, method: string, path: string, requestId: string | undefined) {
  console.error(
    JSON.stringify({ level: 'error', request_id: requestId, method, path, name: err.name, message: err.message, stack: err.stack }),
  )
}
