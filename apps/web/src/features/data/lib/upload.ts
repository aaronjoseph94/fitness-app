// Owns: the one binary call the restore makes — POST /api/import/files with the file as application/octet-stream and
// its key in the query — validated against the shared contract and failing with ApiError like every other call.
import { endpoints } from '@fitness/shared/api'
import { ImportFileQuery, MAX_UPLOAD_BYTES } from '@fitness/shared/schemas'
import { ApiError } from '../../../api'

const UPLOAD_TIMEOUT_MS = 60_000

export async function uploadImportFile(
  query: ImportFileQuery,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  const endpoint = endpoints.export.importFile
  const search = new URLSearchParams({
    key: query.key,
    restore_id: query.restore_id,
    overwrite: String(query.overwrite),
  })
  const path = `${endpoint.path}?${search.toString()}`
  const label = `POST ${path}`
  if (
    !ImportFileQuery.safeParse(query).success ||
    bytes.byteLength === 0 ||
    bytes.byteLength > MAX_UPLOAD_BYTES
  )
    throw new ApiError({
      kind: 'invalid-request',
      request: label,
      message: `${query.key} is empty, too large or has an unexpected name`,
    })

  const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/octet-stream' },
      body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
      credentials: 'include',
      // Access answers an expired session with a redirect: see it, never follow it.
      redirect: 'manual',
      signal: AbortSignal.any([signal, timeout]),
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiError({
      kind: 'network',
      request: label,
      message: navigator.onLine ? 'Could not reach the server' : 'You are offline',
    })
  }
  if (response.type === 'opaqueredirect' || response.status === 401)
    throw new ApiError({ kind: 'auth-expired', request: label, message: 'Your sign-in expired' })
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined)
    const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const code = typeof fields.error === 'string' ? fields.error : null
    const message = typeof fields.message === 'string' ? fields.message : (code ?? `HTTP ${response.status}`)
    throw new ApiError({ kind: 'http', request: label, status: response.status, code, message, detail: body })
  }
}
