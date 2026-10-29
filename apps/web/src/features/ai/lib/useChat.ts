// Owns: Ask AI data on the web — the open thread's messages grouped into turns (question, tool results, reply), the
// thread list, sending a message with what it carries and when he typed it (answered in the request, sent straight out
// even while other writes wait in the queue; the question shows at once, a failed send keeps its id and time so a retry
// replays instead of running twice), a message queued offline (it shows in the thread as waiting and is answered when
// the queue flushes, which refreshes the thread), a turn whose answer is still coming (a replay answered 'turn_running',
// or a queued message just delivered: what it logged shows with "Still working on the answer…" while the thread is
// polled every 3 s for up to 90 s), deleting a whole chat for good, and refreshing the rest of the app after a turn that
// logged, moved the forecast or called tools.
import { endpoints } from '@fitness/shared/api'
import type { ChatAttachmentRef, ChatMessage, ChatSend } from '@fitness/shared/schemas'
import { hashKey, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { apiQueryKey, problemText, useApiMutation, useApiQuery, write, type WriteOutcome } from '../../../api'
import { usePendingWrites } from '../../../offline'
import { useThreadStore } from './thread-store'

export interface Turn {
  key: string
  question: Pick<ChatMessage, 'id' | 'content' | 'created_at'>
  /** Tool rows of the turn (role tool), in call order. */
  tools: ChatMessage[]
  reply: ChatMessage | null
  /** The question is on its way; no reply yet. */
  waiting: boolean
  /** The question waits in this device's offline queue: it is sent, and answered, when the connection is back. */
  queued: boolean
  /**
   * The question reached the Worker but its answer is not stored yet: what it already logged, and whether the poll
   * for the answer has given up (`late`). Null once the reply is there, or when nothing is awaited.
   */
  stillWorking: { receipts: ChatMessage['receipts']; late: boolean } | null
}

/** How often, and for how long, the open thread is polled for an answer that is still coming. */
const POLL_MS = 3_000
const POLL_MAX_MS = 90_000

/** A message whose answer is awaited: its thread, when the wait began, and the receipts that came back already. */
interface Awaited {
  thread_id: string
  since: number
  receipts: ChatMessage['receipts']
}

/** Ids of the questions in `messages` that have their reply. */
function answered(messages: readonly ChatMessage[] | undefined): Set<string> {
  return new Set(groupTurns(messages ?? []).flatMap((t) => (t.reply ? [t.question.id] : [])))
}

/** Logs, a moved forecast and proposals change Today, Log, Train and Progress: refresh everything but `keepKey`. */
function refreshOthers(queryClient: QueryClient, keepKey: readonly unknown[]): void {
  const keep = hashKey(keepKey)
  void queryClient.invalidateQueries({ queryKey: ['api'], predicate: (q) => hashKey(q.queryKey) !== keep })
}

/** Messages (oldest first) → turns. A tool or reply before any question (cut history) starts its own turn. */
export function groupTurns(messages: readonly ChatMessage[]): Turn[] {
  const turns: Turn[] = []
  for (const m of messages) {
    let turn = turns.at(-1)
    if (m.role === 'user' || !turn || turn.reply) {
      turn = {
        key: m.id,
        question: m.role === 'user' ? m : { id: m.id, content: '', created_at: m.created_at },
        tools: [],
        reply: null,
        waiting: false,
        queued: false,
        stillWorking: null,
      }
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
  // Messages whose answer is still coming, by message id.
  const [awaiting, setAwaiting] = useState<ReadonlyMap<string, Awaited>>(new Map())
  const awaitingRef = useRef(awaiting)
  awaitingRef.current = awaiting
  const thread = useApiQuery(
    endpoints.ai.chatHistory,
    { query: { thread_id: threadId } },
    {
      enabled: !fresh,
      staleTime: 60_000,
      // Poll while a message of this thread awaits its answer, for at most POLL_MAX_MS from when the wait began.
      refetchInterval: (query) => {
        const done = answered(query.state.data)
        const now = Date.now()
        for (const [id, a] of awaitingRef.current)
          if (a.thread_id === threadId && !done.has(id) && now - a.since < POLL_MAX_MS) return POLL_MS
        return false
      },
    },
  )
  const await_ = (id: string, a: Awaited) => setAwaiting((m) => new Map(m).set(id, a))
  const [asking, setAsking] = useState<ChatSend | null>(null)
  const [error, setError] = useState<string | null>(null)
  const failed = useRef<ChatSend | null>(null)
  // Messages of this thread still in the offline queue (live from IndexedDB, so they survive a reload).
  const pending = usePendingWrites(endpoints.ai.chat)
  const queuedHere = pending.flatMap((w) => {
    // Stored as the caller wrote it: ChatSend's input (the queue's typing widens it).
    const body = w.body as ChatSend | undefined
    return body && body.thread_id === threadId ? [{ ...body, queued_at: w.created_at }] : []
  })

  // A fresh thread whose first message was queued has nothing to load until the queue delivers it; once it has, the
  // thread is stored on the Worker, so load it (the flush's refresh then fills in the reply).
  const hadQueued = useRef(false)
  useEffect(() => {
    if (queuedHere.length > 0) {
      hadQueued.current = true
      return
    }
    if (!hadQueued.current) return
    hadQueued.current = false
    const store = useThreadStore.getState()
    if (store.threadId === threadId && store.fresh) store.markStored()
  }, [queuedHere.length, threadId])

  // A queued message that left the queue was delivered: its reply may still be coming (the replay can be cut off while
  // the turn runs on), so its thread waits for it like a 'turn_running' answer.
  const queuedBefore = useRef<ReadonlyMap<string, string>>(new Map())
  const queuedNow = pending.flatMap((w) => {
    const body = w.body as ChatSend | undefined
    return body ? [`${body.id}:${body.thread_id}`] : []
  })
  const queuedSig = queuedNow.join(',')
  useEffect(() => {
    const now = new Map(queuedNow.map((pair) => pair.split(':') as [string, string]))
    const gone = [...queuedBefore.current].filter(([id]) => !now.has(id))
    queuedBefore.current = now
    if (gone.length === 0) return
    const since = Date.now()
    setAwaiting((m) => {
      const next = new Map(m)
      for (const [id, thread_id] of gone) next.set(id, { thread_id, since, receipts: [] })
      return next
    })
    // queuedNow is derived from `pending`; its signature is the dependency.
  }, [queuedSig])

  // The awaited answer arrived: stop waiting, and refresh what its proposals and logs changed elsewhere.
  const data = thread.data
  useEffect(() => {
    const done = answered(data)
    const arrived = [...awaitingRef.current].filter(([id, a]) => a.thread_id === threadId && done.has(id))
    if (arrived.length === 0) return
    setAwaiting((m) => {
      const next = new Map(m)
      for (const [id] of arrived) next.delete(id)
      return next
    })
    refreshOthers(queryClient, threadKey(threadId))
  }, [data, threadId, queryClient])

  // Re-render when the earliest wait of this thread runs out, so its line says the poll has stopped.
  const [, setTick] = useState(0)
  useEffect(() => {
    const ends = [...awaiting.values()]
      .filter((a) => a.thread_id === threadId)
      .map((a) => a.since + POLL_MAX_MS - Date.now())
      .filter((ms) => ms > 0)
    if (ends.length === 0) return
    const timer = setTimeout(() => setTick((n) => n + 1), Math.min(...ends) + 50)
    return () => clearTimeout(timer)
  }, [awaiting, threadId])

  const mutation = useMutation<WriteOutcome<typeof endpoints.ai.chat>, Error, ChatSend>({
    networkMode: 'always',
    // Online it is answered in the request (a turn-length timeout), even while other writes wait in the queue: chat
    // depends on none of them. Offline, or when the network drops, it is queued.
    mutationFn: (body) => write(endpoints.ai.chat, { body }, { independent: true }),
    onSuccess: (outcome, body) => {
      failed.current = null
      // Queued: the pending list shows it; the flush refreshes everything when it is answered.
      if (outcome.status === 'queued') return
      const turn = outcome.data
      const key = threadKey(body.thread_id)
      // A replay whose turn is still running (or was cut off) carries what it logged, not the answer: the question and
      // its tool rows go in the thread, the receipts wait beside it, and the thread is polled until the answer is stored.
      const running = turn.error === 'turn_running'
      const rows = [turn.message, ...turn.tool_messages, ...(running ? [] : [turn.reply])]
      const ids = new Set(rows.map((m) => m.id))
      queryClient.setQueryData<ChatMessage[]>(key, (old = []) => [
        ...old.filter((m) => !ids.has(m.id)),
        ...rows,
      ])
      if (running)
        await_(turn.message.id, {
          thread_id: body.thread_id,
          since: Date.now(),
          receipts: turn.reply.receipts,
        })
      const store = useThreadStore.getState()
      if (store.threadId === body.thread_id && store.fresh) store.markStored()
      void queryClient.invalidateQueries({
        queryKey: apiQueryKey(endpoints.ai.chatHistory, { query: {} }),
        exact: true,
      })
      // Logs, a moved forecast and proposals change Today, Log, Train and Progress: refresh everything else on screen.
      if (turn.reply.tool_calls?.length || turn.reply.receipts.length || turn.reply.forecast)
        refreshOthers(queryClient, key)
    },
    onError: (e, body) => {
      failed.current = body
      setError(problemText(e))
    },
    onSettled: () => setAsking(null),
  })

  // Deleting does not go through the offline queue (the endpoint is online-only), so a device without a connection
  // reports it next to the composer rather than pretending the chat is gone.
  const deletion = useApiMutation(endpoints.ai.chatDelete, {
    onSuccess: (_outcome, { query }) => {
      const gone = query.thread_id
      // The thread is gone on the server: its cached pages must not be served back from disk offline either.
      queryClient.removeQueries({ queryKey: threadKey(gone) })
      void queryClient.invalidateQueries({
        queryKey: apiQueryKey(endpoints.ai.chatHistory, { query: {} }),
        exact: true,
      })
      // Deleting the chat that is open leaves nothing to show, so a fresh one takes its place.
      const store = useThreadStore.getState()
      if (store.threadId === gone) store.startNew()
    },
    onError: (e) => {
      // Nothing was sent, so the composer must not refill with an older failed question.
      failed.current = null
      setError(problemText(e))
    },
  })

  /** Delete one chat and every message in it; the open chat is replaced by a new one when it is the one that went. */
  const remove = (thread_id: string): void => {
    setError(null)
    deletion.mutate({ query: { thread_id } })
  }

  /**
   * Send `content` on the open thread with what it carries; false when it is empty or a send is already running. A retry
   * of the failed text replays that message (same id, same attachments).
   */
  const send = (content: string, attachments: ChatAttachmentRef[] = []): boolean => {
    const text = content.trim()
    if (!text || mutation.isPending) return false
    const retry = failed.current
    const body: ChatSend =
      retry && retry.thread_id === threadId && retry.content === text
        ? retry
        : // When he typed it: the Worker reads "yesterday" against it, also when the queue sends it hours later.
          {
            id: crypto.randomUUID(),
            thread_id: threadId,
            content: text,
            sent_at: new Date().toISOString(),
            attachments,
          }
    setError(null)
    setAsking(body)
    mutation.mutate(body)
    return true
  }

  const messages = fresh ? [] : (thread.data ?? [])
  const turns = groupTurns(messages)
  const now = Date.now()
  for (const t of turns) {
    const a = awaiting.get(t.question.id)
    if (a && !t.reply && a.thread_id === threadId)
      t.stillWorking = { receipts: a.receipts, late: now - a.since >= POLL_MAX_MS }
  }
  const shown = new Set(messages.map((m) => m.id))
  const queued = queuedHere.filter((b) => !shown.has(b.id))
  for (const b of queued)
    turns.push({
      key: b.id,
      question: { id: b.id, content: b.content, created_at: b.queued_at },
      tools: [],
      reply: null,
      waiting: false,
      queued: true,
      stillWorking: null,
    })
  if (
    asking &&
    asking.thread_id === threadId &&
    !shown.has(asking.id) &&
    !queued.some((b) => b.id === asking.id)
  )
    turns.push({
      key: asking.id,
      question: { id: asking.id, content: asking.content, created_at: new Date().toISOString() },
      tools: [],
      reply: null,
      waiting: true,
      queued: false,
      stillWorking: null,
    })

  return {
    threadId,
    turns,
    loading: !fresh && thread.isPending && queued.length === 0,
    // Offline with only queued messages and no copy of the thread yet, there is nothing to report: they show as waiting.
    loadError: thread.isError && queued.length === 0 ? problemText(thread.error) : null,
    sending: mutation.isPending,
    /** A delete is in flight (the confirm's button reads "Deleting…" and both buttons are disabled). */
    deleting: deletion.isPending,
    error,
    /** The text of the last failed send, to put back in the composer. */
    failedText: error ? (failed.current?.content ?? null) : null,
    clearError: () => setError(null),
    send,
    remove,
  }
}
