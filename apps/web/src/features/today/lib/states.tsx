// Owns: Today's loading and error cards — a card-shaped skeleton, and a calm error card that says why a read failed
// (offline with nothing saved on this phone yet, sign-in expired, or the server's answer) with a retry.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { tokens } from '../../../theme'

export function CardSkeleton({ height = 160 }: { height?: number }) {
  return (
    <Card aria-busy="true" sx={{ p: 4 }}>
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="rounded" height={height} sx={{ mt: 3, borderRadius: `${tokens.radius.control}px` }} />
    </Card>
  )
}

/**
 * Still loading (show a skeleton). A read without data that is paused (offline: TanStack holds the retry until the
 * phone is back online) is not loading: show the offline card, not a skeleton forever.
 */
export function isLoading(query: Pick<UseQueryResult, 'isPending' | 'fetchStatus'>): boolean {
  return query.isPending && query.fetchStatus !== 'paused'
}

function why(error: ApiError | null, what: string, offline: boolean): string {
  if (offline) return `You're offline and ${what} isn't saved on this phone yet. It appears once you're back online.`
  switch (error?.kind) {
    case 'network':
      return `You're offline and ${what} isn't saved on this phone yet. It appears once you're back online.`
    case 'auth-expired':
      return `Your sign-in expired. Sign in again to see ${what}.`
    case 'invalid-response':
      return `The server sent ${what} in a shape this version doesn't expect. Reloading the app usually fixes it.`
    case 'http':
      return `Couldn't load ${what} (HTTP ${error.status}). ${error.message}`
    default:
      return `Couldn't load ${what}.`
  }
}

/** The error card for a read without data: offline (paused), or failed with its ApiError. */
export function LoadError({ query, what }: { query: UseQueryResult<unknown, ApiError>; what: string }) {
  const offline = query.fetchStatus === 'paused'
  return (
    <Card role="alert" data-testid="load-error" sx={{ p: 4 }}>
      <Box sx={{ fontSize: 15, lineHeight: 1.5, color: tokens.ink.text }}>{why(query.error, what, offline)}</Box>
      {!offline && query.error?.kind !== 'auth-expired' && (
        <Button variant="outlined" onClick={() => void query.refetch()} sx={{ mt: 3 }}>
          Try again
        </Button>
      )}
    </Card>
  )
}
