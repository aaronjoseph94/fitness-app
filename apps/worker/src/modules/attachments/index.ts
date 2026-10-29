// Owns: the attachments module's interface — screenshots (Watch summary, gym app, a label) Aaron attaches to an Ask AI
// message. The browser re-encodes them (EXIF gone) and paints over any box he blacked out; the model reads them in the
// turn's extraction step. Meal photos and scan sheets go to their own flows; a progress photo never comes here.
// Interface:
//   uploadAttachment(deps, query, bytes) → ChatAttachment   idempotent by attachment_id (a replay returns the stored
//        row); 422 unless ≤ MAX_SCREENSHOT_BYTES (600 KB) JPEG/WebP bytes of the declared type with no metadata; the
//        row (message_id null) first, then R2 chat/<id>.(jpg|webp) only from the request that inserted it
//   tooLarge() → HttpError   the 422 image_too_large the route throws on Content-Length before reading the body
//   attachmentImages(deps, { ids, message_id }) → ImageInput[]   claims up to MAX_SCREENSHOTS unclaimed (or already
//        this message's) screenshots for the message and returns their bytes in the order given; others are skipped
//   deleteThreadAttachments(deps, messageIds) → number   rows now, R2 objects after the response
// Registers the 'chat_attachments_expire' sweep step: unclaimed screenshots go after 24 h, claimed ones after 30 days.
// Screenshots are transient: chat_attachments is not in the export or the monthly backup (ExportTable leaves it out).
import { registerSweepStep } from '../jobs'
import { expireAttachments } from './lib/store'

export {
  attachmentImages,
  deleteThreadAttachments,
  MAX_SCREENSHOT_BYTES,
  tooLarge,
  uploadAttachment,
} from './lib/store'

registerSweepStep('chat_attachments_expire', expireAttachments)
