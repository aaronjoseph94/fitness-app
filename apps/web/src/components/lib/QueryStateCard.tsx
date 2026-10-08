// Owns: what a read shows before it has data — a chart-shaped skeleton card while it loads (the title and description
// lines of a ChartCard, line for line, over a block of the chart's height), then a 2a banner that says why: the info
// banner when offline with nothing saved on this phone yet, the warning banner for a sign-in that expired or the
// server's answer, with "Try again" on its right.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../api'
import { tokens } from '../../theme'
import { Banner } from './Banner'

/**
 * Still loading (show the skeleton). A read without data that is paused (offline: TanStack holds the retry until the
 * phone is back online) is not loading: it shows the offline card instead of a skeleton forever.
 */
export function isQueryLoading(query: Pick<UseQueryResult, 'isPending' | 'fetchStatus'>): boolean {
  return query.isPending && query.fetchStatus !== 'paused'
}

/** Why a read failed, in the app's calm voice. `offline`: paused without data. */
function errorText(error: ApiError | null, what: string, offline: boolean): string {
  const notHereYet = `You're offline and ${what} hasn't been loaded on this phone yet. It fills in once you're back online.`
  if (offline) return notHereYet
  if (!error) return `Couldn't load ${what}.`
  switch (error.kind) {
    case 'network':
      return notHereYet
    case 'auth-expired':
      return `Your sign-in expired. Sign in again to load ${what}.`
    case 'invalid-response':
      return `The server sent ${what} in a shape this version of the app doesn't expect. Reloading the app usually fixes it.`
    default:
      return `Couldn't load ${what}${error.status ? ` (HTTP ${error.status})` : ''}. ${error.message}`
  }
}

export interface QueryStateCardProps {
  /** A read that has no data yet. */
  query: Pick<UseQueryResult<unknown, ApiError>, 'isPending' | 'fetchStatus' | 'error' | 'refetch'>
  /** What it reads, for the error text: "the weight trend". */
  what: string
  /** Height of the skeleton's chart block: the chart's whole frame (legend, unit caption and plot). Default 200. */
  height?: number
}

/** The skeleton while `query` loads, otherwise its error banner. Render it only while the read has no data. */
export function QueryStateCard({ query, what, height = 200 }: QueryStateCardProps) {
  if (isQueryLoading(query))
    return (
      <Card data-testid="chart-skeleton" aria-busy="true" sx={{ px: `${tokens.pad.card.x}px`, pt: `${tokens.pad.header.top}px`, pb: `${tokens.pad.card.y}px` }}>
        {/* The same line boxes as ChartCard's title and description, so the loaded card has the skeleton's height. */}
        <Box sx={{ fontSize: tokens.font.size.cardTitle, lineHeight: tokens.font.leading.cardTitle }}>
          <Skeleton variant="text" width="40%" />
        </Box>
        <Box sx={{ mt: '3px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small }}>
          <Skeleton variant="text" width="65%" />
        </Box>
        <Skeleton variant="rounded" height={height} sx={{ mt: '14px', borderRadius: `${tokens.radius.control}px` }} />
      </Card>
    )
  const offline = query.fetchStatus === 'paused'
  const retry = !offline && query.error?.kind !== 'auth-expired'
  // 2a: an offline read is the calm info banner; a failure is the warning banner, with the retry on its right.
  return (
    <Banner
      tone={offline || query.error?.kind === 'network' ? 'info' : 'warning'}
      role="alert"
      testId="load-error"
      action={
        retry ? (
          <Button variant="outlined" size="small" onClick={() => void query.refetch()}>
            Try again
          </Button>
        ) : undefined
      }
    >
      {errorText(query.error, what, offline)}
    </Banner>
  )
}
