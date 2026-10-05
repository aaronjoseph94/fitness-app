// Owns: progress photos (front/side/back) — the row, the upload query and the list query.
// Progress photos never go to any LLM; no job payload or tool output references them.
import * as z from 'zod'
import { Id, Instant, Kg, LocalDate, Row } from './common'
import { FileUrl, ImageType } from './files'

export const Pose = z.enum(['front', 'side', 'back'])
export type Pose = z.infer<typeof Pose>

export const ProgressPhoto = Row.extend({
  taken_at: Instant,
  date: LocalDate,
  pose: Pose,
  url: FileUrl,
  /** The day's trend weight. */
  weight_kg: Kg.nullable(),
  nearest_scan_id: Id.nullable(),
  note: z.string().nullable(),
})
export type ProgressPhoto = z.infer<typeof ProgressPhoto>

/** Query of POST /api/photos (body: the downscaled, EXIF-stripped image as Binary). */
export const PhotoUploadQuery = z.object({
  id: Id,
  taken_at: Instant,
  pose: Pose,
  content_type: ImageType,
  note: z.string().trim().max(500).optional(),
})
export type PhotoUploadQuery = z.infer<typeof PhotoUploadQuery>

/** Query of GET /api/photos. */
export const PhotoListQuery = z.object({ pose: Pose.optional(), from: LocalDate.optional(), to: LocalDate.optional() })
export type PhotoListQuery = z.infer<typeof PhotoListQuery>
