// Owns: forgetting an Ask AI chat (DELETE /api/ai/chat). A thread is its rows — there is no thread table — so deleting
// a chat deletes every chat_messages row carrying that thread_id, in one statement. An id that was never stored is a
// no-op, so a retry or a double tap answers Ok either way. Nothing is logged: message content never reaches a log.
import type { Ok } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { chat_messages } from '../../../db'
import type { Deps } from '../../../lib/deps'

/** DELETE /api/ai/chat: forget one chat for good (its questions, tool rows and replies). */
export async function chatDelete(deps: Deps, query: { thread_id: string }): Promise<Ok> {
  await deps.db.delete(chat_messages).where(eq(chat_messages.thread_id, query.thread_id))
  return { ok: true }
}
