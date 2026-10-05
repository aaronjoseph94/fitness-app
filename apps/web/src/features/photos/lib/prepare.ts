// Owns: turning a camera frame or a picked file into an upload-ready progress photo — drawn onto a canvas at most
// 1,024 px on the long side and re-encoded as WebP (JPEG where the browser cannot encode WebP). Only pixels survive a
// canvas, so EXIF and GPS never leave the phone; the Worker refuses any file that still carries EXIF.
import { PHOTO_MAX_EDGE, type ImageType } from '@fitness/shared/schemas'

const QUALITY = 0.85

/** Camera shots are portrait 3:4 (width / height), the same frame the capture screen shows, so photos line up. */
export const PHOTO_ASPECT = 3 / 4

/** A photo ready to upload: re-encoded pixels only, with its own client id. */
export interface PreparedPhoto {
  id: string
  blob: Blob
  width: number
  height: number
  contentType: ImageType
  /** Object URL for the preview; revoke it with releasePhoto. */
  previewUrl: string
}

/** The size that fits `max` on the long side: scale = min(1, max / max(width, height)), rounded, never 0. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** The largest rectangle of `aspect` (width / height) centred in width × height: what object-fit: cover shows. */
export function centreCrop(width: number, height: number, aspect: number): Rect {
  if (width / height > aspect) {
    const w = Math.round(height * aspect)
    return { x: Math.round((width - w) / 2), y: 0, width: w, height }
  }
  const h = Math.round(width / aspect)
  return { x: 0, y: Math.round((height - h) / 2), width, height: h }
}

function encode(canvas: HTMLCanvasElement, type: ImageType): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/** Draw the `crop` of `source` downscaled and re-encode it. */
async function render(source: CanvasImageSource, crop: Rect): Promise<PreparedPhoto> {
  if (!crop.width || !crop.height) throw new Error("The camera hasn't started yet. Try again in a second.")
  const size = fitWithin(crop.width, crop.height)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("This browser can't resize photos.")
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height)
  // Safari answers an unsupported type with a PNG: check what came back, then fall back to JPEG.
  let contentType: ImageType = 'image/webp'
  let blob = await encode(canvas, contentType)
  if (!blob || blob.type !== contentType) {
    contentType = 'image/jpeg'
    blob = await encode(canvas, contentType)
  }
  if (!blob || blob.type !== contentType) throw new Error("This browser can't re-encode photos.")
  return { id: crypto.randomUUID(), blob, ...size, contentType, previewUrl: URL.createObjectURL(blob) }
}

/**
 * The current frame of a playing camera <video>, centre-cropped to 3:4 like the viewfinder, and never mirrored (the
 * front-camera preview is mirrored on screen only), so shots from either camera compare the right way round.
 */
export function photoFromVideo(video: HTMLVideoElement): Promise<PreparedPhoto> {
  return render(video, centreCrop(video.videoWidth, video.videoHeight, PHOTO_ASPECT))
}

/** A picked file (camera roll or the file-input camera). <img> applies the EXIF orientation before the canvas sees it. */
export async function photoFromFile(file: Blob): Promise<PreparedPhoto> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new Error("That photo couldn't be read. Try another one.")
    }
    return await render(img, { x: 0, y: 0, width: img.naturalWidth, height: img.naturalHeight })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function releasePhoto(photo: PreparedPhoto | null): void {
  if (photo) URL.revokeObjectURL(photo.previewUrl)
}
