// Owns: the archived PDF of a weekly report — Browser Rendering (BROWSER.quickAction('pdf')) renders the same page
// Aaron prints (/reports/week/<week>?print=1, Letter, 15 mm margins) through Cloudflare Access with the service token,
// the bytes go to R2 reports/<week>.pdf, the review row records pdf_path, and the caller gets a signed link.
// Without the binding, or with wrangler dev's local binding (no quickAction), it reports pdf_unavailable (501).
import type { SignedFile } from '@fitness/shared/schemas'
import { eq } from 'drizzle-orm'
import { weekly_reviews } from '../../../db'
import type { Deps } from '../../../lib/deps'
import { signFileUrl } from '../../files'

/** The slice of the Browser Rendering binding this module uses (structurally `BrowserRun`). */
interface PdfRenderer {
  quickAction(action: 'pdf', options: Record<string, unknown>): Promise<Response>
}

export type PdfOutcome =
  | { ok: true; file: SignedFile }
  | { ok: false; status: 404 | 501 | 502; error: string; message: string }

const UNAVAILABLE: PdfOutcome = { ok: false, status: 501, error: 'pdf_unavailable', message: 'PDF archive works on the deployed Worker; use Print' }

/** The report page sets this attribute once its data and charts are on the page. */
export const REPORT_READY_SELECTOR = '[data-report-ready="true"]'
const MARGIN = '15mm'

function renderer(deps: Deps): PdfRenderer | null {
  const binding = deps.env.BROWSER as unknown as Partial<PdfRenderer> | undefined
  return binding && typeof binding.quickAction === 'function' ? (binding as PdfRenderer) : null
}

export async function archivePdf(deps: Deps, input: { week: string; week_start: string }): Promise<PdfOutcome> {
  const [row] = await deps.db.select({ id: weekly_reviews.id }).from(weekly_reviews).where(eq(weekly_reviews.week_start, input.week_start))
  if (!row) return { ok: false, status: 404, error: 'not_found', message: `No review for ${input.week} yet` }
  const browser = renderer(deps)
  if (!browser) return UNAVAILABLE

  const { env } = deps
  const url = new URL(`/reports/week/${input.week}?print=1`, env.APP_ORIGIN).toString()
  const headers: Record<string, string> =
    env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET
      ? { 'CF-Access-Client-Id': env.ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': env.ACCESS_CLIENT_SECRET }
      : {}
  let res: Response
  try {
    res = await browser.quickAction('pdf', {
      url,
      setExtraHTTPHeaders: headers,
      emulateMediaType: 'print',
      gotoOptions: { waitUntil: 'networkidle0', timeout: 30_000 },
      waitForSelector: { selector: REPORT_READY_SELECTOR, timeout: 20_000 },
      bestAttempt: true,
      pdfOptions: {
        format: 'letter',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
      },
    })
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    // wrangler dev's local Browser Run binding has no quickAction: same answer as no binding at all.
    if (/does not implement the method|not implemented/i.test(text)) return UNAVAILABLE
    return { ok: false, status: 502, error: 'pdf_failed', message: `Browser Rendering failed: ${text}` }
  }
  if (!res.ok || !(res.headers.get('content-type') ?? '').includes('pdf')) {
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    return { ok: false, status: 502, error: 'pdf_failed', message: `Browser Rendering answered ${res.status}${detail ? `: ${detail}` : ''}` }
  }

  const key = `reports/${input.week}.pdf`
  await env.FILES.put(key, await res.arrayBuffer(), { httpMetadata: { contentType: 'application/pdf', contentDisposition: `inline; filename="weekly-report-${input.week}.pdf"` } })
  await deps.db.update(weekly_reviews).set({ pdf_path: key, updated_at: deps.now().toISOString() }).where(eq(weekly_reviews.id, row.id))
  return { ok: true, file: await signFileUrl(env, key, undefined, deps.now()) }
}
