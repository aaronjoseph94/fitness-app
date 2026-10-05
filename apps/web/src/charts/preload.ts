// Owns: loading Recharts — one dynamic import shared by every chart surface, started by the first plot that comes near
// the viewport (or with the page, for the printable report's route), and tracked the way React's `use()` reads a
// thenable so a surface renders synchronously once it has loaded. A second entry point of the chart kit: it stays
// light, so the route table can import it without pulling any chart into the app's entry chunk.
import type * as Recharts from './lib/recharts'

/** The Recharts components a chart surface draws with (./lib/recharts). */
export type RechartsModule = typeof Recharts

interface TrackedPromise<T> extends Promise<T> {
  status?: 'pending' | 'fulfilled' | 'rejected'
  value?: T
  reason?: unknown
}

let loading: TrackedPromise<RechartsModule> | null = null

/** Start loading Recharts, or return the load already under way (the same promise every time until one fails). */
export function preloadCharts(): Promise<RechartsModule> {
  if (loading) return loading
  const promise: TrackedPromise<RechartsModule> = import('./lib/recharts')
  promise.status = 'pending'
  promise.then(
    (module) => {
      promise.status = 'fulfilled'
      promise.value = module
    },
    (reason: unknown) => {
      promise.status = 'rejected'
      promise.reason = reason
      // A later surface tries again (back online, a new deploy).
      if (loading === promise) loading = null
    },
  )
  loading = promise
  return promise
}
