// Owns: progress photos (front/side/back) — the photo as the API returns it (signed URL, pixel size, the day's trend
// weight, the nearest confirmed scan), the upload query and the list query.
// Progress photos never go to any LLM (CLAUDE.md privacy rail): no job payload, tool output or prompt references them.
import * as z from 'zod'
import { Id, Instant, Kg, LocalDate, Percent, QueryInt, Row } from './common'
import { FileUrl, ImageType } from './files'

export const Pose = z.enum(['front', 'side', 'back'])
export type Pose = z.infer<typeof Pose>

/** The browser downscales every progress photo to at most this many pixels on the long side before upload. */
export const PHOTO_MAX_EDGE = 1024

/** The confirmed scan closest in time to a photo, with the two numbers worth showing beside it. */
export const PhotoScan = z.object({
  id: Id,
  date: LocalDate,
  body_fat_pct: Percent.nullable(),
  weight_kg: Kg.nullable(),
})
export type PhotoScan = z.infer<typeof PhotoScan>

export const ProgressPhoto = Row.extend({
  taken_at: Instant,
  /** Edmonton local date of taken_at. */
  date: LocalDate,
  pose: Pose,
  /** Short-lived signed URL; fetch the list again after `url_expires_at`. */
  url: FileUrl,
  url_expires_at: Instant,
  /** Pixel size as uploaded (null on photos stored before sizes were kept). */
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  /** The day's trend weight (null before the first weigh-in). */
  weight_kg: Kg.nullable(),
  /** The confirmed scan nearest to taken_at (before or after), or null when there is none. */
  nearest_scan: PhotoScan.nullable(),
  note: z.string().nullable(),
})
export type ProgressPhoto = z.infer<typeof ProgressPhoto>

/** Pixel size of an uploaded photo: a whole number from 1 to PHOTO_MAX_EDGE (the browser already downscaled it). */
const PhotoEdge = QueryInt.refine((n) => n >= 1 && n <= PHOTO_MAX_EDGE, { message: `Must be 1 to ${PHOTO_MAX_EDGE} px` })

/** Query of POST /api/photos (body: the downscaled, EXIF-stripped image as Binary). Replaying an id returns the stored photo. */
export const PhotoUploadQuery = z.object({
  id: Id,
  taken_at: Instant,
  pose: Pose,
  width: PhotoEdge,
  height: PhotoEdge,
  content_type: ImageType,
  note: z.string().trim().max(500).optional(),
})
export type PhotoUploadQuery = z.infer<typeof PhotoUploadQuery>

/** Query of GET /api/photos: newest first, optionally one pose and an inclusive range of local dates. */
export const PhotoListQuery = z.object({ pose: Pose.optional(), from: LocalDate.optional(), to: LocalDate.optional() })
export type PhotoListQuery = z.infer<typeof PhotoListQuery>
