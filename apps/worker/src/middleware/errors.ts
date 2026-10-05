// Owns: turning a thrown error into the API's JSON error body {error, message} — HttpError keeps its status and code,
// anything else is a logged 500 'internal' tagged with the request id.
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
  return c.json({ error: 'internal', message: 'Something went wrong on the server' }, 500, headers)
}

function log(err: Error, method: string, path: string, requestId: string | undefined) {
  console.error(
    JSON.stringify({ level: 'error', request_id: requestId, method, path, name: err.name, message: err.message, stack: err.stack }),
  )
}
