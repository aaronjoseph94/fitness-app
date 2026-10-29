// Owns: reading Ask AI chats back — a thread's messages with each reply's proposals at their status now and the
// receipts its message logged (each with its Undo state now; one lookup each for the whole thread), or the thread list
// (each thread's opening question, most recently active first). A reply still running keeps its empty content, so the
// web keeps polling; one cut off reads INTERRUPTED (store asShown).
import type { ChatMessage, ChatProposal } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { resolveProposals } from './proposals'
import { receiptsOf } from './receipts'
import {
  asShown,
  storedCalls,
  threadOpenings,
  threadRows,
  toChatMessage,
  type ChatRow,
  type ProposalRef,
} from './store'

const refsOf = (row: ChatRow): ProposalRef[] =>
  row.role === 'assistant' ? storedCalls(row).flatMap((c) => c.created ?? []) : []

const pick = (refs: readonly ProposalRef[], resolved: ReadonlyMap<string, ChatProposal>): ChatProposal[] => {
  const seen = new Set<string>()
  return refs.flatMap((r) => {
    const p = resolved.get(r.id)
    if (!p || seen.has(r.id)) return []
    seen.add(r.id)
    return [p]
  })
}

/**
 * One assistant row as a ChatMessage with what its calls created (status now) and what its message logged. A running
 * row reads `running` (a replay passes RUNNING), or INTERRUPTED once stale.
 */
export async function replyMessage(deps: Deps, assistant: ChatRow, running = ''): Promise<ChatMessage> {
  const refs = refsOf(assistant)
  const [resolved, receipts] = await Promise.all([
    refs.length ? resolveProposals(deps, refs) : new Map<string, ChatProposal>(),
    receiptsOf(deps, [assistant.id]),
  ])
  return toChatMessage(
    asShown(assistant, deps.now(), running),
    pick(refs, resolved),
    receipts.get(assistant.id) ?? [],
  )
}

export async function chatHistory(deps: Deps, query: { thread_id?: string }): Promise<ChatMessage[]> {
  if (!query.thread_id) return (await threadOpenings(deps)).map((r) => toChatMessage(r))
  const rows = await threadRows(deps, query.thread_id)
  const refs = rows.flatMap(refsOf)
  const [resolved, receipts] = await Promise.all([
    refs.length ? resolveProposals(deps, refs) : new Map<string, ChatProposal>(),
    receiptsOf(
      deps,
      rows.filter((r) => r.role === 'assistant').map((r) => r.id),
    ),
  ])
  const now = deps.now()
  return rows.map((r) => toChatMessage(asShown(r, now), pick(refsOf(r), resolved), receipts.get(r.id) ?? []))
}
