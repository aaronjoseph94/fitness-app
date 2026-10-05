// Owns: meal photos on their way to the Worker (SPEC §9 privacy rail) — decode, downscale to at most 1,024 px on the
// long side, re-encode with canvas as WebP (JPEG where the browser cannot encode WebP), which drops EXIF and GPS since
// only pixels survive a canvas — and the binary upload POST /api/meals/:id/photos (octet-stream, metadata in the
// query; the shared JSON client cannot send binary bodies, so this is the one raw fetch in the logging kit).
import { buildPath, endpoints } from '@fitness/shared/api'
import { MAX_UPLOAD_BYTES, MealPhotoUploadQuery, type ImageType, type MealPhoto } from '@fitness/shared/schemas'
import { ApiError } from '../../../../api'

/** SPEC §9: meal photos are downscaled to 1,024 px before upload. */
export const MAX_PHOTO_EDGE = 1024
const QUALITY = 0.82
const UPLOAD_TIMEOUT_MS = 30_000

/** A photo ready to upload: re-encoded pixels only, with its own client id. */
export interface PreparedPhoto {
  id: string
  blob: Blob
  width: number
  height: number
  contentType: ImageType
  /** Object URL for the thumbnail; revoke it with releasePhoto. */
  previewUrl: string
}

/** The size that fits `max` on the long side: scale = min(1, max / max(width, height)), rounded, never 0. */
export function fitWithin(width: number, height: number, max = MAX_PHOTO_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    // <img> applies the EXIF orientation when it is drawn, so the canvas gets the photo the right way up.
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement, type: ImageType): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/** Downscale and re-encode one picked photo (camera or gallery). Throws a plain Error when it cannot be read. */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  let img: HTMLImageElement
  try {
    img = await decode(file)
  } catch {
    throw new Error("That photo couldn't be read. Try another, or take one with the camera.")
  }
  const size = fitWithin(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser can't resize photos.")
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, size.width, size.height)
  // Safari answers an unsupported type with a PNG: check what came back, then fall back to JPEG.
  let blob = await encode(canvas, 'image/webp')
  let contentType: ImageType = 'image/webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await encode(canvas, 'image/jpeg')
    contentType = 'image/jpeg'
  }
  if (!blob || blob.type !== contentType) throw new Error("This browser can't re-encode photos.")
  return { id: crypto.randomUUID(), blob, ...size, contentType, previewUrl: URL.createObjectURL(blob) }
}

export function releasePhoto(photo: PreparedPhoto): void {
  URL.revokeObjectURL(photo.previewUrl)
}

/**
 * Upload one prepared photo to a meal. Resolves with the stored MealPhoto (validated); throws ApiError like every
 * other call ('network' when offline or timed out, 'auth-expired' on an Access bounce, 'http' otherwise).
 */
export async function uploadMealPhoto(mealId: string, photo: PreparedPhoto, signal?: AbortSignal): Promise<MealPhoto> {
  const endpoint = endpoints.nutrition.addMealPhoto
  const query = { photo_id: photo.id, width: String(photo.width), height: String(photo.height), content_type: photo.contentType }
  const path = `${buildPath(endpoint.path, { id: mealId })}?${new URLSearchParams(query).toString()}`
  const label = `POST ${path}`
  const checked = MealPhotoUploadQuery.safeParse(query)
  if (!checked.success || photo.blob.size === 0 || photo.blob.size > MAX_UPLOAD_BYTES) {
    throw new ApiError({ kind: 'invalid-request', request: label, message: 'The photo is empty or too large' })
  }
  const timeout = AbortSignal.timeout(UPLOAD_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/octet-stream' },
      body: photo.blob,
      credentials: 'include',
      // Access answers an expired session with a redirect: see it, never follow it.
      redirect: 'manual',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiError({ kind: 'network', request: label, message: navigator.onLine ? 'Could not reach the server' : 'You are offline' })
  }
  if (response.type === 'opaqueredirect' || response.status === 401) {
    throw new ApiError({ kind: 'auth-expired', request: label, message: 'Your sign-in expired' })
  }
  const body: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const fields = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
    const code = typeof fields.error === 'string' ? fields.error : null
    const message = typeof fields.message === 'string' ? fields.message : (code ?? `HTTP ${response.status}`)
    throw new ApiError({ kind: 'http', request: label, status: response.status, code, message, detail: body })
  }
  const parsed = endpoint.response.safeParse(body)
  if (!parsed.success) throw new ApiError({ kind: 'invalid-response', request: label, message: 'Unexpected photo response', detail: parsed.error.issues })
  return parsed.data
}
