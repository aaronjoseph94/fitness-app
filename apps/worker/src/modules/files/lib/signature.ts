// Owns: the HMAC-SHA256 signature of a file URL — sig = base64url(HMAC(FILE_URL_SECRET, "<key>\n<exp>")), with the
// CryptoKey imported once per isolate and verification done by crypto.subtle.verify (constant time).
import { HttpError } from '../../../lib/http-error'

let cached: { secret: string; key: CryptoKey } | null = null

async function hmacKey(secret: string | undefined): Promise<CryptoKey> {
  if (!secret) throw new HttpError(500, 'files_not_configured', 'FILE_URL_SECRET is not set')
  if (cached?.secret !== secret) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
      'sign',
      'verify',
    ])
    cached = { secret, key }
  }
  return cached.key
}

const message = (key: string, exp: number) => new TextEncoder().encode(`${key}\n${exp}`)

const toBase64Url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

function fromBase64Url(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0))
  } catch {
    return null
  }
}

export async function sign(secret: string | undefined, key: string, exp: number): Promise<string> {
  return toBase64Url(await crypto.subtle.sign('HMAC', await hmacKey(secret), message(key, exp)))
}

export async function verify(secret: string | undefined, key: string, exp: number, sig: string): Promise<boolean> {
  const bytes = fromBase64Url(sig)
  return !!bytes && crypto.subtle.verify('HMAC', await hmacKey(secret), bytes, message(key, exp))
}
