// Owns: the route error boundary — a calm card with Reload. A failed lazy import after a deploy (stale chunk) is named
// as "a new version is ready", which a reload fixes.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import { isRouteErrorResponse, useRouteError } from 'react-router'

const STALE_CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported/i

export function RouteError() {
  const error = useRouteError()
  const staleChunk = error instanceof Error && STALE_CHUNK.test(error.message)
  const title = staleChunk ? 'A new version is ready' : 'Something went wrong'
  const detail = staleChunk
    ? 'Reload to open it.'
    : isRouteErrorResponse(error)
      ? `${error.status} ${error.statusText}`
      : error instanceof Error
        ? error.message
        : 'An unexpected error happened.'
  if (!staleChunk) console.error(error)
  return (
    <Box sx={{ p: 4, maxWidth: (theme) => theme.breakpoints.values.sm, mx: 'auto' }}>
      <Card component="section" role="alert">
        <CardContent>
          <Typography variant="sectionTitle" component="h2">
            {title}
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, mb: 4, overflowWrap: 'anywhere' }}>
            {detail}
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </CardContent>
      </Card>
    </Box>
  )
}
