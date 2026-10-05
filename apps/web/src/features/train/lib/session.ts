// Owns: opening a session — starting one here (seed the working copy from a template, the week plan or blank, issue
// POST /api/sessions through the write chain, open the logger at once, online or not) and reading one (the working
// copy, folded together with GET /api/sessions/:id whenever the Worker has it; read straight from the Worker when
// this phone has no copy, e.g. a session from history).
import { endpoints } from '@fitness/shared/api'
import { localDate } from '@fitness/shared/engine'
import type { SessionCreate, SessionOrigin, Template, TemplateExerciseInput } from '@fitness/shared/schemas'
import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useApiQuery } from '../../../api'
import { TEMPLATES_STALE_MS } from '../queries'
import { usePendingWrites } from '../../../offline'
import { fromServer, mergeServer, seedSession, type LoggerSession } from './logger-model'
import { loggerState, useLoggerSession } from './logger-store'
import { flushSession, syncStart, useTrainingWriters } from './sync'

/** The session logger's route. */
export const sessionPath = (sessionId: string) => `/train/session/${sessionId}`

export interface StartInput {
  origin: SessionOrigin
  template_id: string | null
  /** Shown in the logger header (template or week-plan session name). */
  name: string | null
  exercises: readonly TemplateExerciseInput[]
}

/** Start a session and open the logger; the start write is queued when offline. */
export function useStartSession(): (input: StartInput) => void {
  const navigate = useNavigate()
  useTrainingWriters()
  return useCallback(
    (input: StartInput) => {
      const id = crypto.randomUUID()
      const started_at = new Date().toISOString()
      loggerState().put(seedSession({ id, date: localDate(started_at), started_at, ...input }))
      void syncStart(id)
      void navigate(sessionPath(id))
    },
    [navigate],
  )
}

export interface SessionRead {
  session: LoggerSession | undefined
  /** Loading with no working copy yet. */
  isLoading: boolean
  /** The read failed and there is no working copy (404: no such session). */
  error: unknown
  refetch: () => void
}

/** The templates list (names for headers and recent sessions), shared and cached. */
export function useTemplates() {
  return useApiQuery(endpoints.training.listTemplates, {}, { staleTime: TEMPLATES_STALE_MS })
}

export function templateName(templates: readonly Template[] | undefined, id: string | null): string | null {
  return (id && templates?.find((t) => t.id === id)?.name) || null
}

export function useSession(id: string): SessionRead {
  useTrainingWriters()
  const local = useLoggerSession(id)
  const starts = usePendingWrites(endpoints.training.startSession)
  // The Worker cannot answer for a session whose start is still queued on this phone.
  const queuedStart = useMemo(
    () =>
      starts.find((w) => (w.body as SessionCreate | undefined)?.id === id)?.body as SessionCreate | undefined,
    [starts, id],
  )
  const templates = useTemplates()
  const server = useApiQuery(
    endpoints.training.getSession,
    { params: { id } },
    { enabled: local?.start !== 'pending' && !queuedStart, retry: (n, error) => error.transient && n < 2 },
  )
  const name = templateName(templates.data, local?.template_id ?? server.data?.template_id ?? null)

  // Started elsewhere in the app (builder, AI page) while offline: open it from the queued start and the template.
  useEffect(() => {
    if (local || !queuedStart || templates.isLoading) return
    const template = templates.data?.find((t) => t.id === queuedStart.template_id)
    const seeded = seedSession({
      id,
      date: localDate(queuedStart.started_at),
      started_at: queuedStart.started_at,
      origin: queuedStart.origin,
      template_id: queuedStart.template_id,
      name: template?.name ?? null,
      exercises: queuedStart.exercises ?? template?.exercises ?? [],
    })
    loggerState().put({ ...seeded, start: 'sent' })
  }, [local, queuedStart, templates.isLoading, templates.data, id])

  const data = server.data
  useEffect(() => {
    if (!data) return
    const state = loggerState()
    if (state.sessions[id]) state.update(id, (current) => mergeServer(current, data, name))
    else state.put(fromServer(data, name))
  }, [data, id, name])

  // A copy seeded here whose start never went out (the app closed first) sends it now.
  useEffect(() => {
    if (local?.start === 'pending') void syncStart(id)
  }, [local?.start, id])

  // Typing still settling goes out when Aaron leaves the page or the app.
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && flushSession(id)
    document.addEventListener('visibilitychange', hide)
    return () => {
      document.removeEventListener('visibilitychange', hide)
      flushSession(id)
    }
  }, [id])

  return {
    session: local,
    isLoading: !local && (server.isLoading || queuedStart !== undefined),
    error: local ? null : server.error,
    refetch: () => void server.refetch(),
  }
}
