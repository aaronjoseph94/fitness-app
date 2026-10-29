// Owns: forgetting an Ask AI chat (DELETE /api/ai/chat). A thread is its rows — there is no thread table — so deleting
// a chat deletes every chat_messages row and every receipt carrying that thread_id, in one batch, then the screenshots
// its messages carried (the attachments module: rows now, R2 objects after the response). What the chat logged stays
// logged (weigh-ins, meals: they are Aaron's data, not the chat's). An id that was never stored is a no-op, so a retry
// or a double tap answers Ok either way. Nothing is logged: message content never reaches a log.
import type { Ok } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { chat_messages } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { deleteThreadAttachments } from '../../attachments'
import { deleteThreadReceipts } from './receipts'

/** DELETE /api/ai/chat: forget one chat for good (its questions, tool rows, replies, receipts and screenshots). */
export async function chatDelete(deps: Deps, query: { thread_id: string }): Promise<Ok> {
  const { db } = deps
  const ids = await db
    .select({ id: chat_messages.id })
    .from(chat_messages)
    .where(eq(chat_messages.thread_id, query.thread_id))
  await db.batch([
    deleteThreadReceipts(deps, query.thread_id),
    db.delete(chat_messages).where(eq(chat_messages.thread_id, query.thread_id)),
  ])
  await deleteThreadAttachments(
    deps,
    ids.map((r) => r.id),
  )
  return { ok: true }
}
