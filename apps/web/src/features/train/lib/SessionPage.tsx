// Owns: the /train/session/:id page — the logger while the session runs, the finish summary once it is finished,
// and the loading / not-found states when this phone has no working copy and the Worker can't (yet) answer.
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import { useNavigate, useParams } from 'react-router'
import { EmptyState } from '../../../components'
import { isApiError } from '../../../api'
import { LoadProblem } from '../../quick-log'
import { FinishSummary } from './FinishSummary'
import { useSession } from './session'
import { SessionLogger } from './SessionLogger'

export function SessionPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { session, isLoading, error, refetch } = useSession(id)

  if (session)
    return session.finished ? <FinishSummary session={session} /> : <SessionLogger session={session} />
  if (isLoading)
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', py: 16 }}>
        <CircularProgress aria-label="Loading session" />
      </Box>
    )
  if (isApiError(error) && error.status === 404)
    return (
      <EmptyState
        illustration="training"
        title="Session not found"
        body="It may have been started on another device that hasn't synced yet."
        action={{ label: 'Back to Train', onClick: () => void navigate('/train') }}
      />
    )
  return <LoadProblem what="This session" error={error} onRetry={refetch} />
}
