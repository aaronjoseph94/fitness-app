// Owns: which Ask AI thread is open — shared by the AI tab and the slide-up panel so both show the same chat — and the
// remembered thread across launches (localStorage; a fresh thread when storage is unavailable).
import { create } from 'zustand'

const KEY = 'ask-ai:thread'

function remembered(): { id: string; fresh: boolean } {
  try {
    const id = localStorage.getItem(KEY)
    if (id) return { id, fresh: false }
  } catch {
    // Private mode or blocked storage: start a new thread.
  }
  return { id: crypto.randomUUID(), fresh: true }
}

function remember(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // Not critical: the thread is still in the history list.
  }
}

interface ThreadState {
  threadId: string
  /** True until the thread's first message is stored: nothing to load yet. */
  fresh: boolean
  open: (threadId: string) => void
  startNew: () => void
  /** The first message of a fresh thread was stored. */
  markStored: () => void
}

export const useThreadStore = create<ThreadState>()((set) => {
  const start = remembered()
  return {
    threadId: start.id,
    fresh: start.fresh,
    open: (threadId) => {
      remember(threadId)
      set({ threadId, fresh: false })
    },
    startNew: () => {
      const threadId = crypto.randomUUID()
      remember(threadId)
      set({ threadId, fresh: true })
    },
    markStored: () =>
      set((s) => {
        remember(s.threadId)
        return { fresh: false }
      }),
  }
})
