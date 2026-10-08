// Owns: the Progress tab's "Weekly reviews" card (SPEC §8: past reviews, each opening its report page and its PDF; 2a
// rows) — a document tile, "Week of …" with the author chip (Claude, or the app's own AI draft), the week's trend
// change, protein and proposals, when it was written, and links to the report and the archived PDF; then a note on
// when the next review comes. Data: GET /api/reviews (newest first).
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import ScheduleRounded from '@mui/icons-material/ScheduleRounded'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import { endpoints } from '@fitness/shared/api'
import { localDate } from '@fitness/shared/engine'
import type { WeeklyReview } from '@fitness/shared/schemas'
import { useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { useApiQuery } from '../../../api'
import { EmptyState, formatNumber, formatShortDate, formatSigned, isQueryLoading, Panel, QueryStateCard, StatusChip } from '../../../components'
import { tokens } from '../../../theme'

/** Claude's review supersedes the app's own draft for the same week (WeeklyReview). */
const AUTHOR = { claude_mcp: { label: 'Claude', tone: 'info' }, gemini: { label: 'AI draft', tone: 'neutral' } } as const
/** Rows shown before "Show all". */
const FIRST_ROWS = 8

const gutter = { px: { xs: '16px', sm: '18px' } } as const
const note = { fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small, color: tokens.ink.secondary } as const

export function WeeklyReviewsSection() {
  const reviews = useApiQuery(endpoints.reviews.list, {})
  const [all, setAll] = useState(false)
  const rows = reviews.data ?? []
  return (
    <Panel title="Weekly reviews" description="Each opens its report page and PDF" padding="none" testId="progress-weekly-reviews">
      {isQueryLoading(reviews) ? (
        <Box sx={{ ...gutter, pt: '4px', pb: '16px', ...note }}>Loading reviews…</Box>
      ) : reviews.isError || !reviews.data ? (
        <Box sx={{ ...gutter, pt: '4px', pb: '16px' }}>
          <QueryStateCard query={reviews} what="the reviews" />
        </Box>
      ) : rows.length === 0 ? (
        <Box sx={{ ...gutter, pb: '16px' }}>
          <EmptyState compact title="No reviews yet" body="The first weekly review is drafted on Sunday at 20:00, or when Claude runs your coach review." />
        </Box>
      ) : (
        <>
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {(all ? rows : rows.slice(0, FIRST_ROWS)).map((r, i) => (
              <ReviewRow key={r.id} review={r} first={i === 0} />
            ))}
          </Box>
          {!all && rows.length > FIRST_ROWS && (
            <Button fullWidth onClick={() => setAll(true)} sx={{ borderTop: `1px solid ${tokens.ink.hairline}`, borderRadius: 0 }}>
              Show all {rows.length}
            </Button>
          )}
          <Box
            sx={{
              mx: { xs: '16px', sm: '18px' },
              mt: '12px',
              mb: '16px',
              py: '12px',
              px: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              borderRadius: `${tokens.radius.control}px`,
              bgcolor: tokens.ink.panel,
              ...note,
              color: tokens.ink.label,
            }}
          >
            <ScheduleRounded aria-hidden sx={{ fontSize: 18, color: tokens.ink.secondary, flex: 'none' }} />
            The next review is drafted on Sunday at 20:00; Claude’s review supersedes the draft when it lands.
          </Box>
        </>
      )}
    </Panel>
  )
}

function ReviewRow({ review: r, first }: { review: WeeklyReview; first: boolean }) {
  const change = r.metrics.trend_change_kg
  const protein = r.metrics.intake_avg.protein_g
  const n = r.proposals.length
  const author = AUTHOR[r.author]
  const summary = [
    change === null ? null : `${formatSigned(change, 1)} kg`,
    protein > 0 ? `protein averaged ${formatNumber(protein)} g` : null,
    n > 0 ? `${n} proposal${n === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <Box
      component="li"
      data-testid="weekly-review-row"
      sx={{
        display: 'flex',
        alignItems: 'center',
        borderTop: `1px solid ${first ? tokens.ink.border : tokens.ink.hairline}`,
        '@media (hover: hover)': { '&:hover': { bgcolor: tokens.ink.panel } },
      }}
    >
      <Link
        component={RouterLink}
        to={`/reports/week/${r.week}`}
        underline="none"
        color="inherit"
        sx={{ ...gutter, flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 3, py: '12px', fontSize: tokens.font.size.small, lineHeight: tokens.font.leading.small }}
      >
        <Box
          aria-hidden
          sx={{
            width: 36,
            height: 36,
            flex: 'none',
            display: 'grid',
            placeItems: 'center',
            borderRadius: `${tokens.radius.control}px`,
            bgcolor: tokens.ink.fill,
            color: tokens.ink.label,
          }}
        >
          <DescriptionOutlined sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', fontWeight: tokens.font.weight.heading, color: tokens.ink.text }}>
            Week of {formatShortDate(r.week_start)}
            <StatusChip tone={author.tone} size="small" label={author.label} />
          </Box>
          {summary && <Box sx={{ color: tokens.ink.secondary }}>{summary}</Box>}
        </Box>
        <Box sx={{ flex: 'none', color: tokens.ink.secondary, fontVariantNumeric: 'tabular-nums' }}>{formatShortDate(localDate(r.created_at))}</Box>
        <ChevronRightRounded aria-hidden sx={{ flex: 'none', fontSize: 18, color: tokens.ink.faint }} />
      </Link>
      {r.pdf_url && (
        <Button variant="text" size="tiny" href={r.pdf_url} target="_blank" rel="noopener" sx={{ flex: 'none', mr: { xs: '8px', sm: '10px' } }}>
          PDF
        </Button>
      )}
    </Box>
  )
}
