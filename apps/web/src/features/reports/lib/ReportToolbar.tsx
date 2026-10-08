// Owns: the report's screen-only toolbar (hidden in print and in the archived PDF) — back to Progress, previous/next
// week, Print (the browser dialog), Save PDF (the Worker renders and archives the page; a 501 on local dev shows its
// message), and Draft / Redraft review (queues the weekly_review job and refreshes when it finishes).
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded'
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import PictureAsPdfRounded from '@mui/icons-material/PictureAsPdfRounded'
import PrintRounded from '@mui/icons-material/PrintRounded'
import RefreshRounded from '@mui/icons-material/RefreshRounded'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import type { ReviewAuthor } from '@fitness/shared/schemas'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { call, isApiError, useApiQuery } from '../../../api'
import { tabularNums } from '../../../components'
import { tokens } from '../../../theme'

export interface ReportToolbarProps {
  week: string
  prevWeek: string
  nextWeek: string
  /** The review's author, or null when the week has no review yet. */
  author: ReviewAuthor | null
  /** The week has begun (a week still ahead has nothing to review: no Draft button). */
  started: boolean
  /** Called when a drafted review is ready. */
  onDrafted: () => void
}

type Notice = { severity: 'info' | 'warning' | 'error' | 'success'; text: string; href?: string } | null

const message = (e: unknown) => (isApiError(e) || e instanceof Error ? e.message : 'Something went wrong')

export function ReportToolbar({ week, prevWeek, nextWeek, author, started, onDrafted }: ReportToolbarProps) {
  const [notice, setNotice] = useState<Notice>(null)
  const [savingPdf, setSavingPdf] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = useApiQuery(endpoints.ai.job, { params: { id: jobId ?? '' } }, { enabled: jobId !== null, refetchInterval: 1500, retry: false })

  useEffect(() => {
    const status = job.data?.status
    if (!jobId || (status !== 'done' && status !== 'failed')) return
    setJobId(null)
    setNotice(status === 'done' ? { severity: 'success', text: 'Review drafted.' } : { severity: 'error', text: job.data?.error ?? 'The review job failed.' })
    onDrafted()
  }, [job.data, jobId, onDrafted])

  const savePdf = async () => {
    setSavingPdf(true)
    setNotice(null)
    try {
      const file = await call(endpoints.reviews.pdf, { params: { week } })
      // A popup after an await may be blocked (Safari); the notice keeps a link to the PDF either way.
      window.open(file.url, '_blank', 'noopener')
      setNotice({ severity: 'success', text: 'PDF saved to the archive.', href: file.url })
    } catch (e) {
      const unavailable = isApiError(e) && e.code === 'pdf_unavailable'
      setNotice({ severity: unavailable ? 'info' : 'error', text: message(e) })
    } finally {
      setSavingPdf(false)
    }
  }

  const draft = async () => {
    setNotice({ severity: 'info', text: 'Drafting the review…' })
    try {
      const ref = await call(endpoints.reviews.draft, { params: { week } })
      setJobId(ref.job_id)
    } catch (e) {
      setNotice({ severity: 'error', text: message(e) })
    }
  }

  return (
    <Box className="no-print" sx={{ mb: 6, display: 'grid', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Button component={RouterLink} to="/progress" color="inherit" size="small" startIcon={<ArrowBackRounded />} sx={{ ml: -2, mr: 'auto', color: tokens.ink.label }}>
          Progress
        </Button>
        <Box
          role="group"
          aria-label="Week"
          sx={{ display: 'inline-flex', alignItems: 'center', gap: '2px', p: '2px', border: `1px solid ${tokens.ink.border}`, borderRadius: `${tokens.radius.control}px` }}
        >
          <IconButton component={RouterLink} to={`/reports/week/${prevWeek}`} size="small" aria-label={`Previous week ${prevWeek}`} data-testid="report-prev">
            <ChevronLeftRounded fontSize="small" />
          </IconButton>
          <Box sx={{ px: 2, fontSize: tokens.font.size.small, fontWeight: tokens.font.weight.label, ...tabularNums, color: tokens.ink.text }}>{week}</Box>
          <IconButton component={RouterLink} to={`/reports/week/${nextWeek}`} size="small" aria-label={`Next week ${nextWeek}`} data-testid="report-next">
            <ChevronRightRounded fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button variant="contained" startIcon={<PrintRounded />} onClick={() => window.print()} data-testid="report-print">
          Print
        </Button>
        <Button variant="outlined" startIcon={<PictureAsPdfRounded />} onClick={savePdf} disabled={savingPdf || author === null} data-testid="report-save-pdf">
          {savingPdf ? 'Saving…' : 'Save PDF'}
        </Button>
        {author !== 'claude_mcp' && started && (
          <Button variant="text" startIcon={<RefreshRounded />} onClick={draft} disabled={jobId !== null} data-testid="report-draft">
            {author === null ? 'Draft review' : 'Redraft'}
          </Button>
        )}
      </Box>
      {notice && (
        <Alert severity={notice.severity} onClose={() => setNotice(null)} data-testid="report-notice">
          {notice.text}
          {notice.href && (
            <>
              {' '}
              <Link href={notice.href} target="_blank" rel="noopener">
                Open PDF
              </Link>
            </>
          )}
        </Alert>
      )}
    </Box>
  )
}
