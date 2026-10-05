// Owns: reading Ask AI chats back — a thread's messages with each reply's proposals at their status now (one lookup
// for the whole thread), or the thread list (each thread's opening question, most recently active first).
import type { ChatMessage, ChatProposal } from '@fitness/shared/schemas'
import type { Deps } from '../../../lib/deps'
import { resolveProposals } from './proposals'
import { storedCalls, threadOpenings, threadRows, toChatMessage, type ChatRow, type ProposalRef } from './store'

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

/** One assistant row as a ChatMessage with what its calls created, status now. */
export async function withProposals(deps: Deps, assistant: ChatRow): Promise<ChatMessage> {
  const refs = refsOf(assistant)
  if (!refs.length) return toChatMessage(assistant)
  return toChatMessage(assistant, pick(refs, await resolveProposals(deps, refs)))
}

export async function chatHistory(deps: Deps, query: { thread_id?: string }): Promise<ChatMessage[]> {
  if (!query.thread_id) return (await threadOpenings(deps)).map((r) => toChatMessage(r))
  const rows = await threadRows(deps, query.thread_id)
  const refs = rows.flatMap(refsOf)
  const resolved = refs.length ? await resolveProposals(deps, refs) : new Map<string, ChatProposal>()
  return rows.map((r) => toChatMessage(r, pick(refsOf(r), resolved)))
}
