// Owns: the /train/session/:id page — the logger while the session runs (or while a finished one is edited), the
// finish summary once it is finished,
// and the loading / not-found states when this phone has no working copy and the Worker can't (yet) answer (under the
// page's "Session" h1, so every state names the page).
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { EmptyState, LoadProblem, PageHeader } from '../../../components'
import { isApiError } from '../../../api'
import { FinishSummary } from './FinishSummary'
import { useSession } from './session'
import { SessionLogger } from './SessionLogger'

export function SessionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session, isLoading, error, refetch } = useSession(id)

  if (session)
    return session.finished && !session.editing ? <FinishSummary session={session} /> : <SessionLogger session={session} />
  if (isLoading)
    return (
      <Titled>
        <Box sx={{ display: 'grid', placeItems: 'center', py: 16 }}>
          <CircularProgress aria-label="Loading session" />
        </Box>
      </Titled>
    )
  if (isApiError(error) && error.status === 404)
    return (
      <Titled>
        <EmptyState
          title="Session not found"
          body="It may have been started on another device that hasn't synced yet."
          action={{ label: 'Back to Train', onClick: () => void navigate('/train') }}
        />
      </Titled>
    )
  return (
    <Titled>
      <LoadProblem what="This session" error={error} onRetry={refetch} />
    </Titled>
  )
}

/** A state with no session to name yet, under the route's own title as the page h1. */
function Titled({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ display: 'grid', gap: 4, minWidth: 0 }}>
      <PageHeader title="Session" />
      {children}
    </Box>
  )
}
