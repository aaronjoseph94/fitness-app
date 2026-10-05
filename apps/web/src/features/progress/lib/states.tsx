// Owns: Progress's loading and error cards — a chart-shaped skeleton while a range loads, and a calm error card that
// says why (offline with nothing saved on this phone, sign-in expired, or the server's answer) with a retry.
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import Skeleton from '@mui/material/Skeleton'
import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError } from '../../../api'
import { tokens } from '../../../theme'

export function ChartSkeleton({ height = 200, testId }: { height?: number; testId?: string }) {
  return (
    <Card data-testid={testId ?? 'chart-skeleton'} aria-busy="true" sx={{ p: 4 }}>
      <Skeleton variant="text" width="45%" sx={{ fontSize: 16 }} />
      <Skeleton variant="text" width="65%" sx={{ fontSize: 13 }} />
      <Skeleton variant="rounded" height={height} sx={{ mt: 3, borderRadius: `${tokens.radius.control}px` }} />
    </Card>
  )
}

/**
 * Still loading (show a skeleton). A read that has no data and is paused (offline: TanStack holds the retry until the
 * phone is back online) is not loading: show the offline card instead of a skeleton forever.
 */
export function isLoading(query: Pick<UseQueryResult, 'isPending' | 'fetchStatus'>): boolean {
  return query.isPending && query.fetchStatus !== 'paused'
}

/** Why a read failed, in the app's calm voice. `offline`: paused without data. */
export function errorText(error: ApiError | null, what: string, offline = false): string {
  if (offline) return `You're offline and ${what} hasn't been loaded on this phone yet. It fills in once you're back online.`
  if (!error) return `Couldn't load ${what}.`
  switch (error.kind) {
    case 'network':
      return `You're offline and ${what} hasn't been loaded on this phone yet. It fills in once you're back online.`
    case 'auth-expired':
      return `Your sign-in expired. Sign in again to load ${what}.`
    case 'invalid-response':
      return `The server sent ${what} in a shape this version of the app doesn't expect. Reloading the app usually fixes it.`
    default:
      return `Couldn't load ${what}${error.status ? ` (HTTP ${error.status})` : ''}. ${error.message}`
  }
}

/** The error card for a read without data: offline (paused), or failed with its ApiError. */
export function ErrorCard({ query, what, testId }: { query: UseQueryResult<unknown, ApiError>; what: string; testId?: string }) {
  const offline = query.fetchStatus === 'paused'
  const error = query.error
  return (
    <Card data-testid={testId ?? 'load-error'} role="alert" sx={{ p: 4 }}>
      <Box sx={{ fontSize: 15, color: tokens.ink.text, lineHeight: 1.5 }}>{errorText(error, what, offline)}</Box>
      {!offline && error?.kind !== 'auth-expired' && (
        <Button variant="outlined" onClick={() => void query.refetch()} sx={{ mt: 3 }}>
          Try again
        </Button>
      )}
    </Card>
  )
}
