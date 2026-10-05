// Owns: the files module's interface — our signed, expiring R2 file URLs (/api/files/<encoded key>?exp=&sig=) and
// serving a file behind one. Every module that hands the PWA a file (meal photos, scan sheets, progress photos,
// report PDFs) signs it here; R2 is never reached any other way.
import type { FileKey, SignedFile, SignedFileQuery } from '@fitness/shared/schemas'
import type { Env } from '../../env'
import type { Deps } from '../../lib/deps'
import { HttpError, notFound } from '../../lib/http-error'
import { sign, verify } from './lib/signature'

/** Default lifetime of a signed URL (1 hour). */
export const FILE_URL_TTL_SECONDS = 3600

/**
 * Sign `key` for `ttlSeconds`: exp = ⌊now / 1000⌋ + ttl (unix seconds); url = /api/files/<encodeURIComponent(key)>?exp&sig.
 * The key is percent-encoded into one path segment so its slashes survive the router.
 */
export async function signFileUrl(env: Env, key: FileKey, ttlSeconds = FILE_URL_TTL_SECONDS, now = new Date()): Promise<SignedFile> {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds
  const sig = await sign(env.FILE_URL_SECRET, key, exp)
  return {
    key,
    url: `/api/files/${encodeURIComponent(key)}?exp=${exp}&sig=${sig}`,
    expires_at: new Date(exp * 1000).toISOString(),
  }
}

/**
 * Stream the R2 object behind a signed URL. 403 when the link expired (exp < now) or the signature does not match;
 * 404 when the object is gone. Cached privately until the link expires.
 */
export async function serveSignedFile(deps: Deps, input: { key: FileKey } & SignedFileQuery): Promise<Response> {
  const exp = Number(input.exp)
  const nowSec = Math.floor(deps.now().getTime() / 1000)
  if (!(await verify(deps.env.FILE_URL_SECRET, input.key, exp, input.sig))) throw new HttpError(403, 'bad_signature', 'File link is not valid')
  if (exp < nowSec) throw new HttpError(403, 'link_expired', 'File link has expired')

  const object = await deps.env.FILES.get(input.key)
  if (!object) throw notFound('File')
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream')
  headers.set('etag', object.httpEtag)
  headers.set('content-length', String(object.size))
  headers.set('cache-control', `private, max-age=${Math.max(0, exp - nowSec)}`)
  headers.set('x-content-type-options', 'nosniff')
  return new Response(object.body, { headers })
}
