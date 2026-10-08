// Owns: the route error boundary — a calm card with Reload. A failed lazy import after a deploy (stale chunk) is named
// as "a new version is ready", which a reload fixes; the same failure with no network says so instead.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Panel } from '../../../components'

const STALE_CHUNK =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported/i

export function RouteError() {
  const error = useRouteError()
  const staleChunk = error instanceof Error && STALE_CHUNK.test(error.message)
  const offline = staleChunk && typeof navigator !== 'undefined' && !navigator.onLine
  const title = offline ? "You're offline" : staleChunk ? 'A new version is ready' : 'Something went wrong'
  const detail = offline
    ? 'This screen has not been saved on the phone yet. Reload once you are back online.'
    : staleChunk
      ? 'Reload to open it.'
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : error instanceof Error
          ? error.message
          : 'An unexpected error happened.'
  if (!staleChunk) console.error(error)
  return (
    <Box role="alert" sx={{ p: 4, maxWidth: (theme) => theme.breakpoints.values.sm, mx: 'auto' }}>
      <Panel title={title}>
        <Typography variant="body2" sx={{ mb: 4, overflowWrap: 'anywhere' }}>
          {detail}
        </Typography>
        <Button variant="contained" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </Panel>
    </Box>
  )
}
