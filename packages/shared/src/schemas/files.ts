// Owns: R2 file keys, our HMAC-signed file URLs (/api/files/:key?exp=&sig=), and the binary upload body.
import * as z from 'zod'
import { Instant } from './common'

/** R2 prefixes (SPEC §4). Monthly backups live under reports/backup/<YYYY-MM>/ (modules/export). */
export const FilePrefix = z.enum(['meal-photos', 'scan-sheets', 'progress-photos', 'reports'])
export type FilePrefix = z.infer<typeof FilePrefix>

/** An R2 object key: a known prefix, then path segments of [A-Za-z0-9_.-], never "..". */
export const FileKey = z
  .string()
  .max(512)
  .regex(new RegExp(`^(${FilePrefix.options.join('|')})(/[\\w.-]+)+$`))
  .refine((k) => !k.split('/').includes('..'), { message: 'File key may not contain ".."' })
export type FileKey = z.infer<typeof FileKey>

/** A signed, expiring URL the Worker hands out for a file; the only way the PWA reads R2. */
export const FileUrl = z.string().startsWith('/api/files/')
export type FileUrl = z.infer<typeof FileUrl>

/** Query of GET /api/files/:key — expiry (unix seconds) and base64url HMAC signature. */
export const SignedFileQuery = z.object({
  exp: z.string().regex(/^\d+$/),
  sig: z.string().regex(/^[A-Za-z0-9_-]+$/),
})
export type SignedFileQuery = z.infer<typeof SignedFileQuery>

export const SignedFile = z.object({ key: FileKey, url: FileUrl, expires_at: Instant })
export type SignedFile = z.infer<typeof SignedFile>

/**
 * A raw binary request or response body. Endpoints whose body is Binary are sent as `application/octet-stream`
 * (the browser already downscaled/stripped the image); every other body is JSON. The Worker streams it to R2.
 */
export const Binary = z.instanceof(ArrayBuffer)
export type Binary = z.infer<typeof Binary>

/** Upper bound for one uploaded file (a 1,024 px photo is far below this; a scan PDF can be a few MB). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** An upload body: non-empty and at most MAX_UPLOAD_BYTES. */
export const Upload = Binary.refine((b) => b.byteLength > 0 && b.byteLength <= MAX_UPLOAD_BYTES, {
  message: `Upload must be 1 byte to ${MAX_UPLOAD_BYTES} bytes`,
})

/** Images leave the browser re-encoded by canvas, EXIF stripped. */
export const ImageType = z.enum(['image/jpeg', 'image/webp'])
export type ImageType = z.infer<typeof ImageType>
