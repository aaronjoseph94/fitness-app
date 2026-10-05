// Owns: the reads behind one weekly report — the review (asked for only when the reviews list has the week, so a week
// without one never logs a 404; none → the engine's live metrics instead), the
// week's v_day rows, four weeks of trend, earlier reviews (volume history), next week's plan (absent until week
// plans exist: any error reads as "no plan") and the goal weight the forecast band stops at. `ready` turns true once every read has settled, success or not, which
// is what the Browser Rendering PDF waits for.
import { endpoints } from '@fitness/shared/api'
import { addDays } from '@fitness/shared/engine'
import { isApiError, useApiQuery } from '../../../api'
import { pickWeekPlan } from './series'

/** Days of trend shown before the week (three weeks of context). */
const TREND_LEAD_DAYS = 21

export function useWeeklyReport(range: { week: string; from: string; to: string }) {
  const { week, from, to } = range
  const history = useApiQuery(endpoints.reviews.list, {})
  // null while the list loads; when the list itself fails, ask for the review anyway and read a 404 as "none".
  const listed = history.isSuccess ? history.data.some((r) => r.week === week) : null
  const review = useApiQuery(endpoints.reviews.get, { params: { week } }, { retry: false, enabled: listed === true || history.isError })
  const noReview = listed === false || (review.isError && isApiError(review.error) && review.error.status === 404)
  const metrics = useApiQuery(endpoints.reviews.metrics, { params: { week } }, { enabled: noReview })
  const days = useApiQuery(endpoints.day.range, { query: { from, to } })
  const trend = useApiQuery(endpoints.body.trend, { query: { from: addDays(from, -TREND_LEAD_DAYS), to } })
  const nextStart = addDays(from, 7)
  const plans = useApiQuery(endpoints.weekPlans.list, { query: { week_start: nextStart } }, { retry: false })
  const settings = useApiQuery(endpoints.settings.get, {}, { retry: false, staleTime: 5 * 60_000 })

  const reviewSettled = review.isSuccess || (noReview ? !metrics.isPending : review.isError)
  const ready = reviewSettled && !days.isPending && !trend.isPending && !history.isPending && !plans.isPending && !settings.isPending
  return {
    review: noReview ? null : (review.data ?? null),
    reviewError: review.isError && !noReview ? review.error : null,
    metrics: review.data?.metrics ?? metrics.data ?? null,
    days: days.data ?? null,
    trend: trend.data ?? null,
    history: history.data ?? [],
    nextPlan: plans.isSuccess ? pickWeekPlan(plans.data) : null,
    nextStart,
    goalKg: settings.data?.profile.goal_weight_kg ?? null,
    ready,
    refetch: () => Promise.all([review.refetch(), history.refetch()]),
  }
}
