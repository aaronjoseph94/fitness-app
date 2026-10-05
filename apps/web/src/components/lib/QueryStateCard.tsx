// Owns: the card a read shows before it has data — a chart-shaped skeleton while it loads, then a calm error card that
// says why (offline with nothing saved on this phone yet, sign-in expired, or the server's answer) with a retry.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../api'
import { tokens } from '../../theme'

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
  /** Height of the skeleton's chart block. Default 200. */
  height?: number
}

/** The skeleton while `query` loads, otherwise its error card. Render it only while the read has no data. */
export function QueryStateCard({ query, what, height = 200 }: QueryStateCardProps) {
  if (isQueryLoading(query))
    return (
      <Card data-testid="chart-skeleton" aria-busy="true" sx={{ p: 4 }}>
        <Skeleton variant="text" width="45%" sx={{ fontSize: tokens.font.size.body }} />
        <Skeleton variant="text" width="65%" sx={{ fontSize: tokens.font.size.label }} />
        <Skeleton variant="rounded" height={height} sx={{ mt: 3, borderRadius: `${tokens.radius.control}px` }} />
      </Card>
    )
  const offline = query.fetchStatus === 'paused'
  return (
    <Card data-testid="load-error" role="alert" sx={{ p: 4 }}>
      <Box sx={{ fontSize: tokens.font.size.emphasis, color: tokens.ink.text, lineHeight: 1.5 }}>{errorText(query.error, what, offline)}</Box>
      {!offline && query.error?.kind !== 'auth-expired' && (
        <Button variant="outlined" onClick={() => void query.refetch()} sx={{ mt: 3 }}>
          Try again
        </Button>
      )}
    </Card>
  )
}
