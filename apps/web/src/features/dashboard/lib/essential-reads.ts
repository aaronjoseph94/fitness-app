// Owns: the Dashboard's "is the first load still in flight?" decision. The page's two essentials (the day rows and the
// trend) are read through it, so its skeleton and its error card can never collapse into the same condition.
import type { UseQueryResult } from '@tanstack/react-query'
import { isQueryLoading } from '../../../components'

/**
 * One essential read as this decision reads it: whether the query is still pending, and what its fetch is doing. Only
 * these two fields matter — "has data" is not the question (see below) — so a test can drive the decision directly.
 */
export type EssentialRead = Pick<UseQueryResult, 'isPending' | 'fetchStatus'>

/**
 * Whether the Dashboard is still loading one of its essentials. `isQueryLoading` is the app's one definition of that
 * (components/lib/QueryStateCard): a read that has stopped with nothing to show — a failure, or a read the network
 * paused with nothing saved on this phone — is not loading, it is what the page's error card is for. Reading "has no
 * data" as "still loading" instead makes that card unreachable, which is how an offline first visit became an endless
 * skeleton with no way back on.
 */
export function essentialsLoading(days: EssentialRead, trend: EssentialRead): boolean {
  return isQueryLoading(days) || isQueryLoading(trend)
}
