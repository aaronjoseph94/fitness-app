// Owns: the header check on an uploaded image (progress photos, meal photos, scan sheets, exercise photos) — the bytes
// are the declared type (JPEG, WebP or PNG magic numbers) and carry no metadata block: the browser re-encodes through
// canvas, which drops it; this refuses anything that did not. Metadata here is anything that can hold GPS, a device or
// a name: JPEG APP1 segments (Exif and XMP), PNG eXIf / tEXt / iTXt / zTXt chunks, WebP EXIF / XMP chunks.
// The check walks the container's segment or chunk headers and jumps over their data, so it reads a few bytes per
// segment however large the file is; the Worker never decodes or processes images (free-plan CPU, CLAUDE.md).
import type { ImageType } from '@fitness/shared/schemas'
import { HttpError } from '../../../lib/http-error'

/** What can be checked: the photo types, plus PNG for scan sheets (the browser renders a PDF sheet to a PNG). */
export type CheckedImageType = ImageType | 'image/png'

const ascii = (b: Uint8Array, at: number, len: number) => String.fromCharCode(...b.subarray(at, at + len))

/** A file whose structure does not parse: we cannot tell what it carries, so it is refused like a wrong type. */
class Malformed extends Error {}

/**
 * JPEG: walk the marker segments from SOI (FF D8) to SOS (FF DA), the start of the image data; true when any APP1
 * (FF E1) segment appears — Exif, or XMP ("http://ns.adobe.com/xap/1.0/"), which can repeat the GPS position. Every
 * segment before SOS is walked (no byte cap: a camera can put 128 KB of other segments first). A segment that runs
 * past the end leaves nothing further to hide in; a byte that is not a marker where one must be is malformed.
 */
function jpegHasMetadata(b: Uint8Array): boolean {
  let at = 2
  while (at + 1 < b.length) {
    if (b[at] !== 0xff) throw new Malformed()
    const marker = b[at + 1]!
    if (marker === 0xff) {
      at += 1 // fill byte before a marker
      continue
    }
    if (marker === 0xda || marker === 0xd9) return false // image data (or the end) starts: headers are done
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2 // standalone markers carry no length
      continue
    }
    if (marker === 0xe1) return true
    if (at + 3 >= b.length) return false
    const length = (b[at + 2]! << 8) | b[at + 3]!
    if (length < 2) throw new Malformed()
    at += 2 + length
  }
  return false
}

/** PNG chunks that carry metadata: Exif, and the three text chunks (comments, XMP as iTXt "XML:com.adobe.xmp"). */
const PNG_METADATA = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt'])

/** PNG: walk every chunk header after the signature (metadata may follow the image data) up to IEND. */
function pngHasMetadata(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let at = 8
  while (at + 8 <= b.length) {
    const length = view.getUint32(at)
    const type = ascii(b, at + 4, 4)
    if (PNG_METADATA.has(type)) return true
    if (type === 'IEND') return false
    at += 12 + length // length, type, data, CRC
  }
  return false
}

/** VP8X flags: bit 3 = the file has an EXIF chunk, bit 2 = an XMP chunk. */
const VP8X_METADATA_FLAGS = 0x08 | 0x04

/** WebP: walk the RIFF chunks after "WEBP"; true for an EXIF or "XMP " chunk, or VP8X flags announcing one. */
function webpHasMetadata(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  let at = 12
  while (at + 8 <= b.length) {
    const fourcc = ascii(b, at, 4)
    const size = view.getUint32(at + 4, true)
    if (fourcc === 'EXIF' || fourcc === 'XMP ') return true
    if (fourcc === 'VP8X' && at + 8 < b.length && (b[at + 8]! & VP8X_METADATA_FLAGS) !== 0) return true
    at += 8 + size + (size % 2) // chunks are padded to an even size
  }
  return false
}

const MAGIC: Record<CheckedImageType, (b: Uint8Array) => boolean> = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.length > 20 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP',
  'image/png': (b) => b.length >= 8 && ascii(b, 0, 8) === '\x89PNG\r\n\x1a\n',
}

const HAS_METADATA: Record<CheckedImageType, (b: Uint8Array) => boolean> = {
  'image/jpeg': jpegHasMetadata,
  'image/webp': webpHasMetadata,
  'image/png': pngHasMetadata,
}

/** Throw 422 unless `image` is a well-formed `type` file without EXIF, XMP or text metadata. */
export function checkPhotoBytes(image: ArrayBuffer, type: CheckedImageType): void {
  const b = new Uint8Array(image)
  const notAnImage = () => new HttpError(422, 'not_an_image', `The upload is not a ${type} file`)
  if (!MAGIC[type](b)) throw notAnImage()
  let found: boolean
  try {
    found = HAS_METADATA[type](b)
  } catch (e) {
    if (e instanceof Malformed) throw notAnImage()
    throw e
  }
  if (found) throw new HttpError(422, 'exif_present', 'The image still carries EXIF or other metadata; re-encode it in the browser first')
}
