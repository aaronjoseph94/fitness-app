// Owns: the header check on an uploaded image (progress photos, meal photos, scan sheets, exercise photos) — the bytes
// are the declared type (JPEG, WebP or PNG magic numbers) and carry no metadata block: the browser re-encodes through
// canvas, which drops it; this refuses anything that did not. Metadata here is anything that can hold GPS, a device or
// a name: in JPEG every APPn segment but APP0 JFIF and APP14 Adobe, COM, and anything after EOI; PNG eXIf / tEXt /
// iTXt / zTXt chunks; in WebP any chunk but image data, alpha, animation and ICCP, and anything past the RIFF size.
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
 * JPEG: walk the marker segments from SOI (FF D8) to EOI (FF D9); true when anything that is not plain image data
 * appears. Allowed segments: APP0 with the JFIF id (what canvas writes in Chrome and Safari), APP2 "ICC_PROFILE"
 * (a colour profile, which a browser may embed and which names no person or place), APP14 "Adobe" (colour
 * transform), and the codec's own (DQT, DHT, SOFn, DRI, SOS, …). Refused: every other APPn (Exif, XMP, MPF, IPTC, C2PA,
 * maker notes), APP0 JFXX (a thumbnail that is itself a JPEG), COM (FF FE), a second SOI (an embedded image), and any byte after the first EOI — the file
 * must end with FF D9 exactly. Segment data is jumped over by its length; inside entropy-coded data only an FF that
 * is not stuffing (FF 00), a restart (FF D0–D7) or fill (FF FF) is a marker, found with indexOf (native, no decode). A
 * byte that is not a marker where one must be, or a file that stops before EOI, is malformed.
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
    if (marker === 0xd9) return at + 2 !== b.length // EOI: nothing may follow it
    if (marker === 0xd8 || marker === 0xfe) return true // an embedded image, a comment
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      at += 2 // standalone markers carry no length
      continue
    }
    if (at + 3 >= b.length) throw new Malformed()
    const length = (b[at + 2]! << 8) | b[at + 3]!
    if (length < 2) throw new Malformed()
    if (marker >= 0xe0 && marker <= 0xef) {
      const ok =
        marker === 0xe0
          ? ascii(b, at + 4, 5) === 'JFIF\0'
          : marker === 0xe2
            ? ascii(b, at + 4, 12) === 'ICC_PROFILE\0'
            : marker === 0xee && ascii(b, at + 4, 5) === 'Adobe'
      if (!ok) return true
    }
    at += 2 + length
    if (marker === 0xda) at = nextMarker(b, at) // the scan's entropy-coded data runs up to the next real marker
  }
  throw new Malformed() // no EOI
}

/** The index of the next marker in entropy-coded data from `from` (b.length when there is none). */
function nextMarker(b: Uint8Array, from: number): number {
  let at = b.indexOf(0xff, from)
  while (at >= 0 && at + 1 < b.length) {
    const next = b[at + 1]!
    if (next !== 0x00 && next !== 0xff && !(next >= 0xd0 && next <= 0xd7)) return at
    at = b.indexOf(0xff, at + (next === 0xff ? 1 : 2))
  }
  return b.length
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

/** The WebP chunks a browser encoder writes: image data, alpha, animation, and a colour profile. */
const WEBP_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP'])

/** VP8X flags: bit 3 = the file has an EXIF chunk, bit 2 = an XMP chunk. */
const VP8X_METADATA_FLAGS = 0x08 | 0x04

/**
 * WebP: walk the RIFF chunks after "WEBP"; true for any chunk outside WEBP_CHUNKS (EXIF, "XMP ", or anything
 * unknown), VP8X flags announcing EXIF / XMP, or bytes past the RIFF size (8 + its little-endian size field).
 */
function webpHasMetadata(b: Uint8Array): boolean {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const riffEnd = 8 + view.getUint32(4, true)
  if (b.length > riffEnd) return true
  let at = 12
  while (at + 8 <= b.length) {
    const fourcc = ascii(b, at, 4)
    const size = view.getUint32(at + 4, true)
    if (!WEBP_CHUNKS.has(fourcc)) return true
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
  if (found)
    throw new HttpError(
      422,
      'exif_present',
      'The image still carries EXIF or other metadata; re-encode it in the browser first',
    )
}
