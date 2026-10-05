// Owns: turning the picked Evolt sheet into pixels in the browser — an image drawn to a canvas, or page 1 of a PDF
// rendered with pdfjs-dist (its worker bundled by Vite, loaded only when a PDF is picked) — and exporting the canvas
// with the name box painted black, so the name never leaves the phone (SPEC §8, §9 privacy).
import type { ScanUploadQuery } from '@fitness/shared/schemas'

/** Long side of the rendered sheet: enough for the vision model to read the small segmental table. */
const MAX_SIDE_PX = 2200
/** Above this a PNG is re-encoded as JPEG (keeps uploads quick on mobile data; the contract allows 10 MB). */
const PNG_LIMIT_BYTES = 4 * 1024 * 1024

/** The black box, as fractions (0–1) of the sheet's width and height. */
export interface MaskBox {
  x: number
  y: number
  w: number
  h: number
}

/** The mask is pixel data, not styling: solid black, painted into the exported image and shown as-is on screen. */
export const MASK_COLOUR = '#000000'
/** PDFs render on white (the sheet's own background). */
const PAGE_COLOUR = '#FFFFFF'

/** Default: the top band of the sheet, where Evolt prints the name. */
export const DEFAULT_MASK: MaskBox = { x: 0, y: 0, w: 1, h: 0.1 }

export const ACCEPT = 'application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg'

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  return canvas
}

async function renderImage(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error("That image couldn't be opened. Try a PNG or JPG of the sheet.")
  })
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(bitmap.width, bitmap.height))
  const canvas = canvasOf(bitmap.width * scale, bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = PAGE_COLOUR
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas
}

async function renderPdfFirstPage(file: File): Promise<HTMLCanvasElement> {
  // The legacy build: pdf.js 6 calls Map.prototype.getOrInsertComputed, which older Safari/Chromium lack; the legacy
  // build polyfills it (and the rest) in both the page and the worker.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise.catch(() => {
    throw new Error("That PDF couldn't be opened. Try saving the sheet as an image instead.")
  })
  try {
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(4, MAX_SIDE_PX / Math.max(base.width, base.height)) })
    const canvas = canvasOf(viewport.width, viewport.height)
    await page.render({ canvas, viewport, background: PAGE_COLOUR }).promise
    return canvas
  } finally {
    void task.destroy()
  }
}

/** The sheet as a canvas: page 1 of a PDF, or the image, scaled to at most 2,200 px on the long side. */
export function renderSheet(file: File): Promise<HTMLCanvasElement> {
  return isPdf(file) ? renderPdfFirstPage(file) : renderImage(file)
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the sheet'))), type, quality))
}

/** A copy of the sheet with the box painted solid black, as PNG (JPEG when the PNG is large). */
export async function maskedSheet(source: HTMLCanvasElement, box: MaskBox): Promise<{ blob: Blob; content_type: ScanUploadQuery['content_type'] }> {
  const canvas = canvasOf(source.width, source.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  ctx.fillStyle = MASK_COLOUR
  ctx.fillRect(box.x * canvas.width, box.y * canvas.height, box.w * canvas.width, box.h * canvas.height)
  const png = await toBlob(canvas, 'image/png')
  if (png.size <= PNG_LIMIT_BYTES) return { blob: png, content_type: 'image/png' }
  return { blob: await toBlob(canvas, 'image/jpeg', 0.9), content_type: 'image/jpeg' }
}
