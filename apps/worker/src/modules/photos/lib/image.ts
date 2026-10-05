// Owns: the header check on an uploaded progress photo — the bytes are the declared type (JPEG or WebP magic numbers)
// and carry no EXIF block (the browser re-encodes through canvas, which drops it; this refuses anything that did not).
// Reads a few header bytes only: the Worker never decodes or processes images (free-plan CPU, CLAUDE.md).
import type { ImageType } from '@fitness/shared/schemas'
import { HttpError } from '../../../lib/http-error'

/** How far into a JPEG we follow segment headers looking for APP1 "Exif" before giving up (EXIF sits up front). */
const JPEG_HEADER_SCAN_BYTES = 64 * 1024

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len))

/** JPEG: walk the marker segments from SOI (FF D8) to SOS (FF DA); true when an APP1 (FF E1) segment starts "Exif\0". */
function jpegHasExif(b: Uint8Array): boolean {
  let at = 2
  const end = Math.min(b.length, JPEG_HEADER_SCAN_BYTES)
  while (at + 4 <= end && b[at] === 0xff) {
    const marker = b[at + 1]!
    if (marker === 0xda || marker === 0xd9) return false
    const length = (b[at + 2]! << 8) | b[at + 3]!
    if (marker === 0xe1 && ascii(b, at + 4, 4) === 'Exif') return true
    at += 2 + length
  }
  return false
}

/** WebP: RIFF container; an extended file (VP8X) sets bit 3 of its flags byte when it carries an EXIF chunk. */
function webpHasExif(b: Uint8Array): boolean {
  return ascii(b, 12, 4) === 'VP8X' && (b[20]! & 0x08) !== 0
}

/** Throw 422 unless `image` is a `type` file without EXIF. */
export function checkPhotoBytes(image: ArrayBuffer, type: ImageType): void {
  const b = new Uint8Array(image)
  const isJpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
  const isWebp = b.length > 20 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP'
  if (type === 'image/jpeg' ? !isJpeg : !isWebp) throw new HttpError(422, 'not_an_image', `The upload is not a ${type} file`)
  if (type === 'image/jpeg' ? jpegHasExif(b) : webpHasExif(b)) {
    throw new HttpError(422, 'exif_present', 'The photo still carries EXIF metadata; re-encode it in the browser first')
  }
}
