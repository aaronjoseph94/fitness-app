// Owns: Today's live AI event feed — GET /api/events every 15 s while the app is visible and again on focus, passing
// the previous `server_time` back as `since` (so the phone's clock never matters), merging new and updated events by
// id, and marking the day, plan, trend and note stale when something arrives (a proposal resolved, a note pinned).
import { endpoints } from '@fitness/shared/api'
import type { AiEvent } from '@fitness/shared/schemas'
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { apiQueryKey, call, type ApiError } from '../../../api'

const EVENT_POLL_MS = 15_000
/** Events kept on the phone for the feed; Today shows the newest. */
const KEEP = 30

export interface EventFeed {
  /** Newest first (by updated_at, so a proposal accepted elsewhere moves up). */
  events: AiEvent[]
  /** Pass back as the next `since`. */
  server_time: string
}

const FEED_KEY = ['today', 'event-feed'] as const

/** Merge a page into the feed: one entry per id (the page's copy wins), newest first, at most KEEP. */
function mergeEvents(previous: readonly AiEvent[], page: readonly AiEvent[]): AiEvent[] {
  const byId = new Map(previous.map((e) => [e.id, e]))
  for (const e of page) byId.set(e.id, e)
  return [...byId.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, KEEP)
}

function refreshDependents(queryClient: QueryClient): void {
  for (const endpoint of [endpoints.day.get, endpoints.day.note, endpoints.plan.get, endpoints.body.trend, endpoints.weekPlans.list, endpoints.weekPlans.get]) {
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(endpoint) })
  }
}

export function useEventFeed() {
  const queryClient = useQueryClient()
  // `call` throws ApiError, so the page can show a failed feed with the shared QueryStateCard.
  return useQuery<EventFeed, ApiError>({
    queryKey: FEED_KEY,
    queryFn: async ({ signal }): Promise<EventFeed> => {
      const previous = queryClient.getQueryData<EventFeed>(FEED_KEY)
      const page = await call(endpoints.day.events, { query: previous ? { since: previous.server_time } : {} }, { signal })
      if (previous && page.events.length > 0) refreshDependents(queryClient)
      return { events: mergeEvents(previous?.events ?? [], page.events), server_time: page.server_time }
    },
    refetchInterval: EVENT_POLL_MS,
    // Only while the app is in view; TanStack's focus manager also refetches when it comes back.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: 'always',
    staleTime: 0,
    retry: false,
  })
}

/** Invalidate the feed's dependents after this phone resolved a proposal itself (the poll would catch it in ≤ 15 s). */
export function useRefreshAfterDecision(): () => void {
  const queryClient = useQueryClient()
  return () => {
    refreshDependents(queryClient)
    void queryClient.invalidateQueries({ queryKey: FEED_KEY })
  }
}
