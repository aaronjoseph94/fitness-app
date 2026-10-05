// Owns: how every logging write behaves — one mutation hook per endpoint that knows which screens a write makes stale
// (and holds its "saving" state until they have refetched, so the optimistic row never flickers), plus the pending view:
// writes in flight and writes waiting in the offline queue, merged and de-duplicated, for optimistic display.
import { buildPath, endpoints, type Endpoint } from '@fitness/shared/api'
import { useMutationState, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiQueryKey, useApiMutation, type WriteOutcome } from '../../../api'
import type * as z from 'zod'
import { usePendingWrites } from '../../../offline'

const { day, body, nutrition, water, fasting, health } = endpoints

/** What each logging write makes stale. One table, so no caller has to remember. */
const REFRESHES = new Map<Endpoint, readonly Endpoint[]>([
  [body.createWeight, [day.get, day.range, body.trend]],
  [body.updateWeight, [day.get, day.range, body.trend]],
  [body.createMeasurements, [body.trend]],
  [nutrition.createMeal, [nutrition.listMeals, day.get, day.range]],
  [nutrition.updateMeal, [nutrition.listMeals, day.get, day.range]],
  [nutrition.deleteMeal, [nutrition.listMeals, day.get, day.range]],
  [nutrition.createFood, [nutrition.searchFoods]],
  [nutrition.createFavourite, [nutrition.listFavourites]],
  [nutrition.updateFavourite, [nutrition.listFavourites]],
  [water.create, [day.get, day.range]],
  [fasting.start, [fasting.list, day.get, day.range]],
  [fasting.end, [fasting.list, day.get, day.range]],
  [fasting.plan, [fasting.list, day.get, day.range]],
  [fasting.cancel, [fasting.list, day.get, day.range]],
  [health.createSleep, [day.get, day.range]],
  [health.createSteps, [day.get, day.range]],
])

function logMutationKey(endpoint: Endpoint): readonly unknown[] {
  return ['log', endpoint.method, endpoint.path]
}

/** Refetch what a write to `endpoint` made stale (for a write made with `call`, outside useLogMutation). */
export async function refreshAfter(queryClient: QueryClient, endpoint: Endpoint): Promise<void> {
  const stale = REFRESHES.get(endpoint) ?? []
  await Promise.all(stale.map((e) => queryClient.invalidateQueries({ queryKey: apiQueryKey(e) })))
}

/**
 * A logging write. Resolves `{ status: 'saved' }` once the Worker stored it and the affected screens refetched, or
 * `{ status: 'queued' }` as soon as it is safe on this device (it then shows through usePendingLogs until it syncs).
 */
export function useLogMutation<E extends Endpoint>(endpoint: E) {
  const queryClient = useQueryClient()
  return useApiMutation(endpoint, {
    mutationKey: logMutationKey(endpoint),
    onSuccess: async (outcome: WriteOutcome<E>) => {
      // A queued write must not wait on a refetch that may hang until the network times out.
      if (outcome.status === 'saved') await refreshAfter(queryClient, endpoint)
      else void refreshAfter(queryClient, endpoint)
    },
  })
}

/** The request body an endpoint takes, as the caller writes it (optional `body` stripped of its `undefined`). */
type BodyOf<E extends Endpoint> = NonNullable<E['body']> extends z.ZodType ? z.input<NonNullable<E['body']>> : never

/** A write not yet reflected in server data: in flight ('saving') or in the offline queue ('queued'). */
export interface PendingLog<B> {
  /** Path with params filled, e.g. '/api/fasts/4c1…/end'. */
  path: string
  body: B
  queued: boolean
  /** When it was made on this device (UTC instant). */
  at: string
}

interface LooseInput {
  params?: Record<string, string | number>
  body?: unknown
}

/** Writes to `endpoint` not yet reflected in server data, oldest first, each once (queued wins over in flight). */
export function usePendingLogs<E extends Endpoint>(endpoint: E): PendingLog<BodyOf<E>>[] {
  const inflight = useMutationState({
    filters: { mutationKey: logMutationKey(endpoint), status: 'pending' },
    select: (mutation) => ({ input: mutation.state.variables as LooseInput | undefined, at: mutation.state.submittedAt }),
  })
  const queued = usePendingWrites(endpoint)
  return useMemo(() => {
    const seen = new Set<string>()
    const out: PendingLog<BodyOf<E>>[] = []
    const add = (log: PendingLog<BodyOf<E>>) => {
      const id = (log.body as { id?: unknown } | undefined)?.id
      const key = `${log.path}|${typeof id === 'string' ? id : log.at}`
      if (seen.has(key)) return
      seen.add(key)
      out.push(log)
    }
    for (const write of queued) {
      add({ path: write.path.split('?')[0] ?? write.path, body: write.body as BodyOf<E>, queued: true, at: write.created_at })
    }
    for (const { input, at } of inflight) {
      if (!input) continue
      add({
        path: buildPath(endpoint.path, input.params),
        body: input.body as BodyOf<E>,
        queued: false,
        at: new Date(at || Date.now()).toISOString(),
      })
    }
    return out.sort((a, b) => a.at.localeCompare(b.at))
  }, [endpoint, inflight, queued])
}
