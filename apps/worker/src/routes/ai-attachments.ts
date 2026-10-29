// Owns: the /api ai attachments route (thin: validate via the shared contract, call the module entry point).
// POST /api/ai/attachments takes a screenshot as an octet-stream body (route() hands Binary bodies over as an ArrayBuffer).
// A Content-Length over MAX_SCREENSHOT_BYTES is refused before the body is read; the module checks the real size too.
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { MAX_SCREENSHOT_BYTES, tooLarge, uploadAttachment } from '../modules/attachments'

export function mountAiAttachmentRoutes(app: App): void {
  app.on('POST', endpoints.ai.attachment.path, async (c, next) => {
    if (Number(c.req.header('content-length') ?? 0) > MAX_SCREENSHOT_BYTES) throw tooLarge()
    await next()
  })
  route(app, endpoints.ai.attachment, ({ query, body }, deps) => uploadAttachment(deps, query, body), {
    status: 201,
  })
}
