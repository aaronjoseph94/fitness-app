// Owns: the /api reviews route group (thin: validate via the shared contract, call module entry points).
// GET /api/reviews · GET /api/reviews/:week · GET /api/reviews/:week/metrics · POST /api/reviews/:week/draft ·
// POST /api/reviews/:week/pdf (501 pdf_unavailable without the Browser Rendering binding).
import { endpoints } from '@fitness/shared/api'
import type { App } from '../env'
import { HttpError } from '../lib/http-error'
import { route } from '../lib/route'
import { archiveReviewPdf, getReview, listReviews, requestWeeklyReview, weekMetrics } from '../modules/reviews'

export function mountReviewsRoutes(app: App): void {
  route(app, endpoints.reviews.list, (_, deps) => listReviews(deps))
  route(app, endpoints.reviews.get, ({ params }, deps) => getReview(deps, params.week))
  route(app, endpoints.reviews.metrics, ({ params }, deps) => weekMetrics(deps, params.week))
  route(app, endpoints.reviews.draft, async ({ params }, deps) => {
    const result = await requestWeeklyReview(deps, params.week)
    if ('skipped' in result) throw new HttpError(409, 'claude_review_exists', `Claude already reviewed ${params.week}; its review stands`)
    return result
  })
  route(app, endpoints.reviews.pdf, async ({ params }, deps, c) => {
    const result = await archiveReviewPdf(deps, params.week)
    return result.ok ? result.file : c.json({ error: result.error, message: result.message }, result.status)
  })
}

