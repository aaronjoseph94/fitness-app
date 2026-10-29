// Owns: the /api ai attachments route (thin: validate via the shared contract, call the module entry point).
// POST /api/ai/attachments takes a screenshot as an octet-stream body (route() hands Binary bodies over as an ArrayBuffer).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { route } from '../lib/route'
import { uploadAttachment } from '../modules/attachments'

export function mountAiAttachmentRoutes(app: App): void {
  route(app, endpoints.ai.attachment, ({ query, body }, deps) => uploadAttachment(deps, query, body), {
    status: 201,
  })
}
