// Owns: the typed HTTP error modules throw (status + machine code + message) and the JSON error body shape {error, message}.
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 415 | 422 | 429 | 500 | 502 | 503,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`)
export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'invalid_request', message, details)
