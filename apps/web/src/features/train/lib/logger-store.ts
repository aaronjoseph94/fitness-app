// Owns: where the session logger's working copies and the rest timer live — a Zustand store persisted in
// localStorage (a reload, an app update or a dead tab mid-session loses nothing), pruned of old copies, plus the
// logger's last write problem (not persisted). Server data still belongs to TanStack Query; this is the local draft.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { LoggerSession } from './logger-model'

/** One rest countdown at a time, started when a set is ticked done. */
export interface RestTimer {
  session_id: string
  exercise_id: string
  /** Epoch ms when the rest ends. */
  ends_at: number
  /** Length of this rest in seconds (for the progress bar). */
  total_sec: number
}

interface LoggerState {
  sessions: Record<string, LoggerSession>
  rest: RestTimer | null
  /** A write the Worker refused, in plain words, for the logger's snackbar. */
  problem: string | null
  put: (session: LoggerSession) => void
  /** Apply `fn` to a working copy (no-op when absent); stamps `touched`. */
  update: (id: string, fn: (session: LoggerSession) => LoggerSession) => void
  /** Drop a working copy (the session was deleted) and its rest timer. */
  remove: (id: string) => void
  startRest: (timer: Omit<RestTimer, 'ends_at'>) => void
  extendRest: (seconds: number) => void
  clearRest: () => void
  setProblem: (problem: string | null) => void
}

const DAY_MS = 86_400_000
/** Unfinished copies are kept two weeks (a session left open), finished ones three days (the summary screen). */
const KEEP_OPEN_MS = 14 * DAY_MS
const KEEP_FINISHED_MS = 3 * DAY_MS

function prune(sessions: Record<string, LoggerSession>, now: number): Record<string, LoggerSession> {
  return Object.fromEntries(
    Object.entries(sessions).filter(([, s]) => {
      const age = now - s.touched
      // A finished copy with a queued finish or unsent writes stays until the open-session limit.
      const settled = s.finished && !s.finished.queued && s.to_delete.length === 0
      return age < (settled ? KEEP_FINISHED_MS : KEEP_OPEN_MS)
    }),
  )
}

export const useLoggerStore = create<LoggerState>()(
  persist(
    (set) => ({
      sessions: {},
      rest: null,
      problem: null,
      put: (session) =>
        set((s) => ({ sessions: { ...s.sessions, [session.id]: { ...session, touched: Date.now() } } })),
      update: (id, fn) =>
        set((s) => {
          const current = s.sessions[id]
          if (!current) return s
          return { sessions: { ...s.sessions, [id]: { ...fn(current), touched: Date.now() } } }
        }),
      remove: (id) =>
        set((s) => {
          const { [id]: _gone, ...sessions } = s.sessions
          return { sessions, rest: s.rest?.session_id === id ? null : s.rest }
        }),
      startRest: (timer) =>
        set({
          rest: timer.total_sec > 0 ? { ...timer, ends_at: Date.now() + timer.total_sec * 1000 } : null,
        }),
      extendRest: (seconds) =>
        set((s) =>
          s.rest
            ? {
                rest: {
                  ...s.rest,
                  ends_at: Math.max(Date.now(), s.rest.ends_at) + seconds * 1000,
                  total_sec: s.rest.total_sec + seconds,
                },
              }
            : s,
        ),
      clearRest: () => set({ rest: null }),
      setProblem: (problem) => set({ problem }),
    }),
    {
      name: 'fitness.train.logger',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ sessions: prune(s.sessions, Date.now()), rest: s.rest }),
    },
  ),
)

/** The working copy of one session (undefined until seeded or read from the Worker). */
export function useLoggerSession(id: string | undefined): LoggerSession | undefined {
  return useLoggerStore((s) => (id ? s.sessions[id] : undefined))
}

/** Read the store outside React (write chain, event handlers that must see the latest state). */
export const loggerState = () => useLoggerStore.getState()
