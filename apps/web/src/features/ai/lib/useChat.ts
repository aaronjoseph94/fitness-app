// Owns: Ask AI data on the web — the open thread's messages grouped into turns (question, tool results, reply), the
// thread list, sending a message (answered in the request; the question shows at once, a failed send keeps its id so
// a retry replays instead of running twice), and refreshing the rest of the app after a turn that called tools.
import { endpoints } from '@fitness/shared/api'
import type { ChatMessage, ChatSend, ChatSent } from '@fitness/shared/schemas'
import { hashKey, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { apiQueryKey, call, useApiQuery } from '../../../api'
import { problemText } from '../../quick-log'
import { useThreadStore } from './thread-store'

/** A turn takes up to ~55 s on the Worker (several model calls and tools); wait a little longer than that. */
const SEND_TIMEOUT_MS = 75_000

export interface Turn {
  key: string
  question: Pick<ChatMessage, 'id' | 'content' | 'created_at'>
  /** Tool rows of the turn (role tool), in call order. */
  tools: ChatMessage[]
  reply: ChatMessage | null
  /** The question is on its way; no reply yet. */
  waiting: boolean
}

/** Messages (oldest first) → turns. A tool or reply before any question (cut history) starts its own turn. */
export function groupTurns(messages: readonly ChatMessage[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    let turn = turns.at(-1)
    if (m.role === 'user' || !turn || turn.reply) {
      turn = { key: m.id, question: m.role === 'user' ? m : { id: m.id, content: '', created_at: m.created_at }, tools: [], reply: null, waiting: false }
      turns.push(turn)
      if (m.role === 'user') continue
    }
    if (m.role === 'tool') turn.tools.push(m)
    else if (m.role === 'assistant') turn.reply = m
  }
  return turns
}

const threadKey = (thread_id: string) => apiQueryKey(endpoints.ai.chatHistory, { query: { thread_id } })

export function useThreads() {
  return useApiQuery(endpoints.ai.chatHistory, { query: {} }, { staleTime: 60_000 })
}

export function useChat() {
  const threadId = useThreadStore((s) => s.threadId)
  const fresh = useThreadStore((s) => s.fresh)
  const queryClient = useQueryClient()
  const thread = useApiQuery(endpoints.ai.chatHistory, { query: { thread_id: threadId } }, { enabled: !fresh, staleTime: 60_000 })
  const [asking, setAsking] = useState<ChatSend | null>(null)
  const [error, setError] = useState<string | null>(null)
  const failed = useRef<ChatSend | null>(null)

  const mutation = useMutation<ChatSent, Error, ChatSend>({
    networkMode: 'always',
    mutationFn: (body) => call(endpoints.ai.chat, { body }, { timeoutMs: SEND_TIMEOUT_MS }),
    onSuccess: (turn, body) => {
      const key = threadKey(body.thread_id)
      queryClient.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old.filter((m) => m.id !== turn.message.id),
        turn.message,
        ...turn.tool_messages,
        turn.reply,
      ])
      const store = useThreadStore.getState()
      if (store.threadId === body.thread_id && store.fresh) store.markStored()
      void queryClient.invalidateQueries({ queryKey: apiQueryKey(endpoints.ai.chatHistory, { query: {} }), exact: true })
      // Logs and proposals change Today, Log, Train and Progress: refresh everything else that is on screen.
      if (turn.reply.tool_calls?.length) {
        const keep = hashKey(key)
        void queryClient.invalidateQueries({ queryKey: ['api'], predicate: (q) => hashKey(q.queryKey) !== keep })
      }
      failed.current = null
    },
    onError: (e, body) => {
      failed.current = body
      setError(problemText(e))
    },
    onSettled: () => setAsking(null),
  })

  /** Send `content` on the open thread; false when it is empty or a send is already running. */
  const send = (content: string): boolean => {
    const text = content.trim()
    if (!text || mutation.isPending) return false
    const retry = failed.current
    const body: ChatSend =
      retry && retry.thread_id === threadId && retry.content === text
        ? retry
        : { id: crypto.randomUUID(), thread_id: threadId, content: text }
    setError(null)
    setAsking(body)
    mutation.mutate(body)
    return true
  }

  const messages = fresh ? [] : (thread.data ?? [])
  const turns = groupTurns(messages)
  if (asking && asking.thread_id === threadId && !messages.some((m) => m.id === asking.id))
    turns.push({ key: asking.id, question: { id: asking.id, content: asking.content, created_at: new Date().toISOString() }, tools: [], reply: null, waiting: true })

  return {
    threadId,
    turns,
    loading: !fresh && thread.isPending,
    loadError: thread.isError ? problemText(thread.error) : null,
    sending: mutation.isPending,
    error,
    /** The text of the last failed send, to put back in the composer. */
    failedText: error ? (failed.current?.content ?? null) : null,
    clearError: () => setError(null),
    send,
  }
}
