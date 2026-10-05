// Owns: sending the masked sheet to POST /api/scans as a binary body (application/octet-stream, metadata in the query,
// per the contract) — the JSON client only sends JSON — and reading the typed response. Never queued offline: the
// upload needs the server to start reading the sheet.
import { buildPath, endpoints } from '@fitness/shared/api'
import { ScanUploadQuery, type ScanUploaded } from '@fitness/shared/schemas'

const TIMEOUT_MS = 60_000

/** POST the sheet; resolves with the new scan and its scan_extract job, or throws an Error with a readable message. */
export async function uploadSheet(query: ScanUploadQuery, sheet: Blob): Promise<ScanUploaded> {
  const endpoint = endpoints.scans.upload
  const q = ScanUploadQuery.parse(query)
  const path = `${buildPath(endpoint.path, undefined)}?${new URLSearchParams({ id: q.id, content_type: q.content_type })}`
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      body: sheet,
      headers: { 'Content-Type': 'application/octet-stream', Accept: 'application/json' },
      credentials: 'include',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new Error(navigator.onLine ? "Couldn't reach the server. Try again in a moment." : "You're offline. Upload the sheet when you're back online.")
  }
  if (response.type === 'opaqueredirect' || response.status === 401) throw new Error('Your sign-in expired. Reload the app to sign in again.')
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { message?: unknown } | null)?.message
    throw new Error(typeof message === 'string' ? message : `Upload failed (HTTP ${response.status}).`)
  }
  const parsed = endpoint.response.safeParse(body)
  if (!parsed.success) throw new Error('The app and the server are out of step. Reload the app.')
  return parsed.data
}
