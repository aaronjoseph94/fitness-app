// Owns: generating a Web Push VAPID key pair (docs/DEPLOY.md): an ECDSA P-256 key made with WebCrypto, printed as
// base64url — the public key as the 65-byte uncompressed point (what browsers' PushManager.subscribe and the VAPID
// `k=` parameter take), the private key as the JWK `d` scalar (what @block65/webcrypto-web-push imports).
// Run: pnpm --filter @fitness/worker exec tsx scripts/vapid-keys.ts
// Then: wrangler secret put VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (and VAPID_SUBJECT = mailto:you@example.com).
// Changing the pair later invalidates every browser subscription: each device re-enables notifications once.

export {}

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair
const publicKey = base64url(new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer))
const { d } = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey
if (!d) throw new Error('WebCrypto did not export the private scalar')

console.log(`VAPID_PUBLIC_KEY=${publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${d}`)
console.log('')
console.log('Local: paste both lines into apps/worker/.dev.vars (with VAPID_SUBJECT=mailto:you@example.com).')
console.log('Production: wrangler secret put VAPID_PUBLIC_KEY, then VAPID_PRIVATE_KEY and VAPID_SUBJECT, from apps/worker.')
